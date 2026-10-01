import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { workerLeg } from "@/lib/finance/commission-config";
import {
  clampRefund,
  defaultRefundAmount,
  detectRefundStage,
  percentOf,
  refundAmountBounds,
  releasedChaptersLabel,
  STAGE_RULES,
  workerPartialDefault,
  type RefundFacts,
  type RefundStage,
} from "@/lib/finance/refund-rules";
import { hasGenerationStarted } from "@/lib/generation/generation-state";
import { cashflowForProject } from "@/lib/services/cashflow";
import { monthKeyOf, projectNetInflow, syncPaymentAmbassadorSnapshot, syncProjectBuckets } from "@/lib/services/finance/buckets";
import { nextId } from "@/lib/services/projects";
import { releaseCommission } from "@/lib/services/ambassador-commission";
import { cancelProjectReferral } from "@/lib/services/ambassador-platform/referrals";
import { recountAmbassador } from "@/lib/services/ambassador-platform/conversions";
import { projectReviewState } from "@/lib/services/chapter-review";
import { notifyClient } from "@/lib/services/client-notify";
import { notifyFinance, notifyUsers } from "@/lib/services/notifications";
import { formatNaira } from "@/lib/utils";

/**
 * Refunds (Phase 6). Writing a RefundRecord is the ONLY thing that reverses a
 * commission (sets a PayoutRecord REVERSED); cancelling a project never does
 * (decision 6). The CFO chooses a stage (which sets the default percentage), the
 * commissions to reverse, and what to pay the worker for chapters already
 * delivered (decision 7). A "keep the money" decision is a 0-amount refund that
 * leaves the project CANCELLED and clears the "decision needed" reminder.
 */

export class RefundError extends Error {}

const STARTED_STATUSES = new Set(["IN_PROGRESS", "AWAITING_CLIENT_INPUT", "SUBMITTED", "IN_QA_REVIEW", "REVISION_NEEDED", "APPROVED", "BALANCE_VERIFIED", "DELIVERED", "SUPERVISOR_CORRECTIONS", "COMPLETED"]);

const PROJECT_SELECT = {
  id: true,
  projectId: true,
  status: true,
  price: true,
  isProBono: true,
  workerPayout: true,
  workerPayoutRate: true,
  ambassadorId: true,
  ambassadorCommission: true,
  parentCommission: true,
  cashflowVersionId: true,
  createdAt: true,
  downpaymentDate: true,
  chapterCount: true,
  additionalData: true,
  workerId: true,
  worker: { select: { fullName: true, userId: true } },
  client: { select: { fullName: true } },
  service: { select: { serviceCode: true } },
} as const;
type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof PROJECT_SELECT }>;

async function loadProject(idOrCode: string): Promise<ProjectRow> {
  const project = await db.project.findFirst({ where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] }, select: PROJECT_SELECT });
  if (!project) throw new RefundError("Project not found");
  return project;
}

async function gatherFacts(project: ProjectRow): Promise<{ facts: RefundFacts; releasedChapters: number[] }> {
  const review = await projectReviewState(project.id);
  const releasedChapters = review.approved;
  const finalDeliverable = await db.projectDeliverable.findFirst({
    where: { projectId: project.id, kind: "FINAL", archivedAt: null },
    select: { status: true },
  });
  const completeReleased = ["DELIVERED", "COMPLETED"].includes(project.status) || finalDeliverable?.status === "RELEASED";
  const orch = await db.orchestratorRun.findUnique({ where: { projectId: project.id }, select: { status: true } }).catch(() => null);
  const workStarted =
    STARTED_STATUSES.has(project.status) || (await hasGenerationStarted(project.id)) || (orch != null && orch.status !== "QUEUED") || releasedChapters.length > 0 || completeReleased;
  return { facts: { now: new Date(), downpaymentVerifiedAt: project.downpaymentDate, workStarted, releasedChapters, completeReleased }, releasedChapters };
}

export interface RefundReversibleRecord {
  id: string;
  leg: string;
  recipientType: string;
  recipientName: string;
  amount: number;
  status: string;
  paid: boolean;
}

export interface RefundPreview {
  projectCode: string;
  clientName: string;
  status: string;
  alreadyRefunded: boolean;
  cancelled: boolean;
  hasDecision: boolean;
  detectedStage: RefundStage;
  stageLabel: string;
  defaultPercent: number;
  moneyIn: number;
  defaultAmount: number;
  amountBounds: { min: number; max: number };
  releasedChapters: number[];
  releasedChaptersLabel: string;
  workerName: string | null;
  workerLegAmount: number;
  workerPartialDefault: number;
  reversible: RefundReversibleRecord[];
}

/** Everything the refund dialog needs: the detected stage, the money in, who can be reversed, the worker partial. */
export async function getRefundPreview(idOrCode: string): Promise<RefundPreview> {
  const project = await loadProject(idOrCode);
  const { facts, releasedChapters } = await gatherFacts(project);
  const stage = detectRefundStage(facts);
  const [moneyIn, s] = await Promise.all([projectNetInflow(db, project.id), cashflowForProject(project)]);
  const legAmount = workerLeg(project, s);
  const reversible = (await db.payoutRecord.findMany({
    where: { projectId: project.id, status: { in: ["ACCRUED", "PAID"] } },
    select: { id: true, leg: true, recipientType: true, recipientName: true, amount: true, status: true },
    orderBy: { createdAt: "asc" },
  })).map((r) => ({ id: r.id, leg: r.leg, recipientType: r.recipientType, recipientName: r.recipientName, amount: Math.round(r.amount), status: r.status, paid: r.status === "PAID" }));
  const hasDecision = (await db.refundRecord.count({ where: { projectId: project.id } })) > 0;

  return {
    projectCode: project.projectId,
    clientName: project.client.fullName,
    status: project.status,
    alreadyRefunded: project.status === "REFUNDED",
    cancelled: project.status === "CANCELLED",
    hasDecision,
    detectedStage: stage,
    stageLabel: STAGE_RULES[stage].label,
    defaultPercent: STAGE_RULES[stage].defaultPercent,
    moneyIn,
    defaultAmount: defaultRefundAmount(stage, moneyIn),
    amountBounds: refundAmountBounds(stage, moneyIn),
    releasedChapters,
    releasedChaptersLabel: releasedChaptersLabel(releasedChapters),
    workerName: project.worker?.fullName ?? null,
    workerLegAmount: legAmount,
    workerPartialDefault: workerPartialDefault(legAmount, releasedChapters),
    reversible,
  };
}

export interface ProcessRefundInput {
  stage: RefundStage;
  /** Whole naira to the client; 0 = keep the money (no refund, project stays as it is). */
  amount: number;
  reason: string;
  /** PayoutRecord ids to reverse (REVERSED, with the reason the recipient sees). */
  reverseRecordIds: string[];
  /** What to pay the worker for delivered chapters (0 = nothing). */
  workerPartial?: number;
  bankConfirmationFileId?: string | null;
}

export interface ProcessRefundResult {
  refundId: string;
  refunded: number;
  reversed: number;
  workerPaid: number;
  status: string;
}

/** Process a refund decision. The only producer of REVERSED PayoutRecords. */
export async function processRefund(idOrCode: string, input: ProcessRefundInput, actorId: string): Promise<ProcessRefundResult> {
  const project = await loadProject(idOrCode);
  if (project.status === "REFUNDED") throw new RefundError("This project has already been refunded.");
  if (!input.reason?.trim() || input.reason.trim().length < 3) throw new RefundError("A reason is required.");

  const { facts, releasedChapters } = await gatherFacts(project);
  const detectedStage = detectRefundStage(facts);
  const moneyIn = await projectNetInflow(db, project.id);
  const amount = clampRefund(input.stage, moneyIn, input.amount);
  const refunding = amount > 0;
  const workerPartial = Math.max(0, Math.round(input.workerPartial ?? 0));

  // The rows the CFO chose to reverse — only this project's owed/paid rows.
  const chosen = input.reverseRecordIds.length
    ? await db.payoutRecord.findMany({ where: { id: { in: input.reverseRecordIds }, projectId: project.id, status: { in: ["ACCRUED", "PAID"] } }, select: { id: true, leg: true, recipientType: true, recipientId: true, amount: true, status: true } })
    : [];
  const reversesAmbassador = chosen.some((r) => r.leg === "AMBASSADOR" || r.leg === "PARENT");
  const touchedAmbassadors = new Set(chosen.filter((r) => r.recipientType === "AMBASSADOR").map((r) => r.recipientId));
  const now = new Date();
  const refundPaymentId = refunding ? await nextId("PAYMENT") : null;
  const s = await cashflowForProject(project);

  const result = await db.$transaction(
    async (tx) => {
      const refund = await tx.refundRecord.create({
        data: {
          projectId: project.id,
          stage: input.stage,
          detectedStage,
          refundPercent: percentOf(amount, moneyIn),
          refundAmount: amount,
          moneyInAtRefund: moneyIn,
          reason: input.reason.trim(),
          initiatedById: actorId,
          bankConfirmationFileId: input.bankConfirmationFileId ?? null,
          workerPartialAmount: workerPartial || null,
          reversedRecordIds: chosen.map((r) => r.id),
        },
        select: { id: true },
      });

      // Reverse the chosen commissions. A PAID row keeps a recoveryAmount (clawed back by hand); never a negative payout.
      for (const r of chosen) {
        await tx.payoutRecord.update({
          where: { id: r.id },
          data: {
            status: "REVERSED",
            reversedAt: now,
            reversalReason: input.reason.trim(),
            refundId: refund.id,
            ...(r.status === "PAID" ? { recoveryAmount: Math.round(r.amount) } : {}),
          },
        });
      }

      // The project's ambassador legs and referral only drop when the ambassador leg is reversed.
      if (reversesAmbassador) {
        await releaseCommission(tx, project.id);
        await cancelProjectReferral(tx, project.id, `Project ${project.projectId} refunded`);
      }

      // The refund transition + the client-facing status, only when money actually goes back.
      if (refunding) {
        // Claim the transition so a double click (or two clerks) cannot refund twice.
        const claimed = await tx.project.updateMany({ where: { id: project.id, status: { not: "REFUNDED" } }, data: { status: "REFUNDED" } });
        if (claimed.count !== 1) throw new RefundError("This project was just refunded. Refresh the page.");
        await tx.projectStatusLog.create({ data: { projectId: project.id, fromStatus: project.status, toStatus: "REFUNDED", changedById: actorId, notes: input.reason.trim() } });
        await tx.payment.create({
          data: {
            paymentId: refundPaymentId!,
            type: "REFUND",
            direction: "OUTFLOW",
            projectId: project.id,
            personName: project.client.fullName,
            personRole: "Client",
            amount,
            confirmedById: actorId,
            status: "Confirmed",
            source: "MANUAL",
            notes: input.reason.trim(),
            date: now,
          },
          select: { id: true },
        }).then((p) => tx.refundRecord.update({ where: { id: refund.id }, data: { paymentId: p.id } }));
      }

      // Buckets/pots true up on the net money in (reduced by any refund outflow).
      await syncPaymentAmbassadorSnapshot(tx, project.id);
      await syncProjectBuckets(tx, project.id, { reason: refunding ? "REFUND" : "REALLOCATION", month: monthKeyOf(now), recordedById: actorId });

      // Pay the worker for chapters delivered (decision 7), if they have no payout row yet.
      let workerPaid = 0;
      if (workerPartial > 0 && project.workerId) {
        const existingWorker = await tx.payoutRecord.findFirst({ where: { projectId: project.id, leg: "WORKER" }, select: { id: true } });
        if (!existingWorker) {
          await tx.payoutRecord.create({
            data: {
              month: monthKeyOf(now),
              leg: "WORKER",
              recipientType: "WORKER",
              recipientId: project.workerId,
              recipientName: project.worker?.fullName ?? "Worker",
              projectId: project.id,
              amount: workerPartial,
              basis: `${releasedChaptersLabel(releasedChapters)} delivered`,
              status: "ACCRUED",
              ruleKey: "workers",
              triggerEventKey: "refund_partial",
              cashflowVersionId: project.cashflowVersionId,
              accruedAt: now,
            },
          });
          workerPaid = workerPartial;
        }
      }

      await tx.cashflowAuditLog.create({
        data: {
          actorUserId: actorId,
          action: refunding ? "processed_refund" : "kept_money_decision",
          entityType: "Project",
          entityId: project.id,
          afterJson: { stage: input.stage, amount, reversed: chosen.map((r) => r.id), workerPaid } as unknown as Prisma.InputJsonValue,
          reason: input.reason.trim(),
        },
      });

      return { refundId: refund.id, reversed: chosen.length, workerPaid };
    },
    { timeout: 30_000, maxWait: 10_000 }
  );

  for (const id of touchedAmbassadors) await db.$transaction((tx) => recountAmbassador(tx, id, s.tiers), { timeout: 30_000 }).catch(() => undefined);

  // The client hears about a real refund (amount + reason).
  if (refunding) {
    await notifyClient(project.id, {
      title: "Refund processed",
      message: `${formatNaira(amount)} refunded for ${project.projectId}.`,
      type: "warning",
      tab: "payments",
      email: {
        kind: "refund",
        heading: "Your refund has been processed",
        lines: [`We have refunded ${formatNaira(amount)} for your order ${project.projectId}.`, `Reason: ${input.reason.trim()}`, "It should reach your account shortly."],
        ctaLabel: "View your payments",
      },
    });
  }
  await notifyFinance({
    title: refunding ? "Refund processed" : "Cancellation decided — money kept",
    message: refunding
      ? `${project.projectId}: ${formatNaira(amount)} refunded, ${result.reversed} commission${result.reversed === 1 ? "" : "s"} reversed.`
      : `${project.projectId}: the client's money is kept; ${result.reversed} commission${result.reversed === 1 ? "" : "s"} reversed.`,
    type: "info",
    link: "/admin/finance/revenue",
  });

  // Tell each reversed recipient with a login.
  const reversedWithUser = await resolveReversedLogins(chosen);
  for (const r of reversedWithUser) {
    if (!r.userId) continue;
    await notifyUsers([r.userId], {
      title: "Commission reversed",
      message: `Your ${formatNaira(r.amount)} commission for ${project.projectId} was reversed: ${input.reason.trim()}`,
      type: "warning",
      link: r.recipientType === "AMBASSADOR" ? "/ambassador/commissions" : r.recipientType === "WORKER" ? "/worker/earnings" : "/admin/earnings",
    }).catch(() => undefined);
  }

  return { ...result, refunded: amount, status: refunding ? "REFUNDED" : project.status };
}

// ── The persisting "decision needed" state + the 3-day reminder (decision 6) ──

const DAY = 24 * 60 * 60 * 1000;

export interface CancelledUndecided {
  count: number;
  amount: number;
  projects: { id: string; projectCode: string; clientName: string; moneyIn: number; cancelledAt: Date | null }[];
}

/** Cancelled projects with money in and no refund decision yet — the persisting dashboard line. */
export async function listCancelledUndecided(): Promise<CancelledUndecided> {
  const cancelled = await db.project.findMany({
    where: { status: "CANCELLED", isProBono: false },
    select: { id: true, projectId: true, client: { select: { fullName: true } }, statusLog: { where: { toStatus: "CANCELLED" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
  });
  if (!cancelled.length) return { count: 0, amount: 0, projects: [] };
  const ids = cancelled.map((c) => c.id);
  const decided = new Set((await db.refundRecord.findMany({ where: { projectId: { in: ids } }, select: { projectId: true } })).map((r) => r.projectId));
  const projects: CancelledUndecided["projects"] = [];
  let amount = 0;
  for (const c of cancelled) {
    if (decided.has(c.id)) continue;
    const moneyIn = await projectNetInflow(db, c.id);
    if (moneyIn <= 0) continue;
    amount += moneyIn;
    projects.push({ id: c.id, projectCode: c.projectId, clientName: c.client.fullName, moneyIn, cancelledAt: c.statusLog[0]?.createdAt ?? null });
  }
  return { count: projects.length, amount, projects };
}

/**
 * Once a day, email finance a digest of cancelled-with-money-in projects undecided
 * for more than three days (decision 6). Gated by a date Setting so the minute tick
 * does the work at most once per day, and never sends the same day twice.
 */
export async function sendCancelReminders(now: Date = new Date()): Promise<{ sent: number }> {
  const { getAlertEmails } = await import("@/lib/services/settings");
  const { mergeAlertRecipients } = await import("@/lib/services/team-alerts");
  const { sendMail } = await import("@/lib/mailer");
  const { mayNotify } = await import("@/lib/qa-scope");

  const { watDateKey } = await import("@/lib/ambassadors/weeks");
  const today = watDateKey(now); // WAT day, so "once a day" flips at midnight WAT, not 01:00
  const gateKey = `cancel_reminder_ran:${today}`;
  const already = await db.setting.findUnique({ where: { key: gateKey }, select: { key: true } });
  if (already) return { sent: 0 };
  // Claim the day up front so a second tick in the same minute does not also send.
  await db.setting.create({ data: { key: gateKey, value: now.toISOString() } }).catch(() => undefined);

  const overdue = (await listCancelledUndecided()).projects.filter((p) => p.cancelledAt != null && now.getTime() - p.cancelledAt.getTime() > 3 * DAY);
  if (!overdue.length) return { sent: 0 };

  const founder = await getAlertEmails();
  const cfos = (await db.user.findMany({ where: { role: "CO_CEO_CFO", isActive: true }, orderBy: { createdAt: "asc" }, select: { email: true } })).map((u) => u.email);
  const recipients = mergeAlertRecipients(founder, cfos).to.filter((e) => mayNotify(e));
  if (!recipients.length) return { sent: 0 };

  const lines = overdue.map((p) => `• ${p.projectCode} — ${p.clientName}: ${formatNaira(p.moneyIn)} in, cancelled ${p.cancelledAt ? Math.floor((now.getTime() - p.cancelledAt.getTime()) / DAY) : "?"} days ago`);
  const text = ["These cancelled projects have money in and no refund decision yet:", "", ...lines, "", "Decide each one on its project page: refund the client (reverse what's owed) or keep it."].join("\n");
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0F172A;"><p>These cancelled projects have money in and no refund decision yet:</p><ul>${overdue
    .map((p) => `<li>${p.projectCode} — ${p.clientName}: ${formatNaira(p.moneyIn)} in, cancelled ${p.cancelledAt ? Math.floor((now.getTime() - p.cancelledAt.getTime()) / DAY) : "?"} days ago</li>`)
    .join("")}</ul><p>Decide each one on its project page: refund the client or keep it.</p></div>`;
  const res = await sendMail({ to: recipients.join(", "), subject: `${overdue.length} cancelled project${overdue.length === 1 ? "" : "s"} awaiting a refund decision`, html, text });
  await db.emailLog.create({ data: { kind: `cancel-reminder:${today}`, to: recipients.join(", "), ok: res.ok, error: res.error ?? null } }).catch(() => undefined);
  return { sent: res.ok ? 1 : 0 };
}

async function resolveReversedLogins(chosen: { recipientType: string; recipientId: string; amount: number }[]): Promise<{ recipientType: string; userId: string | null; amount: number }[]> {
  const out: { recipientType: string; userId: string | null; amount: number }[] = [];
  for (const r of chosen) {
    let userId: string | null = null;
    if (r.recipientType === "WORKER") userId = (await db.worker.findUnique({ where: { id: r.recipientId }, select: { userId: true } }))?.userId ?? null;
    else if (r.recipientType === "AMBASSADOR") userId = (await db.ambassador.findUnique({ where: { id: r.recipientId }, select: { userId: true } }))?.userId ?? null;
    else if (r.recipientType === "USER") userId = r.recipientId;
    out.push({ recipientType: r.recipientType, userId, amount: Math.round(r.amount) });
  }
  return out;
}
