import { db } from "@/lib/db";
import {
  COHORT_LABEL,
  COHORT_RECIPIENT_TYPES,
  dueBatches,
  emailsScheduledFor,
  monthBounds,
  undoOpen,
  watMonthKey,
  type Cohort,
} from "@/lib/finance/payout-schedule";
import { isoWeekKey, weekEnd, weekStart } from "@/lib/ambassadors/weeks";
import { execNames, notifyPaidTo, payRecordsTx, PAYABLE_SELECT, type PaidTo } from "@/lib/services/finance/payouts-engine";
import { getActiveCashflow } from "@/lib/services/cashflow";
import { nextId } from "@/lib/services/projects";
import { notifyFinance } from "@/lib/services/notifications";
import { getHqContact } from "@/lib/services/hq-contact";
import { siteUrl } from "@/lib/site-url";
import { sendMailBatch } from "@/lib/mailer";
import { mayNotify } from "@/lib/qa-scope";
import { bankDetailsReminderEmail, payoutPaidEmail } from "@/lib/emails/payout";

/**
 * Payout batches (Phase 5). A batch gathers the ACCRUED records of one cohort,
 * clears them together with a bank reference and confirmation, then — ten
 * minutes later, via the cashflow tick — sends the recipients their emails.
 * The ten-minute gap is the undo window: nothing is told to anyone until it
 * closes, so an undo inside it leaves no trace. Recipients without bank details
 * are never cleared; they stay ACCRUED, show in a separate list, and get a
 * reminder — they never block the rest of the batch.
 *
 * Records are selected fresh at clear time by cohort, status and bank details
 * (not pre-attached), so a refresh never re-attaches an unticked recipient and
 * there is nothing to detach. FOUNDERS are not handled here: founder draws are
 * distributed on /admin/finance/founder-draws.
 */

export class BatchError extends Error {}

type PayoutCohort = Exclude<Cohort, "FOUNDERS">;
const PAYOUT_COHORTS: PayoutCohort[] = ["AMBASSADORS", "WORKERS", "EXECUTIVES"];
function cohortTypes(cohort: PayoutCohort): string[] {
  return COHORT_RECIPIENT_TYPES[cohort];
}

interface Bank {
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
}
function bankComplete(b: Bank | null): boolean {
  return Boolean(b && b.bankName?.trim() && b.accountNumber?.trim() && b.accountName?.trim());
}
function last4(account: string | null | undefined): string | null {
  const digits = (account ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

const RICH_SELECT = {
  id: true,
  recipientType: true,
  recipientId: true,
  recipientName: true,
  amount: true,
  leg: true,
  projectId: true,
  basis: true,
  month: true,
  project: { select: { projectId: true } },
} as const;
type RichRecord = {
  id: string;
  recipientType: string;
  recipientId: string;
  recipientName: string;
  amount: number;
  leg: string;
  projectId: string | null;
  basis: string;
  month: string;
  project: { projectId: string } | null;
};

export interface RecipientGroup {
  key: string;
  recipientType: string;
  recipientId: string;
  name: string;
  userId: string | null;
  hasBank: boolean;
  bank: Bank | null;
  accountLast4: string | null;
  recordIds: string[];
  total: number;
  lines: { label: string; amount: number }[];
}

/** Resolve every record's recipient to a bank + login, grouped by recipient. */
async function groupRecipients(records: RichRecord[]): Promise<RecipientGroup[]> {
  const execs = await execNames(db, (await getActiveCashflow()).structure);
  const workerIds = [...new Set(records.filter((r) => r.recipientType === "WORKER").map((r) => r.recipientId))];
  const ambIds = [...new Set(records.filter((r) => r.recipientType === "AMBASSADOR").map((r) => r.recipientId))];
  const execRoles = [...new Set(records.filter((r) => r.recipientType === "EXECUTIVE").map((r) => r.recipientId))];
  const directUserIds = [...new Set(records.filter((r) => r.recipientType === "USER").map((r) => r.recipientId))];
  const execUserIds = execRoles.map((role) => execs[role as "HOG" | "COO"]?.userId).filter((x): x is string => Boolean(x));
  const userIds = [...new Set([...directUserIds, ...execUserIds])];

  const [workers, ambs, users] = await Promise.all([
    workerIds.length ? db.worker.findMany({ where: { id: { in: workerIds } }, select: { id: true, userId: true, bankName: true, accountNumber: true, accountName: true } }) : Promise.resolve([]),
    ambIds.length ? db.ambassador.findMany({ where: { id: { in: ambIds } }, select: { id: true, userId: true, bankName: true, accountNumber: true, accountName: true } }) : Promise.resolve([]),
    userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, execProfile: { select: { bankName: true, accountNumber: true, accountName: true } } } }) : Promise.resolve([]),
  ]);
  const workerById = new Map(workers.map((w) => [w.id, w]));
  const ambById = new Map(ambs.map((a) => [a.id, a]));
  const execBankByUser = new Map(users.map((u) => [u.id, u.execProfile] as const));

  const groups = new Map<string, RecipientGroup>();
  for (const r of records) {
    const key = `${r.recipientType}:${r.recipientId}`;
    let userId: string | null = null;
    let bank: Bank | null = null;
    if (r.recipientType === "WORKER") {
      const w = workerById.get(r.recipientId);
      userId = w?.userId ?? null;
      bank = w ? { bankName: w.bankName, accountNumber: w.accountNumber, accountName: w.accountName } : null;
    } else if (r.recipientType === "AMBASSADOR") {
      const a = ambById.get(r.recipientId);
      userId = a?.userId ?? null;
      bank = a ? { bankName: a.bankName, accountNumber: a.accountNumber, accountName: a.accountName } : null;
    } else if (r.recipientType === "USER") {
      userId = r.recipientId;
      bank = execBankByUser.get(r.recipientId) ?? null;
    } else {
      userId = execs[r.recipientId as "HOG" | "COO"]?.userId ?? null;
      bank = userId ? (execBankByUser.get(userId) ?? null) : null;
    }
    const existing =
      groups.get(key) ??
      ({ key, recipientType: r.recipientType, recipientId: r.recipientId, name: r.recipientName, userId, hasBank: bankComplete(bank), bank, accountLast4: last4(bank?.accountNumber), recordIds: [], total: 0, lines: [] } as RecipientGroup);
    existing.recordIds.push(r.id);
    existing.total = Math.round(existing.total + r.amount);
    const projectLabel = r.project?.projectId ? `${r.basis} · ${r.project.projectId}` : r.basis;
    existing.lines.push({ label: projectLabel, amount: Math.round(r.amount) });
    groups.set(key, existing);
  }
  return [...groups.values()];
}

// ── Building / viewing ─────────────────────────────────────────────────────

const UNPAID = { in: ["PENDING", "ACCRUED"] };

/** Ensure the READY header for (cohort, periodKey) exists; returns its id. */
export async function ensureBatch(due: { cohort: PayoutCohort; periodKey: string; periodStart: Date; periodEnd: Date }, builtBy: string): Promise<string> {
  const existing = await db.payoutBatch.findUnique({ where: { cohort_periodKey: { cohort: due.cohort, periodKey: due.periodKey } }, select: { id: true } });
  if (existing) return existing.id;
  try {
    const created = await db.payoutBatch.create({
      data: { cohort: due.cohort, periodKey: due.periodKey, periodStart: due.periodStart, periodEnd: due.periodEnd, status: "READY", builtBy },
      select: { id: true },
    });
    return created.id;
  } catch {
    // A concurrent build won the unique race; return the existing one.
    const row = await db.payoutBatch.findUnique({ where: { cohort_periodKey: { cohort: due.cohort, periodKey: due.periodKey } }, select: { id: true } });
    if (!row) throw new BatchError("Could not build the batch");
    return row.id;
  }
}

export interface BatchView {
  id: string;
  cohort: PayoutCohort;
  cohortLabel: string;
  periodKey: string;
  status: string;
  payable: RecipientGroup[];
  missingBank: RecipientGroup[];
  payableTotal: number;
  clearedAt: string | null;
  emailsScheduledAt: string | null;
  undoOpen: boolean;
  emailsSentAt: string | null;
  batchReference: string | null;
  bankConfirmationFileId: string | null;
}

/** The current state of a cohort's batch: who is payable now, and who is held for missing bank details. */
export async function getBatchView(cohort: PayoutCohort, builtBy: string, now: Date = new Date()): Promise<BatchView> {
  const found = dueBatches(now).find((d) => d.cohort === cohort);
  const due = found ? { cohort, periodKey: found.periodKey, periodStart: found.periodStart, periodEnd: found.periodEnd } : currentPeriod(cohort, now);
  const id = await ensureBatch(due, builtBy);
  const batch = await db.payoutBatch.findUniqueOrThrow({ where: { id } });

  // Everything owed to this cohort that is not already in a batch.
  const owed = (await db.payoutRecord.findMany({
    where: { recipientType: { in: cohortTypes(cohort) }, status: UNPAID, batchId: null },
    select: RICH_SELECT,
    orderBy: { createdAt: "asc" },
  })) as RichRecord[];
  // Plus whatever this batch already cleared (so a CLEARED view still shows what was paid).
  const paid = (await db.payoutRecord.findMany({ where: { batchId: id }, select: RICH_SELECT, orderBy: { createdAt: "asc" } })) as RichRecord[];

  const owedGroups = await groupRecipients(owed);
  const paidGroups = await groupRecipients(paid);
  const payable = batch.status === "READY" ? owedGroups.filter((g) => g.hasBank) : paidGroups;
  const missingBank = batch.status === "READY" ? owedGroups.filter((g) => !g.hasBank) : [];

  return {
    id: batch.id,
    cohort,
    cohortLabel: COHORT_LABEL[cohort],
    periodKey: batch.periodKey,
    status: batch.status,
    payable,
    missingBank,
    payableTotal: payable.reduce((s, g) => s + g.total, 0),
    clearedAt: batch.clearedAt?.toISOString() ?? null,
    emailsScheduledAt: batch.emailsScheduledAt?.toISOString() ?? null,
    undoOpen: batch.status === "CLEARED" && undoOpen(batch.emailsScheduledAt, now),
    emailsSentAt: batch.emailsSentAt?.toISOString() ?? null,
    batchReference: batch.batchReference,
    bankConfirmationFileId: batch.bankConfirmationFileId,
  };
}

function currentPeriod(cohort: PayoutCohort, now: Date): { cohort: PayoutCohort; periodKey: string; periodStart: Date; periodEnd: Date } {
  // For an on-demand view off-schedule, key by the current period, the same way
  // dueBatches would for this cohort today.
  if (cohort === "AMBASSADORS") {
    return { cohort, periodKey: isoWeekKey(now), periodStart: weekStart(now), periodEnd: weekEnd(now) };
  }
  const key = watMonthKey(now);
  const b = monthBounds(key);
  return { cohort, periodKey: key, periodStart: b.start, periodEnd: b.end };
}

// ── Clearing ───────────────────────────────────────────────────────────────

export interface ClearBatchInput {
  paymentMethod: string;
  paymentMethodDetail?: string | null;
  batchReference: string;
  bankConfirmationFileId: string;
  notes?: string | null;
  /** Recipient keys ("WORKER:<id>") to leave out this time; they stay ACCRUED. */
  excludeRecipientKeys?: string[];
}

export interface ClearBatchResult {
  recipients: number;
  records: number;
  totalAmount: number;
  undoDeadline: string;
}

/**
 * Clear a READY batch: pay every payable recipient (ACCRUED, has bank, not
 * excluded) through the shared pay helper, stamp them with this batch, and open
 * the ten-minute undo window. No email or notification goes out now — the tick
 * sends them when the window closes.
 */
export async function clearPayoutBatch(batchId: string, input: ClearBatchInput, actorId: string): Promise<ClearBatchResult> {
  if (!input.batchReference?.trim()) throw new BatchError("A payment reference is required.");
  if (!input.bankConfirmationFileId) throw new BatchError("Attach the bank-transfer confirmation first.");

  const header = await db.payoutBatch.findUnique({ where: { id: batchId }, select: { id: true, cohort: true, status: true } });
  if (!header) throw new BatchError("Batch not found.");
  if (header.status !== "READY") throw new BatchError(`This batch is already ${header.status.toLowerCase()}.`);
  const cohort = header.cohort as PayoutCohort;
  const exclude = new Set(input.excludeRecipientKeys ?? []);

  const execs = await execNames(db, (await getActiveCashflow()).structure);
  const firstPaymentId = await nextId("PAYMENT");
  const firstNumber = Number(/(\d+)$/.exec(firstPaymentId)?.[1] ?? 0);
  const clearedAt = new Date();
  const emailsScheduledAt = emailsScheduledFor(clearedAt);

  const outcome = await db.$transaction(
    async (tx) => {
      // Claim the batch READY -> CLEARED (one clearer wins).
      const claimed = await tx.payoutBatch.updateMany({ where: { id: batchId, status: "READY" }, data: { status: "CLEARED" } });
      if (claimed.count !== 1) throw new BatchError("Someone else just cleared this batch. Refresh the page.");

      // Select the payable records now, with the bank fields needed to exclude missing-bank recipients.
      const owed = (await tx.payoutRecord.findMany({
        where: { recipientType: { in: cohortTypes(cohort) }, status: UNPAID, batchId: null },
        select: RICH_SELECT,
        orderBy: { createdAt: "asc" },
      })) as RichRecord[];
      const groups = await groupRecipients(owed);
      const toPay = groups.filter((g) => g.hasBank && !exclude.has(g.key));
      const payIds = new Set(toPay.flatMap((g) => g.recordIds));
      const pending = owed.filter((r) => payIds.has(r.id)).map((r) => ({ id: r.id, recipientType: r.recipientType, recipientId: r.recipientId, recipientName: r.recipientName, amount: r.amount, leg: r.leg, projectId: r.projectId, month: r.month }));

      const result = pending.length
        ? await payRecordsTx(tx, pending, { paidById: actorId, reference: input.batchReference.trim(), paidOn: clearedAt, execs, batchId, firstNumber })
        : ({ paidTo: [] as PaidTo[], records: 0, totalAmount: 0 } satisfies Awaited<ReturnType<typeof payRecordsTx>>);

      await tx.payoutBatch.update({
        where: { id: batchId },
        data: {
          clearedAt,
          clearedById: actorId,
          paymentMethod: input.paymentMethod,
          paymentMethodDetail: input.paymentMethodDetail ?? null,
          batchReference: input.batchReference.trim(),
          bankConfirmationFileId: input.bankConfirmationFileId,
          notes: input.notes?.trim() || null,
          emailsScheduledAt,
          totalAmount: result.totalAmount,
          recipientCount: result.paidTo.length,
        },
      });
      return result;
    },
    { timeout: 60_000, maxWait: 15_000 }
  );

  await notifyFinance({
    title: `${COHORT_LABEL[cohort]} payout cleared`,
    message: `${outcome.records} payment${outcome.records === 1 ? "" : "s"} to ${outcome.paidTo.length} recipient${outcome.paidTo.length === 1 ? "" : "s"} totalling ₦${Math.round(outcome.totalAmount).toLocaleString("en-NG")}. Emails go out in 10 minutes; undo until then.`,
    type: "info",
    link: "/admin/finance/payouts",
  });

  return { recipients: outcome.paidTo.length, records: outcome.records, totalAmount: outcome.totalAmount, undoDeadline: emailsScheduledAt.toISOString() };
}

// ── Undo ─────────────────────────────────────────────────────────────────

/** Roll back a cleared batch while the undo window is open: emails were never sent. */
export async function undoPayoutBatch(batchId: string, actorId: string, now: Date = new Date()): Promise<{ records: number }> {
  const batch = await db.payoutBatch.findUnique({ where: { id: batchId }, select: { id: true, status: true, emailsScheduledAt: true } });
  if (!batch) throw new BatchError("Batch not found.");
  if (batch.status !== "CLEARED") throw new BatchError(`This batch is ${batch.status.toLowerCase()} — it cannot be undone.`);
  if (!undoOpen(batch.emailsScheduledAt, now)) throw new BatchError("The undo window has closed — the emails have gone out.");

  return db.$transaction(
    async (tx) => {
      // Claim the batch CLEARED (and still within the window) -> UNDONE.
      const claimed = await tx.payoutBatch.updateMany({ where: { id: batchId, status: "CLEARED", emailsScheduledAt: { gt: now } }, data: { status: "UNDONE", undoneAt: now, undoneById: actorId } });
      if (claimed.count !== 1) throw new BatchError("The undo window just closed. Refresh the page.");

      const records = await tx.payoutRecord.findMany({ where: { batchId }, select: { id: true, leg: true, projectId: true, paymentId: true } });
      const recordIds = records.map((r) => r.id);
      const paymentIds = [...new Set(records.map((r) => r.paymentId).filter((x): x is string => Boolean(x)))];

      // Records back to ACCRUED, every paid stamp (and the batch link) cleared.
      await tx.payoutRecord.updateMany({ where: { id: { in: recordIds } }, data: { status: "ACCRUED", paidAt: null, paidById: null, paidToUserId: null, paymentId: null, batchId: null } });
      // The OUTFLOW Payments the clear minted.
      if (paymentIds.length) await tx.payment.deleteMany({ where: { id: { in: paymentIds } } });
      // Un-flip the project flags this batch set.
      const byLeg = (leg: string) => records.filter((r) => r.leg === leg).map((r) => r.projectId).filter((x): x is string => Boolean(x));
      const w = byLeg("WORKER");
      const a = byLeg("AMBASSADOR");
      const p = byLeg("PARENT");
      if (w.length) await tx.project.updateMany({ where: { id: { in: w } }, data: { workerPayoutPaid: false } });
      if (a.length) await tx.project.updateMany({ where: { id: { in: a } }, data: { ambassadorCommPaid: false } });
      if (p.length) await tx.project.updateMany({ where: { id: { in: p } }, data: { parentCommPaid: false } });

      return { records: recordIds.length };
    },
    { timeout: 60_000, maxWait: 15_000 }
  );
}

// ── Finalise (the tick sends the delayed emails) ─────────────────────────────

/**
 * Send the confirmation emails for every batch whose undo window has closed,
 * exactly once (a lease stops two ticks sending twice). Called by the cashflow
 * tick. Returns how many batches it finalised.
 */
export async function finalizeDueBatches(now: Date = new Date()): Promise<{ finalised: number }> {
  const due = await db.payoutBatch.findMany({
    where: { status: "CLEARED", emailsScheduledAt: { lte: now }, emailsStartedAt: null },
    select: { id: true },
  });
  let finalised = 0;
  for (const { id } of due) {
    // Lease: only one tick finalises this batch.
    const claimed = await db.payoutBatch.updateMany({ where: { id, status: "CLEARED", emailsStartedAt: null }, data: { emailsStartedAt: now } });
    if (claimed.count !== 1) continue;
    try {
      await finalizeBatch(id);
      finalised += 1;
    } catch (error) {
      console.error("[cashflow] finalise failed for batch", id, error instanceof Error ? error.message : error);
    }
  }
  return { finalised };
}

async function finalizeBatch(batchId: string): Promise<void> {
  const batch = await db.payoutBatch.findUniqueOrThrow({ where: { id: batchId } });
  const records = (await db.payoutRecord.findMany({ where: { batchId }, select: RICH_SELECT, orderBy: { createdAt: "asc" } })) as RichRecord[];
  const groups = await groupRecipients(records);
  const hq = await getHqContact();
  const site = siteUrl();
  const kindFor = (t: string): "worker" | "ambassador" | "executive" => (t === "WORKER" ? "worker" : t === "AMBASSADOR" ? "ambassador" : "executive");
  const dashFor = (t: string) => (t === "WORKER" ? `${site}/worker` : t === "AMBASSADOR" ? `${site}/ambassador` : `${site}/admin/earnings`);
  const periodLabel = batch.cohort === "AMBASSADORS" ? `week ${batch.periodKey}` : batch.periodKey;

  const sendable = groups.filter((g) => g.userId); // for the in-app bell
  // Build the emails for recipients we can email (resolve a login email), filtered by QA scope.
  const userIds = [...new Set(groups.map((g) => g.userId).filter((x): x is string => Boolean(x)))];
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }) : [];
  const emailByUser = new Map(users.map((u) => [u.id, u.email] as const));

  const messages: { to: string; subject: string; html: string; text: string; group: RecipientGroup }[] = [];
  for (const g of groups) {
    const to = g.userId ? emailByUser.get(g.userId) : null;
    if (!to || !mayNotify(to)) continue;
    const mail = payoutPaidEmail({
      recipientKind: kindFor(g.recipientType),
      name: g.name,
      amount: g.total,
      periodLabel,
      lines: g.lines.slice(0, 20),
      accountLast4: g.accountLast4,
      dashboardUrl: dashFor(g.recipientType),
      reference: batch.batchReference,
      hq: { phone: hq.phone },
    });
    messages.push({ to, ...mail, group: g });
  }

  const results = messages.length ? await sendMailBatch(messages.map((m) => ({ to: m.to, subject: m.subject, html: m.html, text: m.text }))) : [];
  const report = messages.map((m, i) => ({ recipientType: m.group.recipientType, recipientId: m.group.recipientId, to: m.to, ok: results[i]?.ok ?? false, error: results[i]?.error ?? null, at: new Date().toISOString() }));
  for (let i = 0; i < messages.length; i++) {
    await db.emailLog.create({ data: { kind: "payout-paid", to: messages[i].to, ok: results[i]?.ok ?? false, error: results[i]?.error ?? null } }).catch(() => undefined);
  }

  // The in-app bell goes out now too (also deferred until the window closed).
  await notifyPaidTo(sendable.map((g) => ({ recipientType: g.recipientType as PaidTo["recipientType"], recipientId: g.recipientId, userId: g.userId, amount: g.total })));

  await db.payoutBatch.update({ where: { id: batchId }, data: { status: "FINALIZED", emailsSentAt: new Date(), emailReport: report } });
}

// ── Missing bank details reminders (the tick) ────────────────────────────────

/**
 * Email anyone with money owed but no bank details, once per cohort period, so
 * they add their details for the next run. Never blocks a batch.
 */
export async function sendBankReminders(now: Date = new Date()): Promise<{ sent: number }> {
  const hq = await getHqContact();
  const site = siteUrl();
  let sent = 0;
  for (const cohort of PAYOUT_COHORTS) {
    const owed = (await db.payoutRecord.findMany({ where: { recipientType: { in: cohortTypes(cohort) }, status: UNPAID, batchId: null }, select: RICH_SELECT })) as RichRecord[];
    if (!owed.length) continue;
    const groups = await groupRecipients(owed);
    const missing = groups.filter((g) => !g.hasBank && g.userId);
    if (!missing.length) continue;
    const periodKey = (dueBatches(now).find((d) => d.cohort === cohort)?.periodKey ?? currentPeriod(cohort, now).periodKey);
    const userIds = missing.map((g) => g.userId as string);
    const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } });
    const emailByUser = new Map(users.map((u) => [u.id, u.email] as const));
    const addBankUrl = `${site}/${cohort === "WORKERS" ? "worker" : cohort === "AMBASSADORS" ? "ambassador" : "admin/settings/bank"}/profile`;

    const toSend: { to: string; subject: string; html: string; text: string }[] = [];
    for (const g of missing) {
      const to = g.userId ? emailByUser.get(g.userId) : null;
      if (!to || !mayNotify(to)) continue;
      // Once per recipient per period.
      const kind = `bank-reminder:${cohort}:${periodKey}`;
      const already = await db.emailLog.count({ where: { kind, to, ok: true } });
      if (already > 0) continue;
      const mail = bankDetailsReminderEmail({ name: g.name, amount: g.total, addBankUrl: cohort === "EXECUTIVES" ? `${site}/admin/settings/bank` : addBankUrl, hq: { phone: hq.phone } });
      toSend.push({ to, ...mail });
    }
    if (!toSend.length) continue;
    const results = await sendMailBatch(toSend);
    for (let i = 0; i < toSend.length; i++) {
      await db.emailLog.create({ data: { kind: `bank-reminder:${cohort}:${periodKey}`, to: toSend[i].to, ok: results[i]?.ok ?? false, error: results[i]?.error ?? null } }).catch(() => undefined);
      if (results[i]?.ok) sent += 1;
    }
  }
  return { sent };
}

// ── The tick's batch duties ──────────────────────────────────────────────────

export interface BatchHistoryRow {
  id: string;
  cohort: string;
  cohortLabel: string;
  periodKey: string;
  status: string;
  totalAmount: number;
  recipientCount: number;
  clearedAt: string | null;
  emailsSentAt: string | null;
  batchReference: string | null;
  bankConfirmationFileId: string | null;
}

/** Recent cleared/finalised/undone batches, newest first. */
export async function batchHistory(limit = 20): Promise<BatchHistoryRow[]> {
  const rows = await db.payoutBatch.findMany({
    where: { status: { in: ["CLEARED", "FINALIZED", "UNDONE"] } },
    orderBy: { clearedAt: "desc" },
    take: limit,
    select: { id: true, cohort: true, periodKey: true, status: true, totalAmount: true, recipientCount: true, clearedAt: true, emailsSentAt: true, batchReference: true, bankConfirmationFileId: true },
  });
  return rows.map((r) => ({
    id: r.id,
    cohort: r.cohort,
    cohortLabel: COHORT_LABEL[r.cohort as Cohort] ?? r.cohort,
    periodKey: r.periodKey,
    status: r.status,
    totalAmount: Math.round(r.totalAmount),
    recipientCount: r.recipientCount,
    clearedAt: r.clearedAt?.toISOString() ?? null,
    emailsSentAt: r.emailsSentAt?.toISOString() ?? null,
    batchReference: r.batchReference,
    bankConfirmationFileId: r.bankConfirmationFileId,
  }));
}

export interface PayoutQueue {
  cohorts: BatchView[];
  history: BatchHistoryRow[];
  schedulerQuiet: boolean;
}

/** The whole batch queue for the CFO: the three cohorts' current batches, recent history, scheduler health. */
export async function getPayoutQueue(builtBy: string, schedulerQuiet: boolean, now: Date = new Date()): Promise<PayoutQueue> {
  const cohorts: BatchView[] = [];
  for (const cohort of PAYOUT_COHORTS) cohorts.push(await getBatchView(cohort, builtBy, now));
  return { cohorts, history: await batchHistory(20), schedulerQuiet };
}

/** Build the batches due today (so they appear in the queue), skipping FOUNDERS. */
export async function buildDueBatches(now: Date = new Date()): Promise<{ built: number }> {
  let built = 0;
  for (const due of dueBatches(now)) {
    if (due.cohort === "FOUNDERS") continue; // founder draws are distributed on their own page
    await ensureBatch({ cohort: due.cohort as PayoutCohort, periodKey: due.periodKey, periodStart: due.periodStart, periodEnd: due.periodEnd }, "tick");
    built += 1;
  }
  return { built };
}
