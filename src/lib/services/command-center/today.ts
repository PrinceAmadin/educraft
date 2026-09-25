import type { Prisma, ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  DAY_MS,
  HOUR_MS,
  currentMonthKey,
  monthBounds,
  monthLongLabel,
  shiftMonth,
  watDayBounds,
  watDayOfMonth,
  watDayStart,
  watMonthKey,
} from "@/lib/command-center/time";
import { OPS_RESERVE_ALERT_KEY, fractionToPercent } from "@/lib/command-center/rag";
import { MAX_CORRECTION_ROUNDS } from "@/lib/command-center/derive";
import { formatWatDate } from "@/lib/command-center/presentation";
import type { CcAlert, FeedEvent, TodayNumbers, TodayPayload } from "@/lib/command-center/types";
import { MAX_REVISIONS } from "@/lib/constants";
import { PIPELINE_STATUSES, STATUS_META } from "@/lib/status";
import { formatNaira } from "@/lib/utils";
import { WORKER_ACTIVE_STATUSES } from "@/lib/worker-metrics";
import { countUnansweredThreads } from "@/lib/services/client-messages";
import { countVersionsToReview } from "@/lib/services/deliverables";
import { countPendingRerunRequests } from "@/lib/services/research-runs";
import { countPendingWorkerApplications } from "@/lib/services/worker-applications";
import { getBucketBalances } from "@/lib/services/finance/buckets";
import { activationSnapshot, conversionsBetween, countConversions, referralsBetween } from "./ambassador-activity";
import { getThresholds } from "./settings";
import { contentPostsToday, platinumBonusAlerts, tierChangesToday } from "./sources/phase3";
import {
  correctionRoundThreeProjects,
  qaDecisionsToday,
  qaWaitingWithoutReviewer,
  researchEventsToday,
  workerTier2FlagAlerts,
  type QaDecisionToday,
} from "./sources/phase4";

/**
 * The Today tab (Phase 5): what needs the founder's attention right now,
 * what happened since midnight WAT, and today's numbers against yesterday's.
 * Read-only, never cached, and every figure has one definition:
 *
 * - "Today" is a WAT calendar day (`watDayBounds`); months are UTC keys like
 *   the Finance Platform, so the payout alert and the feed's "(September
 *   2026)" labels tie to `/admin/finance/payouts`.
 * - Overdue = a project EduCraft still owes the delivery of (paid, not yet
 *   delivered, not waiting on the client) whose `internalDeadline` fell on a
 *   WAT day that is over. Deadlines are dates — intake stores "2026-09-25" as
 *   00:00 UTC, Phase 4's editor stores 23:59 WAT — so a project is late from
 *   the midnight after its due day, as the project page's "Due today" says.
 *   NEW (unpaid), APPROVED (waiting for the client's balance), DELIVERED and
 *   SUPERVISOR_CORRECTIONS are not overdue, and neither is a paused clock
 *   (AWAITING_CLIENT_INPUT / `deadlinePausedAt`): `transitionProject` shifts
 *   the deadline by the paused days only on resume.
 * - Payments are counted by `Payment.date` (the confirmation instant for
 *   Paystack, the verifier's date for bank transfers) with status
 *   "Confirmed", exactly like `netRevenueForMonths`.
 * - Referrals, conversions and the activation rate are the Ambassador
 *   Platform's (see `ambassador-activity.ts`).
 * - Signals that arrive with the phase-3 / phase-4 merges (tier changes,
 *   content posts, Platinum bonuses, Tier 2 flags) are listed in `pending`
 *   while this build cannot read them, and drop off by themselves after.
 *
 * Deep links use the query parameters the target pages actually parse:
 * `/admin/projects?worker=unassigned` and `?flag=overdue|revision-escalated`
 * (`projectListParamsSchema`), `/admin/finance/payouts?month=YYYY-MM`
 * (`payoutsQuerySchema`), `/admin/finance/revenue?status=Pending`
 * (`revenueQuerySchema`), `/admin/finance/buckets?bucket=OPERATIONS_RESERVE`
 * (`bucketsQuerySchema`), `/admin/projects/{id}?tab=documents`
 * (`ProjectTabs` id "documents") and `/admin/client-inbox#documents`
 * (the section id on that page).
 *
 * The Prisma pool is small (one connection per function through pgbouncer),
 * so reads run in small groups; the today/yesterday numbers come from
 * two-day reads the feed needs anyway. The route runs in dub1, next to the
 * database (see the route file).
 */

const OPEN_STATUSES: ProjectStatus[] = [...PIPELINE_STATUSES, "REVISION_NEEDED", "SUPERVISOR_CORRECTIONS"];
/**
 * Where EduCraft still owes the delivery and the clock is running: paid,
 * not yet delivered, not waiting on the client. (`/admin/projects?flag=overdue`
 * still uses the wider open list, so it may show a few more rows.)
 */
const OVERDUE_STATUSES: ProjectStatus[] = [
  "DOWNPAYMENT_VERIFIED",
  "REQUIREMENTS_CONFIRMED",
  "ASSIGNED",
  "IN_PROGRESS",
  "SUBMITTED",
  "IN_QA_REVIEW",
  "REVISION_NEEDED",
  "BALANCE_VERIFIED",
];
/** Statuses that keep a worker busy: the active list plus supervisor corrections (the worker revises again). */
const WORKER_IN_HAND: ProjectStatus[] = [...WORKER_ACTIVE_STATUSES, "SUPERVISOR_CORRECTIONS"];
/** Paid projects waiting for a worker, by the COO action each needs. */
const UNASSIGNED_STAGES = [
  {
    status: "DOWNPAYMENT_VERIFIED" as const,
    title: (n: string) => `${n} waiting for requirements over 24 hours`,
    detail: "Paid (or pro bono) — confirm the requirements so a worker can be assigned",
    hrefLabel: "Confirm requirements",
  },
  {
    status: "REQUIREMENTS_CONFIRMED" as const,
    title: (n: string) => `${n} unassigned over 24 hours`,
    detail: "Requirements confirmed, no worker assigned yet",
    hrefLabel: "Assign workers",
  },
];
const HOLD_STATUSES: ProjectStatus[] = ["CANCELLED", "REFUNDED", "ON_HOLD", "DISPUTED"];
const CLIENT_INFLOW_TYPES = ["CLIENT_DOWNPAYMENT", "CLIENT_BALANCE"] as const;

const OVERDUE_ROW_CAP = 25;
const FEED_LIMIT = 50;
/** Most rows a two-day read returns; a day with more than this many payments is not a Phase 5 problem. */
const TWO_DAY_ROW_CAP = 500;
/** Payouts for the previous month are due by this WAT day of the current month. */
const PAYOUT_DUE_DAY = 5;
/** How long a paid project may sit without a worker before the founder hears about it. */
const UNASSIGNED_ALERT_HOURS = 24;
/** Most names to list on the dormant-workers row. */
const DORMANT_NAMES_SHOWN = 3;

const DRAW_TYPE_LABELS: Record<string, string> = {
  MONTHLY: "Monthly draw",
  MONTHLY_TOPUP: "Monthly top-up",
  SEMESTER_BONUS: "Semester bonus",
  ANNUAL_PROFIT_SHARE: "Annual profit share",
};

// ── Small helpers ────────────────────────────────────────────────

function naira(amount: number): string {
  return formatNaira(Math.round(amount));
}

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

function tierLabel(tier: string): string {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

/** "1 day past deadline": whole WAT days since the due day ended (overdue rows are always at least one). */
function pastDeadlineLabel(deadline: Date, todayStart: Date): string {
  const days = Math.max(1, Math.round((todayStart.getTime() - watDayStart(deadline).getTime()) / DAY_MS));
  return `${plural(days, "day")} past deadline`;
}

function joinDetail(...parts: (string | null)[]): string | null {
  const kept = parts.filter((p): p is string => Boolean(p));
  return kept.length ? kept.join(" · ") : null;
}

/** Completed in [from, to): the stamped date, or the COMPLETED log for rows moved before the stamp existed. */
function completedBetween(from: Date, to: Date): Prisma.ProjectWhereInput {
  return {
    status: "COMPLETED",
    OR: [
      { finalCompletionDate: { gte: from, lt: to } },
      { finalCompletionDate: null, statusLog: { some: { toStatus: "COMPLETED", createdAt: { gte: from, lt: to } } } },
    ],
  };
}

function clientInflowBetween(from: Date, to: Date): Prisma.PaymentWhereInput {
  return {
    status: "Confirmed",
    direction: "INFLOW",
    type: { in: [...CLIENT_INFLOW_TYPES] },
    date: { gte: from, lt: to },
  };
}

// ── Feed mapping ─────────────────────────────────────────────────

type StatusLogRow = {
  id: string;
  fromStatus: ProjectStatus;
  toStatus: ProjectStatus;
  createdAt: Date;
  notes: string | null;
  changedBy: { displayName: string | null } | null;
  project: {
    id: string;
    projectId: string;
    revisionCount: number;
    isProBono: boolean;
    worker: { fullName: string } | null;
  };
};

const RESUMABLE_HOLDS: ProjectStatus[] = ["ON_HOLD", "DISPUTED"];

/**
 * One feed line per status move, labelled by what actually happened — not
 * just by the status it landed in. Same-status rows (a refused payment, an
 * in-flight reassignment) are not moves and are dropped. A resume from hold
 * is a resume, not a fresh approval or delivery. A verified-payment move is
 * dropped when the project has a confirmed Payment today (that line says the
 * same thing with the amount); a pro bono opening or an auto-advance past an
 * already-paid balance is a status line, never a payment. `revisionNumber`
 * is which revision a REVISION_NEEDED move made (the caller counts back from
 * the project's current count, newest move first). `qa` is the reviewer's
 * decision behind this move, when Phase 4's review record has it: the line
 * then names the reviewer and the delivery checks.
 */
function statusEvent(
  row: StatusLogRow,
  projectsPaidToday: ReadonlySet<string>,
  revisionNumber: number,
  qa: QaDecisionToday | null
): FeedEvent | null {
  if (row.fromStatus === row.toStatus) return null;
  const code = row.project.projectId;
  const actor = row.changedBy?.displayName ? `by ${row.changedBy.displayName}` : "system";
  const base = { id: `log:${row.id}`, at: row.createdAt.toISOString(), href: `/admin/projects/${row.project.id}` };
  const worker = row.project.worker?.fullName ?? null;
  const reviewedBy = qa?.reviewerName ? `Reviewed by ${qa.reviewerName}` : actor;

  if (RESUMABLE_HOLDS.includes(row.fromStatus) && !HOLD_STATUSES.includes(row.toStatus)) {
    return { ...base, kind: "status", title: `Resumed: ${code} → ${STATUS_META[row.toStatus].label}`, detail: actor };
  }

  switch (row.toStatus) {
    case "APPROVED": {
      if (qa) {
        const who = worker ? ` (${worker})` : "";
        const title =
          qa.decision === "MINOR_FIXES"
            ? `QA approved after minor fixes: ${code}${who}`
            : `QA approved: ${code}${who}${qa.allChecksPassed ? ` — all ${qa.checksTicked} delivery checks passed` : ""}`;
        return { ...base, kind: "approved", title, detail: joinDetail(reviewedBy, qa.round > 1 ? `round ${qa.round}` : null) };
      }
      const passed = row.fromStatus === "IN_QA_REVIEW" ? `${worker ?? "Unassigned"} — passed review` : null;
      return { ...base, kind: "approved", title: `QA approved: ${code}`, detail: joinDetail(passed, actor) };
    }
    case "REVISION_NEEDED":
      return {
        ...base,
        kind: "warning",
        title: `QA sent back: ${code} — revision ${Math.max(1, revisionNumber)}`,
        detail: qa ? reviewedBy : actor,
      };
    case "DELIVERED":
      return { ...base, kind: "delivered", title: `Delivered: ${code}`, detail: actor };
    case "COMPLETED":
      return { ...base, kind: "completed", title: `Completed: ${code}`, detail: actor };
    case "SUBMITTED":
      return { ...base, kind: "submitted", title: `Work submitted: ${code}`, detail: actor };
    case "DOWNPAYMENT_VERIFIED":
    case "BALANCE_VERIFIED": {
      if (row.project.isProBono) {
        return row.toStatus === "DOWNPAYMENT_VERIFIED"
          ? { ...base, kind: "status", title: `Pro bono project opened: ${code}`, detail: actor }
          : { ...base, kind: "status", title: `Ready for delivery: ${code}`, detail: "Pro bono — no balance to collect" };
      }
      if (row.fromStatus === "APPROVED" && row.toStatus === "BALANCE_VERIFIED" && !projectsPaidToday.has(row.project.id)) {
        // transitionProject moves straight on when the balance was paid before QA passed.
        return { ...base, kind: "status", title: `Ready for delivery: ${code}`, detail: row.notes ?? "Balance already paid" };
      }
      if (projectsPaidToday.has(row.project.id)) return null;
      const leg = row.toStatus === "DOWNPAYMENT_VERIFIED" ? "Downpayment" : "Balance";
      return { ...base, kind: "payment", title: `${leg} verified: ${code}`, detail: actor };
    }
    case "SUPERVISOR_CORRECTIONS":
      return { ...base, kind: "warning", title: `Supervisor corrections: ${code}`, detail: actor };
    default:
      if (HOLD_STATUSES.includes(row.toStatus)) {
        return { ...base, kind: "warning", title: `${STATUS_META[row.toStatus].label}: ${code}`, detail: actor };
      }
      return {
        ...base,
        kind: "status",
        title: `${code}: ${STATUS_META[row.fromStatus].label} → ${STATUS_META[row.toStatus].label}`,
        detail: actor,
      };
  }
}

/** Does this status move carry the reviewer's decision? */
function decisionMatches(toStatus: ProjectStatus, qa: QaDecisionToday): boolean {
  if (toStatus === "APPROVED") return qa.decision === "APPROVED" || qa.decision === "MINOR_FIXES";
  if (toStatus === "REVISION_NEEDED") return qa.decision === "REVISION_NEEDED";
  return false;
}

// ── The aggregation ──────────────────────────────────────────────

export async function getToday(now: Date = new Date()): Promise<TodayPayload> {
  const { start, end, yesterdayStart } = watDayBounds(now);
  const month = currentMonthKey(now);
  const thisMonth = monthBounds(month);
  // Payout deadlines are WAT dates: "last month's payouts by the 5th" uses the WAT month and day together.
  const payoutMonthNow = watMonthKey(now);
  const payoutPrevMonth = shiftMonth(payoutMonthNow, -1);
  const pastPayoutDay = watDayOfMonth(now) >= PAYOUT_DUE_DAY;
  const unassignedCutoff = new Date(now.getTime() - UNASSIGNED_ALERT_HOURS * HOUR_MS);
  const isToday = (d: Date) => d.getTime() >= start.getTime();

  // Group 1 — thresholds, every overdue project, the bucket balance, unpaid payouts by month, two days of referrals.
  const [thresholds, overdueAll, balances, unpaidPayouts, referrals] = await Promise.all([
    getThresholds(),
    db.project.findMany({
      // Late from the midnight (WAT) after the due day: `lt: start`, not `lt: now`.
      where: { status: { in: OVERDUE_STATUSES }, internalDeadline: { lt: start }, deadlinePausedAt: null },
      orderBy: { internalDeadline: "asc" },
      select: {
        id: true,
        projectId: true,
        internalDeadline: true,
        service: { select: { serviceName: true } },
        worker: { select: { fullName: true } },
      },
    }),
    getBucketBalances(),
    // Every month before this one with anything still owed; which of them are late is decided below.
    db.payoutRecord.groupBy({
      by: ["month", "recipientId"],
      where: { status: "PENDING", month: { lt: payoutMonthNow } },
      _sum: { amount: true },
    }),
    referralsBetween(yesterdayStart, end),
  ]);

  // Group 2 — the Ambassador Dashboard's activation rate, and unpaid performance bonuses.
  const [activation, unpaidBonuses] = await Promise.all([
    activationSnapshot(now),
    db.performanceBonus.groupBy({
      by: ["month", "recipientId"],
      where: { status: "PENDING", month: { lt: payoutMonthNow } },
      _sum: { amount: true },
    }),
  ]);

  // Group 3 — attention counts.
  const [unassignedByStatus, markedPaidRows, revisionCapCount, ambassadorApplicationRows, qaWaiting] = await Promise.all([
    // The clock starts when the project became workable: its move into DOWNPAYMENT_VERIFIED (Paystack, a
    // finance confirmation or a pro bono opening all write it). `downpaymentDate` is a date-only or backdated
    // value on manual confirmations and null on pro bono, so it is only the fallback for rows with no such move.
    db.project.groupBy({
      by: ["status"],
      where: {
        workerId: null,
        status: { in: ["DOWNPAYMENT_VERIFIED", "REQUIREMENTS_CONFIRMED"] },
        downpaymentStatus: "Verified",
        OR: [
          { statusLog: { some: { toStatus: "DOWNPAYMENT_VERIFIED", createdAt: { lt: unassignedCutoff } } } },
          { statusLog: { none: { toStatus: "DOWNPAYMENT_VERIFIED" } }, downpaymentDate: { lt: unassignedCutoff } },
        ],
      },
      _count: { _all: true },
    }),
    // A leg at "Paid" is a transfer someone marked that finance has not confirmed yet.
    db.project.findMany({
      where: { OR: [{ downpaymentStatus: "Paid" }, { balanceStatus: "Paid" }] },
      select: { downpaymentStatus: true, balanceStatus: true },
    }),
    db.project.count({ where: { status: { in: OPEN_STATUSES }, revisionCount: { gte: MAX_REVISIONS } } }),
    // Pending applications (for the alert) and today's (for the feed) in one read.
    db.ambassadorApplication.findMany({
      where: { OR: [{ status: "PENDING" }, { createdAt: { gte: start } }] },
      orderBy: { createdAt: "desc" },
      select: { id: true, fullName: true, status: true, createdAt: true },
    }),
    qaWaitingWithoutReviewer(now),
  ]);

  // Group 4 — the existing "waiting on us" services and correction rounds.
  const [threads, documentsToReview, rerunRequestsPending, workerApplications, correctionRows] = await Promise.all([
    countUnansweredThreads(),
    countVersionsToReview(),
    countPendingRerunRequests(),
    countPendingWorkerApplications(),
    correctionRoundThreeProjects(),
  ]);

  // Months whose payouts are late: before last month, or last month once the WAT 5th has come.
  const lateMonths = new Map<string, { recipients: Set<string>; amount: number }>();
  for (const r of [...unpaidPayouts, ...unpaidBonuses]) {
    if (r.month > payoutPrevMonth || (r.month === payoutPrevMonth && !pastPayoutDay)) continue;
    const m = lateMonths.get(r.month) ?? { recipients: new Set<string>(), amount: 0 };
    m.recipients.add(r.recipientId);
    m.amount += r._sum.amount ?? 0;
    lateMonths.set(r.month, m);
  }
  const lateMonthKeys = [...lateMonths.keys()].sort();

  // Group 5 — dormant workers, the COO's payout submissions, status moves, two days of payments.
  const [activeWorkers, lateSubmissions, statusLogs, paymentRows] = await Promise.all([
    db.worker.findMany({
      where: { status: "Active" },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        _count: { select: { projects: { where: { status: { in: WORKER_IN_HAND } } } } },
        // Work finished this month: delivered (the worker's part is done) or completed.
        projects: {
          where: {
            OR: [
              completedBetween(thisMonth.start, thisMonth.end),
              { statusLog: { some: { toStatus: "DELIVERED", createdAt: { gte: thisMonth.start, lt: thisMonth.end } } } },
            ],
          },
          select: { id: true },
          take: 1,
        },
      },
    }),
    lateMonthKeys.length > 0
      ? db.payoutSubmission.findMany({ where: { month: { in: lateMonthKeys } }, select: { month: true, submittedAt: true } })
      : Promise.resolve([]),
    db.projectStatusLog.findMany({
      where: { createdAt: { gte: start } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        createdAt: true,
        notes: true,
        changedBy: { select: { displayName: true } },
        project: {
          select: {
            id: true,
            projectId: true,
            revisionCount: true,
            isProBono: true,
            worker: { select: { fullName: true } },
          },
        },
      },
    }),
    db.payment.findMany({
      where: clientInflowBetween(yesterdayStart, end),
      orderBy: { date: "desc" },
      take: TWO_DAY_ROW_CAP,
      select: {
        id: true,
        type: true,
        amount: true,
        date: true,
        source: true,
        project: { select: { id: true, projectId: true, client: { select: { fullName: true } } } },
      },
    }),
  ]);

  // Group 6 — two days of conversions, payouts and draws today, people who joined today.
  const [conversions, payoutsPaid, drawsDistributed, newAmbassadors, newWorkers] = await Promise.all([
    conversionsBetween(yesterdayStart, end),
    db.payoutRecord.findMany({
      where: { status: "PAID", paidAt: { gte: start } },
      orderBy: { paidAt: "desc" },
      take: 200,
      select: { id: true, paymentId: true, recipientName: true, amount: true, month: true, paidAt: true },
    }),
    db.founderDraw.findMany({
      where: { status: "DISTRIBUTED", distributedAt: { gte: start } },
      orderBy: { distributedAt: "desc" },
      take: 20,
      select: { id: true, recipient: true, drawType: true, amount: true, month: true, distributedAt: true },
    }),
    db.ambassador.findMany({
      where: { createdAt: { gte: start } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, fullName: true, tier: true, createdAt: true, university: { select: { abbreviation: true } } },
    }),
    db.worker.findMany({
      where: { createdAt: { gte: start } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, fullName: true, createdAt: true },
    }),
  ]);

  // Group 7 — research, worker applications, releases, two days of completions. Research comes from
  // Phase 4's run ledger once it is in this build; until then from main's re-run requests and jobs.
  const researchLedger = await researchEventsToday(start);
  const [workerApps, rerunReviews, researchJobs, releases, completedRows] = await Promise.all([
    db.workerApplication.findMany({
      where: { createdAt: { gte: start } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, fullName: true, createdAt: true },
    }),
    researchLedger
      ? Promise.resolve([])
      : db.researchRerunRequest.findMany({
          where: { reviewedAt: { gte: start }, status: { in: ["APPROVED", "USED", "REJECTED"] } },
          orderBy: { reviewedAt: "desc" },
          take: 50,
          select: { id: true, status: true, reviewedAt: true, project: { select: { projectId: true } } },
        }),
    // On main a finished job has no completion stamp. `lastStepAt` is set by the step that finished it and
    // never again; `updatedAt` also moves when the job is shared with the client, so it is only the fallback.
    researchLedger
      ? Promise.resolve([])
      : db.researchJob.findMany({
          where: {
            status: { in: ["PASSED", "FAILED_NEEDS_REVIEW"] },
            OR: [{ lastStepAt: { gte: start } }, { lastStepAt: null, updatedAt: { gte: start } }],
          },
          orderBy: { updatedAt: "desc" },
          take: 50,
          select: {
            id: true,
            status: true,
            updatedAt: true,
            lastStepAt: true,
            project: { select: { id: true, projectId: true } },
            _count: { select: { references: { where: { status: "KEPT" } } } },
          },
        }),
    db.deliverableVersion.findMany({
      where: { releasedAt: { gte: start } },
      orderBy: { releasedAt: "desc" },
      take: 50,
      select: {
        id: true,
        releasedAt: true,
        deliverable: { select: { title: true, project: { select: { id: true, projectId: true } } } },
      },
    }),
    db.project.findMany({
      where: completedBetween(yesterdayStart, end),
      select: {
        finalCompletionDate: true,
        statusLog: { where: { toStatus: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    }),
  ]);

  // Group 8 — the signals that arrive with the phase-3 / phase-4 merges (null while this build cannot read them).
  const [tier2Alerts, platinumAlerts, tierChanges, contentPosts, qaDecisions] = await Promise.all([
    workerTier2FlagAlerts(now),
    platinumBonusAlerts(now),
    tierChangesToday(start),
    contentPostsToday(start),
    qaDecisionsToday(start),
  ]);

  const pending: string[] = [];
  if (!tierChanges) pending.push("Ambassador tier changes (Phase 3)");
  if (!contentPosts) pending.push("Ambassador content posts (Phase 3)");
  if (!platinumAlerts) pending.push("Platinum quarterly bonuses (Phase 3)");
  if (!tier2Alerts) pending.push("Worker Tier 2 reference flags (Phase 4)");

  // ── Alerts ─────────────────────────────────────────────────────

  const critical: CcAlert[] = [];
  const attention: CcAlert[] = [];

  for (const p of overdueAll.slice(0, OVERDUE_ROW_CAP)) {
    critical.push({
      key: `overdue:${p.id}`,
      severity: "critical",
      kind: "overdue",
      title: `${p.projectId} overdue`,
      detail: `${p.service.serviceName} — ${pastDeadlineLabel(p.internalDeadline ?? start, start)}`,
      meta: p.worker ? `Worker: ${p.worker.fullName}` : "Unassigned",
      href: `/admin/projects/${p.id}`,
      hrefLabel: "Go to project",
    });
  }
  if (overdueAll.length > OVERDUE_ROW_CAP) {
    // The list page's ?flag=overdue uses the wider open list, so it may show a few more.
    const more = overdueAll.length - OVERDUE_ROW_CAP;
    critical.push({
      key: "overdue:more",
      severity: "critical",
      kind: "overdue",
      title: `and ${plural(more, "more overdue project")}`,
      detail: `${plural(overdueAll.length, "project")} past their internal deadline in all`,
      meta: null,
      href: "/admin/projects?flag=overdue",
      hrefLabel: "See all overdue",
      count: more,
    });
  }

  // One row per late month, oldest first: an old unpaid month stays on screen until it is paid.
  const submittedAt = new Map(lateSubmissions.map((sub) => [sub.month, sub.submittedAt]));
  for (const m of lateMonthKeys) {
    const late = lateMonths.get(m);
    if (!late) continue;
    const submitted = submittedAt.get(m);
    critical.push({
      key: `payouts:${m}`,
      severity: "critical",
      kind: "payouts",
      title: "Monthly payouts not yet processed",
      detail: `${monthLongLabel(m)} — ${plural(late.recipients.size, "recipient")}, ${naira(late.amount)} pending`,
      meta: submitted ? `COO submitted ${formatWatDate(submitted)}` : "COO has not submitted the payout list",
      href: `/admin/finance/payouts?month=${m}`,
      hrefLabel: "Go to Finance",
    });
  }

  critical.push(...(tier2Alerts ?? []), ...(platinumAlerts ?? []));

  const reserveMin = thresholds[OPS_RESERVE_ALERT_KEY];
  if (balances.operationsReserve < reserveMin) {
    critical.push({
      key: "ops_reserve",
      severity: "critical",
      kind: "ops_reserve",
      title: "Operations Reserve below minimum",
      detail: `${naira(balances.operationsReserve)} — minimum ${naira(reserveMin)}`,
      meta: "CFO action needed",
      href: "/admin/finance/buckets?bucket=OPERATIONS_RESERVE",
      hrefLabel: "Go to buckets",
    });
  }

  // One row per stage, each linked to the list filtered to exactly the projects it counts.
  for (const stage of UNASSIGNED_STAGES) {
    const n = unassignedByStatus.find((r) => r.status === stage.status)?._count._all ?? 0;
    if (n === 0) continue;
    attention.push({
      key: `unassigned:${stage.status}`,
      severity: "attention",
      kind: "unassigned",
      title: stage.title(plural(n, "project")),
      detail: stage.detail,
      meta: "COO action needed",
      href: `/admin/projects?status=${stage.status}&worker=unassigned`,
      hrefLabel: stage.hrefLabel,
      count: n,
    });
  }

  if (qaWaiting.count > 0) {
    attention.push({
      key: "qa_waiting",
      severity: "attention",
      kind: "qa_waiting",
      title: `${plural(qaWaiting.count, "submission")} waiting for a QA reviewer over 24 hours`,
      detail:
        qaWaiting.oldestHours !== null
          ? `Oldest has waited ${plural(qaWaiting.oldestHours, "hour")}`
          : "Nobody has taken them yet",
      meta: "COO action needed",
      href: "/admin/qa",
      hrefLabel: "Open QA queue",
    });
  }

  for (const p of correctionRows) {
    attention.push({
      key: `corrections:${p.id}`,
      severity: "attention",
      kind: "corrections",
      title: `${p.projectId} on round ${p.round} of supervisor corrections`,
      detail: `${p.serviceName} — ${p.clientName}`,
      meta:
        p.round > MAX_CORRECTION_ROUNDS
          ? `Beyond the ${MAX_CORRECTION_ROUNDS} included rounds — founder review`
          : "Last included round — founder review",
      href: `/admin/projects/${p.id}`,
      hrefLabel: "Go to project",
    });
  }

  const activationAmber = fractionToPercent(thresholds["cc.growth.activation_rate.amber"]);
  const activationTarget = fractionToPercent(thresholds["cc.growth.activation_rate.target"]);
  if (activation.rate !== null && activation.rate < activationAmber) {
    attention.push({
      key: `activation:${month}`,
      severity: "attention",
      kind: "activation",
      title: `Ambassador activation rate ${activation.rate}% — target ≥ ${activationTarget}%`,
      detail: `${activation.active} of ${plural(activation.total, "ambassador")} converted a client in the last 30 days`,
      meta: "HOG action needed",
      href: "/admin/ambassadors",
      hrefLabel: "Go to ambassadors",
    });
  }

  // Dormant = an Active worker with nothing in hand (supervisor corrections count) and nothing delivered or completed this month.
  const dormant = activeWorkers.filter((w) => w._count.projects === 0 && w.projects.length === 0);
  if (dormant.length > 0) {
    const names = dormant.slice(0, DORMANT_NAMES_SHOWN).map((w) => w.fullName);
    const rest = dormant.length - names.length;
    attention.push({
      key: `dormant_workers:${month}`,
      severity: "attention",
      kind: "dormant_workers",
      title: `${plural(dormant.length, "active worker")} with no work this month`,
      detail: rest > 0 ? `${names.join(", ")} and ${rest} more` : names.join(", "),
      meta: "Nothing delivered this month and nothing in hand",
      href: "/admin/workers",
      hrefLabel: "Go to workers",
    });
  }

  // Only messages older than a day are an alert; the inbox itself shows the rest.
  if (threads.overADay > 0) {
    attention.push({
      key: "messages",
      severity: "attention",
      kind: "messages",
      title: `${plural(threads.overADay, "client message")} waiting over a day`,
      detail: threads.total > threads.overADay ? `${plural(threads.total, "thread")} waiting on us in all` : null,
      meta: null,
      href: "/admin/client-inbox",
      hrefLabel: "Open inbox",
    });
  }

  if (documentsToReview > 0) {
    attention.push({
      key: "documents",
      severity: "attention",
      kind: "documents",
      title: `${plural(documentsToReview, "document")} waiting for review`,
      detail: "Uploaded by workers, not yet released or returned",
      meta: null,
      href: "/admin/client-inbox#documents",
      hrefLabel: "Review documents",
    });
  }

  const downpaymentsMarked = markedPaidRows.filter((p) => p.downpaymentStatus === "Paid").length;
  const balancesMarked = markedPaidRows.filter((p) => p.balanceStatus === "Paid").length;
  const paymentsToVerify = downpaymentsMarked + balancesMarked;
  if (paymentsToVerify > 0) {
    attention.push({
      key: "verify_payments",
      severity: "attention",
      kind: "verify_payments",
      title: `${plural(paymentsToVerify, "payment")} marked paid, awaiting finance verification`,
      detail: joinDetail(
        downpaymentsMarked > 0 ? plural(downpaymentsMarked, "downpayment") : null,
        balancesMarked > 0 ? plural(balancesMarked, "balance") : null
      ),
      meta: "Finance action needed",
      href: "/admin/finance/revenue?status=Pending",
      hrefLabel: "Verify payments",
    });
  }

  if (rerunRequestsPending > 0) {
    attention.push({
      key: "research",
      severity: "attention",
      kind: "research",
      title: `${plural(rerunRequestsPending, "research re-run request")} awaiting a decision`,
      detail: "Each approval is one run within 24 hours",
      meta: null,
      href: "/admin/research-requests",
      hrefLabel: "Review requests",
    });
  }

  const ambassadorApplications = ambassadorApplicationRows.filter((a) => a.status === "PENDING").length;
  if (ambassadorApplications > 0) {
    attention.push({
      key: "applications:ambassador",
      severity: "attention",
      kind: "applications",
      title: `${plural(ambassadorApplications, "ambassador application")} to review`,
      detail: null,
      meta: null,
      href: "/admin/ambassadors/applications",
      hrefLabel: "Review applications",
    });
  }
  if (workerApplications > 0) {
    attention.push({
      key: "applications:worker",
      severity: "attention",
      kind: "applications",
      title: `${plural(workerApplications, "worker application")} to review`,
      detail: null,
      meta: null,
      href: "/admin/workers/applications",
      hrefLabel: "Review applications",
    });
  }

  if (revisionCapCount > 0) {
    attention.push({
      key: "revision_cap",
      severity: "attention",
      kind: "revision_cap",
      title: `${plural(revisionCapCount, "project")} at the revision cap`,
      detail: `${MAX_REVISIONS} or more revisions — founder review`,
      meta: null,
      href: "/admin/projects?flag=revision-escalated",
      hrefLabel: "See projects",
    });
  }

  // ── Feed ───────────────────────────────────────────────────────

  const events: FeedEvent[] = [];
  const paymentsToday = paymentRows.filter((p) => isToday(p.date));
  const conversionsToday = conversions.rows.filter((c) => isToday(c.at));
  const projectsPaidToday = new Set(paymentsToday.map((p) => p.project?.id).filter((id): id is string => Boolean(id)));

  // Newest first, so the k-th REVISION_NEEDED move of a project today made revision (current count − k).
  const revisionsSeen = new Map<string, number>();
  // When a payment was confirmed: the status move it caused carries the real time. A bank transfer's
  // Payment.date is the date the verifier picked (00:00 UTC), which would sort it to 1:00 AM.
  const confirmedAt = new Map<string, Date>();
  // A reviewer's decision (Phase 4) belongs to the latest matching move of its project: newest first, first match.
  const qaByProject = new Map((qaDecisions ?? []).map((q) => [q.projectId, q]));
  const qaPaired = new Set<string>();
  for (const row of statusLogs) {
    if (row.toStatus === "DOWNPAYMENT_VERIFIED" || row.toStatus === "BALANCE_VERIFIED") {
      const key = `${row.project.id}:${row.toStatus}`;
      if (!confirmedAt.has(key)) confirmedAt.set(key, row.createdAt);
    }
    let revisionNumber = row.project.revisionCount;
    if (row.toStatus === "REVISION_NEEDED") {
      const seen = revisionsSeen.get(row.project.id) ?? 0;
      revisionNumber = row.project.revisionCount - seen;
      revisionsSeen.set(row.project.id, seen + 1);
    }
    const qa = qaByProject.get(row.project.id) ?? null;
    const paired = qa !== null && !qaPaired.has(qa.projectId) && decisionMatches(row.toStatus, qa);
    if (paired) qaPaired.add(qa.projectId);
    const event = statusEvent(row, projectsPaidToday, revisionNumber, paired ? qa : null);
    if (event) events.push(event);
  }
  // An escalation keeps the project in review, so no status move carries it.
  for (const qa of qaDecisions ?? []) {
    if (qa.decision !== "ESCALATED") continue;
    events.push({
      id: `qa-escalated:${qa.projectId}`,
      kind: "warning",
      at: qa.at.toISOString(),
      title: `QA escalated: ${qa.projectCode} — senior review needed`,
      detail: joinDetail(qa.workerName ? `Worker: ${qa.workerName}` : null, qa.reviewerName ? `by ${qa.reviewerName}` : null),
      href: `/admin/projects/${qa.projectId}`,
    });
  }

  const paymentTime = (projectDbId: string | undefined, type: string, fallback: Date): Date =>
    (projectDbId
      ? confirmedAt.get(`${projectDbId}:${type === "CLIENT_DOWNPAYMENT" ? "DOWNPAYMENT_VERIFIED" : "BALANCE_VERIFIED"}`)
      : undefined) ?? fallback;

  for (const p of paymentsToday) {
    const leg = p.type === "CLIENT_DOWNPAYMENT" ? "downpayment" : "balance";
    const who = p.project ? `${p.project.client.fullName} (${p.project.projectId}) ` : "";
    events.push({
      id: `payment:${p.id}`,
      kind: "payment",
      at: paymentTime(p.project?.id, p.type, p.date).toISOString(),
      title: `Payment confirmed: ${who}${naira(p.amount)} ${leg}`,
      detail: p.source === "PAYSTACK" ? "Paystack" : "Bank transfer, verified by finance",
      href: "/admin/finance/revenue",
    });
  }

  for (const c of conversionsToday) {
    events.push({
      id: `conversion:${c.project?.id ?? c.unit}`,
      kind: "person",
      at: paymentTime(c.project?.id, "CLIENT_DOWNPAYMENT", c.at).toISOString(),
      title: `Referral converted: ${c.clientName ?? "A client"} — referred by ${c.ambassadorName}`,
      detail: c.project?.code ?? null,
      href: `/admin/ambassadors/${c.ambassadorId}`,
    });
  }

  events.push(...(tierChanges ?? []), ...(contentPosts ?? []));

  // One OUTFLOW Payment per recipient per mark-paid: group the legs it covered.
  const payoutGroups = new Map<string, { recipientName: string; amount: number; month: string; at: Date; legs: number }>();
  for (const r of payoutsPaid) {
    const key = r.paymentId ?? r.id;
    const at = r.paidAt ?? now;
    const group = payoutGroups.get(key);
    if (!group) {
      payoutGroups.set(key, { recipientName: r.recipientName, amount: r.amount, month: r.month, at, legs: 1 });
    } else {
      group.amount += r.amount;
      group.legs += 1;
      if (at > group.at) group.at = at;
    }
  }
  for (const [key, g] of payoutGroups) {
    events.push({
      id: `payout:${key}`,
      kind: "payout",
      at: g.at.toISOString(),
      title: `Payout recorded: ${g.recipientName} — ${naira(g.amount)} (${monthLongLabel(g.month)})`,
      detail: plural(g.legs, "project leg"),
      href: `/admin/finance/payouts?month=${g.month}`,
    });
  }

  for (const d of drawsDistributed) {
    events.push({
      id: `draw:${d.id}`,
      kind: "payout",
      at: (d.distributedAt ?? now).toISOString(),
      title: `Founder draw distributed: ${d.recipient} — ${naira(d.amount)} (${monthLongLabel(d.month)})`,
      detail: DRAW_TYPE_LABELS[d.drawType] ?? null,
      href: "/admin/finance/founder-draws",
    });
  }

  for (const a of newAmbassadors) {
    events.push({
      id: `ambassador:${a.id}`,
      kind: "person",
      at: a.createdAt.toISOString(),
      title: `New ambassador: ${a.fullName} joined (${a.university.abbreviation}) — ${tierLabel(a.tier)} tier`,
      detail: null,
      href: `/admin/ambassadors/${a.id}`,
    });
  }
  for (const w of newWorkers) {
    events.push({
      id: `worker:${w.id}`,
      kind: "person",
      at: w.createdAt.toISOString(),
      title: `New worker: ${w.fullName} joined`,
      detail: null,
      href: `/admin/workers/${w.id}`,
    });
  }
  for (const a of ambassadorApplicationRows) {
    if (!isToday(a.createdAt)) continue;
    events.push({
      id: `ambassador-application:${a.id}`,
      kind: "person",
      at: a.createdAt.toISOString(),
      title: `Ambassador application: ${a.fullName}`,
      detail: null,
      href: "/admin/ambassadors/applications",
    });
  }
  for (const a of workerApps) {
    events.push({
      id: `worker-application:${a.id}`,
      kind: "person",
      at: a.createdAt.toISOString(),
      title: `Worker application: ${a.fullName}`,
      detail: null,
      href: "/admin/workers/applications",
    });
  }

  if (researchLedger) {
    events.push(...researchLedger);
  } else {
    for (const r of rerunReviews) {
      const declined = r.status === "REJECTED";
      events.push({
        id: `rerun:${r.id}`,
        kind: declined ? "warning" : "research",
        at: (r.reviewedAt ?? now).toISOString(),
        title: `Research re-run ${declined ? "declined" : "approved"}: ${r.project.projectId}`,
        detail: null,
        href: "/admin/research-requests",
      });
    }
    for (const job of researchJobs) {
      const passed = job.status === "PASSED";
      events.push({
        id: `research:${job.id}`,
        kind: passed ? "research" : "warning",
        at: (job.lastStepAt ?? job.updatedAt).toISOString(),
        title: passed
          ? `Research finished: ${job.project.projectId} — ${plural(job._count.references, "reference")}`
          : `Research needs review: ${job.project.projectId}`,
        detail: null,
        href: `/admin/projects/${job.project.id}`,
      });
    }
  }

  for (const v of releases) {
    events.push({
      id: `release:${v.id}`,
      kind: "document",
      at: (v.releasedAt ?? now).toISOString(),
      title: `Released to client: ${v.deliverable.project.projectId} — ${v.deliverable.title}`,
      detail: null,
      href: `/admin/projects/${v.deliverable.project.id}?tab=documents`,
    });
  }

  // A project whose due day was yesterday became overdue at midnight (WAT) today.
  for (const p of overdueAll) {
    if (!p.internalDeadline || watDayStart(p.internalDeadline).getTime() !== yesterdayStart.getTime()) continue;
    events.push({
      id: `overdue:${p.id}`,
      kind: "overdue",
      at: start.toISOString(),
      title: `Project overdue: ${p.projectId} — internal deadline passed`,
      detail: null,
      href: `/admin/projects/${p.id}`,
    });
  }

  const seen = new Set<string>();
  const feed = events
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, FEED_LIMIT);

  // ── Today's numbers ────────────────────────────────────────────

  let paymentsAmount = 0;
  let downpayments = 0;
  let balancesCount = 0;
  let yesterdayAmount = 0;
  for (const p of paymentRows) {
    if (!isToday(p.date)) {
      yesterdayAmount += p.amount;
      continue;
    }
    paymentsAmount += p.amount;
    if (p.type === "CLIENT_DOWNPAYMENT") downpayments += 1;
    else balancesCount += 1;
  }

  const completedAt = (r: (typeof completedRows)[number]) => r.finalCompletionDate ?? r.statusLog[0]?.createdAt ?? null;
  const completedToday = completedRows.filter((r) => {
    const at = completedAt(r);
    return at !== null && isToday(at);
  }).length;

  const referralsToday = referrals.rows.filter((r) => isToday(r.at));
  const referrersToday = new Set(referralsToday.map((r) => r.ambassadorId));

  const todayNumbers: TodayNumbers = {
    projectsCompleted: { today: completedToday, yesterday: completedRows.length - completedToday },
    paymentsReceived: {
      amount: Math.round(paymentsAmount),
      count: downpayments + balancesCount,
      downpayments,
      balances: balancesCount,
      yesterdayAmount: Math.round(yesterdayAmount),
    },
    newReferrals: {
      today: referralsToday.length,
      yesterday: referrals.rows.length - referralsToday.length,
      ambassadors: referrersToday.size,
    },
    newConversions: {
      today: countConversions(conversionsToday),
      yesterday: countConversions(conversions.rows.filter((c) => !isToday(c.at))),
    },
  };

  return {
    generatedAt: now.toISOString(),
    dayStart: start.toISOString(),
    dayLabel: formatWatDate(now),
    alerts: { critical, attention },
    feed,
    todayNumbers,
    pending,
  };
}
