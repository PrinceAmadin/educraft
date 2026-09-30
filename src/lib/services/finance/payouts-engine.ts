import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { personLegs, workerLeg, workersPercent, type ProjectLegs } from "@/lib/finance/commission-config";
import { TIER_LABELS, isActiveRow, type CashflowStructure, type PersonTrigger } from "@/lib/finance/cashflow-types";
import {
  CREATE_STATUS,
  NOT_OWED,
  UNPAID_STATUSES,
  isPaid,
  reconcileAction,
  triggerFired,
  type PayoutStatus,
} from "@/lib/finance/payout-status";
import { cashflowForProject, getActiveCashflow } from "@/lib/services/cashflow";
import { monthKeyOf } from "@/lib/services/finance/buckets";
import { monthLabel, monthRange } from "@/lib/services/finance/surplus";
import { nextId } from "@/lib/services/projects";
import { formatId } from "@/lib/id-format";
import { notifyFinance, notifyRole, notifyUsers } from "@/lib/services/notifications";
import { formatNaira } from "@/lib/utils";
import { recountAmbassador } from "@/lib/services/ambassador-platform/conversions";

/**
 * The payout engine. Every naira owed out on a project is one PayoutRecord
 * per leg and recipient — WORKER, AMBASSADOR (the referrer's rate), PARENT
 * (the Core's override), HOG, COO, and any person row the founder added to
 * the cashflow structure. Each project is computed under ITS version of the
 * structure (stamped at creation); a row is produced when its trigger fires
 * (the downpayment, full payment or completion) and reconciled whenever the
 * legs change; `calculateMonthlyPayouts` re-reconciles a whole month.
 * Marking paid is a claim (PENDING -> PAID under a count check) that writes
 * one OUTFLOW Payment per recipient and flips the project's legacy paid
 * flags, so the worker and ambassador portals keep reading the same truth.
 */

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof db;

export class PayoutError extends Error {}

/**
 * The built-in legs, plus BONUS (an ambassador quarterly bonus, keyed by
 * `bonusKey`) and the upper-cased key of any person row the founder added.
 */
export type PayoutLeg = "WORKER" | "AMBASSADOR" | "PARENT" | "HOG" | "COO" | "BONUS" | (string & {});
/** USER: a person row that pays one named login (recipientId is the User id). */
export type RecipientType = "WORKER" | "AMBASSADOR" | "EXECUTIVE" | "USER";
export type ExecRecipient = "HOG" | "COO";

const PROJECT_SELECT = {
  id: true,
  projectId: true,
  status: true,
  isProBono: true,
  price: true,
  createdAt: true,
  cashflowVersionId: true,
  balanceStatus: true,
  balanceDate: true,
  workerPayout: true,
  workerPayoutRate: true,
  ambassadorCommission: true,
  ambassadorCommRate: true,
  parentCommission: true,
  parentCommRate: true,
  ambassadorId: true,
  parentAmbassadorId: true,
  workerId: true,
  finalCompletionDate: true,
  downpaymentStatus: true,
  downpaymentDate: true,
  workerPayoutPaid: true,
  ambassadorCommPaid: true,
  parentCommPaid: true,
  worker: { select: { id: true, fullName: true } },
  ambassador: { select: { id: true, fullName: true, tier: true, parentId: true } },
  parentAmbassador: { select: { id: true, fullName: true } },
} satisfies Prisma.ProjectSelect;

type ProjectForLegs = Prisma.ProjectGetPayload<{ select: typeof PROJECT_SELECT }>;

export interface LegRow {
  leg: PayoutLeg;
  recipientType: RecipientType;
  recipientId: string;
  recipientName: string;
  amount: number;
  basis: string;
  /** When this leg becomes owed, from the structure the project is computed under. */
  trigger: PersonTrigger;
  /** The cashflow Level-1 key this leg belongs to (workers, ambassador, hog, coo, …). */
  ruleKey: string;
  /** The rate this leg was computed at, in percent (for the record's audit columns). */
  ratePercent: number;
}

export interface ExecNames {
  HOG: { name: string; userId: string | null };
  COO: { name: string; userId: string | null };
  /** Logins named by person rows the founder added (`assignedUserId`), by user id. */
  users: Record<string, { name: string; userId: string }>;
}

/**
 * The HOG and COO by role (the exec profile's name, else the login's, else
 * the title), plus the logins any custom person row of the structure names.
 */
export async function execNames(client: Db = db, s?: CashflowStructure): Promise<ExecNames> {
  const assigned = [...new Set((s?.level1 ?? []).map((r) => (r.recipients === "user" ? r.assignedUserId : null)).filter((x): x is string => Boolean(x)))];
  const users = await client.user.findMany({
    where: { OR: [{ role: { in: ["HOG", "COO"] }, isActive: true }, ...(assigned.length ? [{ id: { in: assigned } }] : [])] },
    select: { id: true, role: true, displayName: true, email: true, execProfile: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
  const pick = (role: ExecRecipient, fallback: string) => {
    const u = users.find((x) => x.role === role && x.role === role);
    return { name: u?.execProfile?.fullName ?? u?.displayName ?? fallback, userId: u?.id ?? null };
  };
  const byId: ExecNames["users"] = {};
  for (const id of assigned) {
    const u = users.find((x) => x.id === id);
    if (u) byId[id] = { name: u.execProfile?.fullName ?? u.displayName ?? u.email, userId: u.id };
  }
  return { HOG: pick("HOG", "Head of Growth"), COO: pick("COO", "Chief Operating Officer"), users: byId };
}

function pct(rate: number | null | undefined, fallback: number): string {
  const r = rate ?? fallback;
  return `${Math.round(r * 100) / 100}%`;
}

/**
 * The tier a commission rate belongs to (10% Bronze, 12% Silver, 15% Gold or
 * Platinum under v1), for the record's basis. An ambassador's tier moves with
 * every conversion, so the tier at allocation is read from the rate the job
 * was allocated at, not from today's tier.
 */
function rateTierLabel(ratePercent: number | null | undefined, s: CashflowStructure): string {
  const rate = ratePercent ?? 0;
  const tiers = s.tiers.filter((t) => Math.abs(t.ratePercent - rate) < 1e-6).map((t) => TIER_LABELS[t.key]);
  return tiers.length ? `${tiers.join(" or ")} tier` : "custom rate";
}

function triggerOfRecipients(s: CashflowStructure, recipients: "workers" | "ambassadors"): PersonTrigger {
  const row = s.level1.find((r) => r.kind === "person" && r.recipients === recipients);
  return row?.trigger ?? (recipients === "ambassadors" ? "downpayment" : "completion");
}

/** The legs a project owes, whole naira, zero amounts left out. Pure given the names and the structure. */
export function legsFor(p: ProjectForLegs, execs: ExecNames, s: CashflowStructure): LegRow[] {
  if (p.isProBono || p.price <= 0) return [];
  const legs: ProjectLegs = p;
  const out: LegRow[] = [];
  const lowestTier = [...s.tiers].sort((a, b) => a.minConversions - b.minConversions)[0]?.ratePercent ?? 0;

  if (p.workerId && p.worker) {
    const amount = workerLeg(legs, s);
    if (amount > 0) {
      const rate = p.workerPayoutRate ?? workersPercent(s);
      out.push({
        leg: "WORKER",
        recipientType: "WORKER",
        recipientId: p.worker.id,
        recipientName: p.worker.fullName,
        amount,
        basis: `${pct(p.workerPayoutRate, workersPercent(s))} worker rate`,
        trigger: triggerOfRecipients(s, "workers"),
        ruleKey: "workers",
        ratePercent: rate,
      });
    }
  }
  if (p.ambassadorId && p.ambassador && (p.ambassadorCommission ?? 0) > 0) {
    const sub = p.parentAmbassadorId != null;
    const rate = p.ambassadorCommRate ?? lowestTier;
    out.push({
      leg: "AMBASSADOR",
      recipientType: "AMBASSADOR",
      recipientId: p.ambassador.id,
      recipientName: p.ambassador.fullName,
      amount: Math.round(p.ambassadorCommission ?? 0),
      basis: `${pct(p.ambassadorCommRate, lowestTier)} ${sub ? "Sub-Ambassador" : "ambassador"} rate (${rateTierLabel(p.ambassadorCommRate, s)})`,
      trigger: triggerOfRecipients(s, "ambassadors"),
      ruleKey: "ambassador",
      ratePercent: rate,
    });
  }
  if (p.parentAmbassadorId && p.parentAmbassador && (p.parentCommission ?? 0) > 0) {
    out.push({
      leg: "PARENT",
      recipientType: "AMBASSADOR",
      recipientId: p.parentAmbassador.id,
      recipientName: p.parentAmbassador.fullName,
      amount: Math.round(p.parentCommission ?? 0),
      basis: `${pct(p.parentCommRate, 0)} Core override`,
      trigger: triggerOfRecipients(s, "ambassadors"),
      ruleKey: "ambassador",
      ratePercent: p.parentCommRate ?? 0,
    });
  }
  for (const leg of personLegs(legs, s)) {
    const recipientId = leg.role ?? leg.assignedUserId;
    if (!recipientId) continue;
    const name = leg.role ? execs[leg.role].name : (execs.users[recipientId]?.name ?? leg.label);
    out.push({
      leg: leg.key.toUpperCase(),
      recipientType: leg.role ? "EXECUTIVE" : "USER",
      recipientId,
      recipientName: name,
      amount: leg.amount,
      basis: `${pct(leg.ratePercent, 0)} ${leg.label} commission${leg.role === "HOG" ? " on ambassador-driven project" : leg.role === "COO" ? " on delivered project" : ""}`,
      trigger: leg.trigger,
      ruleKey: leg.key,
      ratePercent: leg.ratePercent,
    });
  }
  return out;
}

function legacyPaid(p: ProjectForLegs, leg: PayoutLeg): boolean {
  if (leg === "WORKER") return p.workerPayoutPaid;
  if (leg === "AMBASSADOR") return p.ambassadorCommPaid;
  if (leg === "PARENT") return p.parentCommPaid;
  return false;
}

export interface ReconcileResult {
  created: number;
  updated: number;
  cancelled: number;
}

const DEAD_STATUSES = ["CANCELLED", "REFUNDED"];

/**
 * Bring a project's PayoutRecords in line with what it owes now, under the
 * cashflow structure the project was created under.
 *
 * - A leg triggered at the downpayment (the ambassador's commission and the
 *   Core's override in v1) is owed as soon as the referred client's
 *   downpayment is confirmed (the conversion — "commission is paid to
 *   ambassadors immediately when the client pays the downpayment"), in the
 *   month of that downpayment, and stays there through completion.
 * - A leg triggered at completion (the worker, HOG and COO in v1) is owed when
 *   the project is COMPLETED, in the completion month (`opts.month` overrides
 *   it for a monthly recalculation); one triggered at full payment when the
 *   balance is verified.
 * - A leg no longer produced on a LIVE project (the ambassador was removed, a
 *   rate went to zero) has its owed record CANCELLED. A cancelled or refunded
 *   project owes nothing new, but its already-ACCRUED records are left alone in
 *   Phase 3 — a commission is undone only by a refund (a REVERSED record with a
 *   reason, Phase 6), never by a page load; today's cancel still cancels unpaid
 *   rows because the project goes dead and its legs stop being produced.
 * - A PAID or REVERSED record is settled and never touched. A leg already
 *   marked paid on the project before the engine existed is recorded as PAID.
 */
export async function reconcileProjectPayouts(tx: Tx, projectDbId: string, opts: { month?: string } = {}): Promise<ReconcileResult> {
  const project = await tx.project.findUnique({ where: { id: projectDbId }, select: PROJECT_SELECT });
  if (!project) return { created: 0, updated: 0, cancelled: 0 };
  const s = await cashflowForProject(project);
  const execs = await execNames(tx, s);
  const alive = !DEAD_STATUSES.includes(project.status);
  const state = {
    alive,
    downpaymentVerified: project.downpaymentStatus === "Verified",
    balanceVerified: project.balanceStatus === "Verified",
    completed: project.status === "COMPLETED",
  };
  const all = alive ? legsFor(project, execs, s) : [];
  const produced = all.filter((l) => triggerFired(l.trigger, state));
  const completionMonth = opts.month ?? monthKeyOf(project.finalCompletionDate ?? new Date());
  const conversionMonth = monthKeyOf(project.downpaymentDate ?? project.finalCompletionDate ?? new Date());
  const fullPaymentMonth = monthKeyOf(project.balanceDate ?? project.finalCompletionDate ?? new Date());
  const existing = await tx.payoutRecord.findMany({ where: { projectId: projectDbId } });
  const result: ReconcileResult = { created: 0, updated: 0, cancelled: 0 };
  const keep = new Set<string>();
  // Ambassadors whose records change here: their cached lifetime earnings follow (Phase 3).
  const touched = new Set<string>();

  for (const leg of produced) {
    const key = `${leg.leg}:${leg.recipientId}`;
    keep.add(key);
    const row = existing.find((r) => r.leg === leg.leg && r.recipientId === leg.recipientId);
    // A downpayment leg stays in the month it was first recorded in: records
    // made before Phase 3 (at completion) are not moved to an earlier month.
    const month = leg.trigger === "downpayment" ? (row?.month ?? conversionMonth) : leg.trigger === "full_payment" ? (row?.month ?? fullPaymentMonth) : completionMonth;
    const changed =
      !!row &&
      (row.amount !== leg.amount ||
        row.basis !== leg.basis ||
        row.recipientName !== leg.recipientName ||
        row.recipientType !== leg.recipientType ||
        row.month !== month ||
        row.ruleKey !== leg.ruleKey ||
        row.ratePercent !== leg.ratePercent ||
        row.triggerEventKey !== leg.trigger ||
        row.cashflowVersionId !== (project.cashflowVersionId ?? null));
    const action = reconcileAction({ existingStatus: (row?.status as PayoutStatus) ?? null, produced: true, changed });
    if (action === "create") {
      const paidBefore = legacyPaid(project, leg.leg);
      await tx.payoutRecord.create({
        data: {
          month,
          leg: leg.leg,
          recipientType: leg.recipientType,
          recipientId: leg.recipientId,
          recipientName: leg.recipientName,
          projectId: projectDbId,
          amount: leg.amount,
          basis: leg.basis,
          status: paidBefore ? "PAID" : CREATE_STATUS,
          ruleKey: leg.ruleKey,
          ratePercent: leg.ratePercent,
          triggerEventKey: leg.trigger,
          cashflowVersionId: project.cashflowVersionId,
          accruedAt: paidBefore ? (project.finalCompletionDate ?? project.downpaymentDate ?? new Date()) : new Date(),
          paidAt: paidBefore ? (project.finalCompletionDate ?? project.downpaymentDate ?? new Date()) : null,
          notes: paidBefore ? "Paid before the payout engine (project flag)" : null,
        },
      });
      result.created += 1;
      if (leg.recipientType === "AMBASSADOR") touched.add(leg.recipientId);
    } else if (action === "update" && row) {
      await tx.payoutRecord.update({
        where: { id: row.id },
        data: {
          amount: leg.amount,
          basis: leg.basis,
          recipientName: leg.recipientName,
          recipientType: leg.recipientType,
          month,
          status: CREATE_STATUS,
          ruleKey: leg.ruleKey,
          ratePercent: leg.ratePercent,
          triggerEventKey: leg.trigger,
          cashflowVersionId: project.cashflowVersionId,
          // A cancelled row coming back to life gets a fresh accrual date; a live one keeps its own.
          ...(row.status === "CANCELLED" ? { accruedAt: row.accruedAt ?? new Date() } : {}),
        },
      });
      result.updated += 1;
      if (leg.recipientType === "AMBASSADOR") touched.add(leg.recipientId);
    }
  }
  for (const row of existing) {
    if (keep.has(`${row.leg}:${row.recipientId}`)) continue;
    if (reconcileAction({ existingStatus: row.status as PayoutStatus, produced: false, changed: false }) !== "cancel") continue;
    await tx.payoutRecord.update({ where: { id: row.id }, data: { status: "CANCELLED", notes: "No longer owed: the project's legs changed" } });
    result.cancelled += 1;
    if (row.recipientType === "AMBASSADOR") touched.add(row.recipientId);
  }
  for (const id of touched) await recountAmbassador(tx, id, s.tiers);
  return result;
}

function monthBounds(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

/** Projects completed in a month: by finalCompletionDate, else by the status log. */
async function completedProjectIds(month: string): Promise<string[]> {
  const { start, end } = monthBounds(month);
  const rows = await db.project.findMany({
    where: {
      status: "COMPLETED",
      isProBono: false,
      OR: [
        { finalCompletionDate: { gte: start, lt: end } },
        { finalCompletionDate: null, statusLog: { some: { toStatus: "COMPLETED", createdAt: { gte: start, lt: end } } } },
      ],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export interface CalculateResult extends ReconcileResult {
  month: string;
  projects: number;
}

/** Referred projects whose downpayment was confirmed in the month (their ambassador legs are owed from then). */
async function convertedProjectIds(month: string): Promise<string[]> {
  const { start, end } = monthBounds(month);
  const rows = await db.project.findMany({
    where: { isProBono: false, ambassadorId: { not: null }, downpaymentStatus: "Verified", status: { notIn: ["CANCELLED", "REFUNDED"] }, downpaymentDate: { gte: start, lt: end } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Re-reconcile every project completed in the month, and every referred project converted in it. Idempotent. */
export async function calculateMonthlyPayouts(month: string): Promise<CalculateResult> {
  const completed = await completedProjectIds(month);
  const converted = (await convertedProjectIds(month)).filter((id) => !completed.includes(id));
  const ids = [...completed, ...converted];
  const totals: CalculateResult = { month, projects: ids.length, created: 0, updated: 0, cancelled: 0 };
  for (const id of ids) {
    // Only completed projects take the month as their completion month; a converted one keeps its own dates.
    const r = await db.$transaction((tx) => reconcileProjectPayouts(tx, id, completed.includes(id) ? { month } : {}), { timeout: 30_000, maxWait: 10_000 });
    totals.created += r.created;
    totals.updated += r.updated;
    totals.cancelled += r.cancelled;
  }
  return totals;
}

// ── Reads ────────────────────────────────────────────────────────────────

export interface PayoutLine {
  recordId: string;
  leg: PayoutLeg;
  /** Null for an ambassador bonus (quarterly challenge / Platinum): no project behind it. */
  projectDbId: string | null;
  projectCode: string | null;
  serviceName: string | null;
  clientName: string | null;
  amount: number;
  basis: string;
  completedAt: string | null;
  status: PayoutStatus;
  paidAt: string | null;
}

export type GroupStatus = "PAID" | "UNPAID" | "PARTLY";

interface GroupBase {
  recipientId: string;
  name: string;
  lines: PayoutLine[];
  total: number;
  paid: number;
  unpaid: number;
  projectCount: number;
  status: GroupStatus;
  /** Latest payment date when anything is paid. */
  paidAt: string | null;
}

export interface Bank {
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
}

export interface WorkerPayoutGroup extends GroupBase {
  code: string;
  bank: Bank;
}

export interface AmbassadorPayoutGroup extends GroupBase {
  code: string;
  tier: string;
  bank: Bank;
  personal: { count: number; amount: number; rate: number | null };
  overrides: { count: number; amount: number };
}

export interface ExecutivePayoutGroup extends GroupBase {
  /** "HOG" / "COO", or the User id of a person row the founder added. */
  recipientId: string;
  recipientType: "EXECUTIVE" | "USER";
  /** The row's label in the structure ("Head of Growth", "Growth Associate"). */
  label: string;
  rate: number;
  userId: string | null;
}

export interface BonusRow {
  id: string;
  recipientId: string;
  recipientName: string;
  amount: number;
  reason: string;
  status: PayoutStatus;
  createdAt: string;
  paidAt: string | null;
}

export interface SectionTotals {
  owed: number;
  paid: number;
  unpaid: number;
  recipients: number;
  projects: number;
}

export interface BonusMetrics {
  activationRate: { rate: number | null; activated: number; active: number };
  qaFirstPassRate: { rate: number | null; firstPass: number; approved: number };
  onTimeRate: { rate: number | null; onTime: number; delivered: number };
  supervisorRejections: number;
}

export interface SubmissionInfo {
  submittedAt: string;
  submittedByName: string;
  workerTotal: number;
  workerCount: number;
  projectCount: number;
  note: string | null;
  revisions: number;
}

export interface PayoutMonth {
  month: string;
  monthLabel: string;
  workers: WorkerPayoutGroup[];
  ambassadors: AmbassadorPayoutGroup[];
  executives: ExecutivePayoutGroup[];
  bonuses: BonusRow[];
  totals: { workers: SectionTotals; ambassadors: SectionTotals; executives: SectionTotals; bonuses: { owed: number; paid: number; unpaid: number }; grand: { owed: number; paid: number; unpaid: number } };
  metrics: BonusMetrics;
  submission: SubmissionInfo | null;
}

const RECORD_INCLUDE = {
  project: { select: { id: true, projectId: true, finalCompletionDate: true, service: { select: { serviceName: true } }, client: { select: { fullName: true } } } },
} satisfies Prisma.PayoutRecordInclude;
type RecordRow = Prisma.PayoutRecordGetPayload<{ include: typeof RECORD_INCLUDE }>;

function toLine(r: RecordRow): PayoutLine {
  return {
    recordId: r.id,
    leg: r.leg as PayoutLeg,
    projectDbId: r.project?.id ?? null,
    projectCode: r.project?.projectId ?? null,
    serviceName: r.project?.service.serviceName ?? null,
    clientName: r.project?.client.fullName ?? null,
    amount: r.amount,
    basis: r.basis,
    completedAt: r.project?.finalCompletionDate?.toISOString() ?? null,
    status: r.status as PayoutStatus,
    paidAt: r.paidAt?.toISOString() ?? null,
  };
}

function groupBase(recipientId: string, name: string, lines: PayoutLine[]): GroupBase {
  const total = Math.round(lines.reduce((s, l) => s + l.amount, 0));
  const paid = Math.round(lines.filter((l) => isPaid(l.status)).reduce((s, l) => s + l.amount, 0));
  const unpaid = total - paid;
  const paidDates = lines.filter((l) => l.paidAt).map((l) => l.paidAt as string);
  return {
    recipientId,
    name,
    lines: lines.slice().sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? "")),
    total,
    paid,
    unpaid,
    projectCount: new Set(lines.map((l) => l.projectDbId).filter((x): x is string => x != null)).size,
    status: unpaid === 0 ? "PAID" : paid === 0 ? "UNPAID" : "PARTLY",
    paidAt: paidDates.length ? paidDates.sort().at(-1)! : null,
  };
}

function sectionTotals(groups: GroupBase[]): SectionTotals {
  return {
    owed: groups.reduce((s, g) => s + g.total, 0),
    paid: groups.reduce((s, g) => s + g.paid, 0),
    unpaid: groups.reduce((s, g) => s + g.unpaid, 0),
    recipients: groups.length,
    projects: new Set(groups.flatMap((g) => g.lines.map((l) => l.projectDbId)).filter((x): x is string => x != null)).size,
  };
}

export async function getBonusMetrics(month: string): Promise<BonusMetrics> {
  const { start, end } = monthBounds(month);
  const [activeAmbassadors, activated, approved, delivered, rejections] = await Promise.all([
    db.ambassador.count({ where: { status: "Active", createdAt: { lt: end } } }),
    db.project.findMany({
      where: { ambassadorId: { not: null }, downpaymentStatus: "Verified", downpaymentDate: { gte: start, lt: end }, isProBono: false },
      select: { ambassadorId: true },
      distinct: ["ambassadorId"],
    }),
    db.project.findMany({
      where: { statusLog: { some: { toStatus: "APPROVED", createdAt: { gte: start, lt: end } } } },
      select: { revisionCount: true },
    }),
    db.project.findMany({
      where: { statusLog: { some: { toStatus: "DELIVERED", createdAt: { gte: start, lt: end } } } },
      select: { deliveryDate: true, clientDeadline: true, expectedDeliveryAt: true },
    }),
    db.projectStatusLog.count({ where: { toStatus: "SUPERVISOR_CORRECTIONS", createdAt: { gte: start, lt: end } } }),
  ]);
  const withDeadline = delivered.filter((p) => p.deliveryDate && (p.clientDeadline ?? p.expectedDeliveryAt));
  const onTime = withDeadline.filter((p) => p.deliveryDate!.getTime() <= (p.clientDeadline ?? p.expectedDeliveryAt)!.getTime()).length;
  const firstPass = approved.filter((p) => p.revisionCount === 0).length;
  return {
    activationRate: { rate: activeAmbassadors > 0 ? Math.round((activated.length / activeAmbassadors) * 100) : null, activated: activated.length, active: activeAmbassadors },
    qaFirstPassRate: { rate: approved.length > 0 ? Math.round((firstPass / approved.length) * 100) : null, firstPass, approved: approved.length },
    onTimeRate: { rate: withDeadline.length > 0 ? Math.round((onTime / withDeadline.length) * 100) : null, onTime, delivered: withDeadline.length },
    supervisorRejections: rejections,
  };
}

async function submissionInfo(month: string): Promise<SubmissionInfo | null> {
  const s = await db.payoutSubmission.findUnique({ where: { month } });
  if (!s) return null;
  const by = await db.user.findUnique({ where: { id: s.submittedById }, select: { displayName: true, email: true, execProfile: { select: { fullName: true } } } });
  return {
    submittedAt: s.submittedAt.toISOString(),
    submittedByName: by?.execProfile?.fullName ?? by?.displayName ?? by?.email ?? "COO",
    workerTotal: s.workerTotal,
    workerCount: s.workerCount,
    projectCount: s.projectCount,
    note: s.note,
    revisions: Array.isArray(s.revisions) ? s.revisions.length : 0,
  };
}

/** Everything owed for a month, grouped by recipient, with bonuses, the COO's submission and the bonus metrics. */
export async function getPayoutMonth(month: string): Promise<PayoutMonth> {
  const active = await getActiveCashflow();
  const s = active.structure;
  const [records, metrics, submission, execs] = await Promise.all([
    db.payoutRecord.findMany({ where: { month, status: { notIn: [...NOT_OWED] } }, include: RECORD_INCLUDE }),
    getBonusMetrics(month),
    submissionInfo(month),
    execNames(db, s),
  ]);

  const byRecipient = new Map<string, RecordRow[]>();
  for (const r of records) {
    const key = `${r.recipientType}:${r.recipientId}`;
    byRecipient.set(key, [...(byRecipient.get(key) ?? []), r]);
  }
  const workerIds = [...new Set(records.filter((r) => r.recipientType === "WORKER").map((r) => r.recipientId))];
  const ambassadorIds = [...new Set(records.filter((r) => r.recipientType === "AMBASSADOR").map((r) => r.recipientId))];
  const [workerRows, ambassadorRows] = await Promise.all([
    workerIds.length ? db.worker.findMany({ where: { id: { in: workerIds } }, select: { id: true, workerId: true, fullName: true, bankName: true, accountNumber: true, accountName: true } }) : [],
    ambassadorIds.length ? db.ambassador.findMany({ where: { id: { in: ambassadorIds } }, select: { id: true, ambassadorId: true, fullName: true, tier: true, bankName: true, accountNumber: true, accountName: true } }) : [],
  ]);

  const workers: WorkerPayoutGroup[] = workerIds.map((id) => {
    const rows = byRecipient.get(`WORKER:${id}`) ?? [];
    const w = workerRows.find((x) => x.id === id);
    const base = groupBase(id, w?.fullName ?? rows[0]?.recipientName ?? "Worker", rows.map(toLine));
    return { ...base, code: w?.workerId ?? "—", bank: { bankName: w?.bankName ?? null, accountNumber: w?.accountNumber ?? null, accountName: w?.accountName ?? null } };
  });

  const ambassadors: AmbassadorPayoutGroup[] = ambassadorIds.map((id) => {
    const rows = byRecipient.get(`AMBASSADOR:${id}`) ?? [];
    const a = ambassadorRows.find((x) => x.id === id);
    const lines = rows.map(toLine);
    const base = groupBase(id, a?.fullName ?? rows[0]?.recipientName ?? "Ambassador", lines);
    const personal = lines.filter((l) => l.leg === "AMBASSADOR");
    const overrides = lines.filter((l) => l.leg === "PARENT");
    const rates = personal.map((l) => Number(/^([\d.]+)%/.exec(l.basis)?.[1])).filter((n) => Number.isFinite(n));
    return {
      ...base,
      code: a?.ambassadorId ?? "—",
      tier: a?.tier ?? "BRONZE",
      bank: { bankName: a?.bankName ?? null, accountNumber: a?.accountNumber ?? null, accountName: a?.accountName ?? null },
      personal: { count: personal.length, amount: Math.round(personal.reduce((s, l) => s + l.amount, 0)), rate: rates.length ? Math.round((rates.reduce((s, r) => s + r, 0) / rates.length) * 100) / 100 : null },
      overrides: { count: overrides.length, amount: Math.round(overrides.reduce((s, l) => s + l.amount, 0)) },
    };
  });

  // The single-recipient people rows of the structure in force (HOG, COO, anyone the founder added),
  // then any executive/user record in the month that no active row produces any more. Each group
  // shows the executive's COMMISSION lines; their performance bonuses (BONUS leg) sit in `bonuses`,
  // added to the grand total once, so the section reads as it did before bonuses were folded in.
  const commissionLines = (rows: RecordRow[]) => rows.filter((r) => r.leg !== "BONUS").map(toLine);
  const personRows = s.level1.filter((r) => r.kind === "person" && isActiveRow(r) && (r.recipients === "role" || r.recipients === "user"));
  const executives: ExecutivePayoutGroup[] = [];
  const covered = new Set<string>();
  for (const row of personRows) {
    const recipientType: "EXECUTIVE" | "USER" = row.recipients === "role" ? "EXECUTIVE" : "USER";
    const recipientId = row.recipients === "role" ? row.role : row.assignedUserId;
    if (!recipientId) continue;
    const key = `${recipientType}:${recipientId}`;
    covered.add(key);
    const rows = byRecipient.get(key) ?? [];
    const name = recipientType === "EXECUTIVE" ? execs[recipientId as ExecRecipient].name : (execs.users[recipientId]?.name ?? row.label);
    const userId = recipientType === "EXECUTIVE" ? execs[recipientId as ExecRecipient].userId : recipientId;
    executives.push({ ...groupBase(recipientId, name, commissionLines(rows)), recipientId, recipientType, label: row.label, rate: row.percentage, userId });
  }
  for (const [key, rows] of byRecipient) {
    const [recipientType, recipientId] = key.split(":") as [RecipientType, string];
    if ((recipientType !== "EXECUTIVE" && recipientType !== "USER") || covered.has(key)) continue;
    const comm = rows.filter((r) => r.leg !== "BONUS");
    if (comm.length === 0) continue; // an exec with only a bonus this month shows in `bonuses`, not as a commission group
    const rates = comm.map((r) => Number(/^([\d.]+)%/.exec(r.basis)?.[1])).filter((n) => Number.isFinite(n));
    executives.push({
      ...groupBase(recipientId, rows[0]?.recipientName ?? recipientId, commissionLines(rows)),
      recipientId,
      recipientType,
      label: rows[0]?.recipientName ?? recipientId,
      rate: rates.length ? rates[0] : 0,
      userId: recipientType === "USER" ? recipientId : (execs[recipientId as ExecRecipient]?.userId ?? null),
    });
  }

  // Performance bonuses are now BONUS-leg PayoutRecords with recipientType EXECUTIVE.
  const bonusRows: BonusRow[] = records
    .filter((r) => r.leg === "BONUS" && r.recipientType === "EXECUTIVE")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((r) => ({
      id: r.id,
      recipientId: r.recipientId,
      recipientName: r.recipientName,
      amount: r.amount,
      reason: r.basis,
      status: r.status as PayoutStatus,
      createdAt: r.createdAt.toISOString(),
      paidAt: r.paidAt?.toISOString() ?? null,
    }));
  const bonusTotals = {
    owed: bonusRows.reduce((s, b) => s + b.amount, 0),
    paid: bonusRows.filter((b) => isPaid(b.status)).reduce((s, b) => s + b.amount, 0),
    unpaid: bonusRows.filter((b) => !isPaid(b.status)).reduce((s, b) => s + b.amount, 0),
  };
  const tw = sectionTotals(workers);
  const ta = sectionTotals(ambassadors);
  const te = sectionTotals(executives);

  return {
    month,
    monthLabel: monthLabel(month),
    workers: workers.sort((a, b) => b.total - a.total),
    ambassadors: ambassadors.sort((a, b) => b.total - a.total),
    executives,
    bonuses: bonusRows,
    totals: {
      workers: tw,
      ambassadors: ta,
      executives: te,
      bonuses: bonusTotals,
      grand: { owed: tw.owed + ta.owed + te.owed + bonusTotals.owed, paid: tw.paid + ta.paid + te.paid + bonusTotals.paid, unpaid: tw.unpaid + ta.unpaid + te.unpaid + bonusTotals.unpaid },
    },
    metrics,
    submission,
  };
}

export interface CooPayoutView {
  month: string;
  monthLabel: string;
  projectCount: number;
  workerTotal: number;
  workerCount: number;
  workers: WorkerPayoutGroup[];
  submission: SubmissionInfo | null;
  /** Changed since the last submission: the COO should re-submit. */
  stale: boolean;
}

/** The COO's limited view: the worker section only, and their submission. */
export async function getCooPayoutView(month: string): Promise<CooPayoutView> {
  const full = await getPayoutMonth(month);
  const submission = full.submission;
  const stale = submission != null && (submission.workerTotal !== full.totals.workers.owed || submission.workerCount !== full.totals.workers.recipients);
  return {
    month,
    monthLabel: full.monthLabel,
    projectCount: full.totals.workers.projects,
    workerTotal: full.totals.workers.owed,
    workerCount: full.totals.workers.recipients,
    workers: full.workers,
    submission,
    stale,
  };
}

/** The COO submits the month's worker list to the CFO; re-submitting keeps the earlier version as a revision. */
export async function submitPayoutList(input: { month: string; submittedById: string; note?: string }): Promise<SubmissionInfo> {
  await calculateMonthlyPayouts(input.month);
  const view = await getCooPayoutView(input.month);
  const now = new Date();
  const existing = await db.payoutSubmission.findUnique({ where: { month: input.month } });
  const revision = existing
    ? {
        submittedAt: existing.submittedAt.toISOString(),
        submittedById: existing.submittedById,
        workerTotal: existing.workerTotal,
        workerCount: existing.workerCount,
        projectCount: existing.projectCount,
        note: existing.note,
      }
    : null;
  const revisions = existing && Array.isArray(existing.revisions) ? [...(existing.revisions as Prisma.JsonArray), revision as Prisma.JsonObject] : revision ? [revision as Prisma.JsonObject] : [];
  await db.payoutSubmission.upsert({
    where: { month: input.month },
    create: {
      month: input.month,
      submittedById: input.submittedById,
      submittedAt: now,
      workerTotal: view.workerTotal,
      workerCount: view.workerCount,
      projectCount: view.projectCount,
      note: input.note?.trim() || null,
      revisions: [],
    },
    update: {
      submittedById: input.submittedById,
      submittedAt: now,
      workerTotal: view.workerTotal,
      workerCount: view.workerCount,
      projectCount: view.projectCount,
      note: input.note?.trim() || null,
      revisions,
    },
  });
  await notifyFinance({
    title: `Payout list submitted for ${view.monthLabel}`,
    message: `The COO submitted worker payouts: ${formatNaira(view.workerTotal)} across ${view.workerCount} worker${view.workerCount === 1 ? "" : "s"} (${view.projectCount} project${view.projectCount === 1 ? "" : "s"}).${existing ? " This replaces an earlier submission." : ""}`,
    type: "info",
    link: `/admin/finance/payouts?month=${input.month}`,
  });
  return (await submissionInfo(input.month))!;
}

// ── Marking paid ─────────────────────────────────────────────────────────

export interface MarkPaidInput {
  paidById: string;
  reference?: string;
  /** YYYY-MM-DD; defaults to now. */
  date?: string;
}

export type MarkPaidTarget =
  | { kind: "record"; id: string }
  | { kind: "recipient"; month: string; recipientType: RecipientType; recipientId: string }
  | { kind: "all"; month: string; recipientType: RecipientType };

export interface MarkPaidResult {
  recipients: number;
  records: number;
  totalAmount: number;
}

const PAYMENT_TYPE: Record<RecipientType, "WORKER_PAYOUT" | "AMBASSADOR_COMMISSION" | "EXECUTIVE_COMMISSION"> = {
  WORKER: "WORKER_PAYOUT",
  AMBASSADOR: "AMBASSADOR_COMMISSION",
  EXECUTIVE: "EXECUTIVE_COMMISSION",
  USER: "EXECUTIVE_COMMISSION",
};
const PERSON_ROLE: Record<RecipientType, string> = { WORKER: "Worker", AMBASSADOR: "Ambassador", EXECUTIVE: "Executive", USER: "Staff" };

/**
 * Record a transfer: the PENDING records become PAID under a count check
 * (a double click pays nothing twice), one OUTFLOW Payment per recipient
 * carries the sum, and the project's legacy paid flags follow. Recipients
 * with a login are told.
 */
export async function markPayoutsPaid(target: MarkPaidTarget, input: MarkPaidInput): Promise<MarkPaidResult> {
  const payable = { in: [...UNPAID_STATUSES] };
  const where: Prisma.PayoutRecordWhereInput =
    target.kind === "record"
      ? { id: target.id, status: payable }
      : target.kind === "recipient"
        ? { month: target.month, recipientType: target.recipientType, recipientId: target.recipientId, status: payable }
        : { month: target.month, recipientType: target.recipientType, status: payable };
  const paidOn = input.date ? new Date(input.date) : new Date();
  const execs = await execNames(db, (await getActiveCashflow()).structure);
  // Several payments are minted in one transaction: number them from one read so they never collide.
  const firstPaymentId = await nextId("PAYMENT");
  const firstNumber = Number(/(\d+)$/.exec(firstPaymentId)?.[1] ?? 0);
  let minted = 0;

  const outcome = await db.$transaction(
    async (tx) => {
      const pending = await tx.payoutRecord.findMany({ where, orderBy: { createdAt: "asc" } });
      if (pending.length === 0) throw new PayoutError("Nothing pending to pay");
      const groups = new Map<string, typeof pending>();
      for (const r of pending) {
        const key = `${r.recipientType}:${r.recipientId}`;
        groups.set(key, [...(groups.get(key) ?? []), r]);
      }
      const paidTo: { recipientType: RecipientType; recipientId: string; userId: string | null; amount: number }[] = [];
      let records = 0;
      let totalAmount = 0;
      for (const rows of groups.values()) {
        const recipientType = rows[0].recipientType as RecipientType;
        const recipientId = rows[0].recipientId;
        const ids = rows.map((r) => r.id);
        const amount = Math.round(rows.reduce((s, r) => s + r.amount, 0));
        const userId =
          recipientType === "WORKER"
            ? ((await tx.worker.findUnique({ where: { id: recipientId }, select: { userId: true } }))?.userId ?? null)
            : recipientType === "AMBASSADOR"
              ? ((await tx.ambassador.findUnique({ where: { id: recipientId }, select: { userId: true } }))?.userId ?? null)
              : recipientType === "USER"
                ? recipientId
                : (execs[recipientId as ExecRecipient]?.userId ?? null);

        const claimed = await tx.payoutRecord.updateMany({ where: { id: { in: ids }, status: payable }, data: { status: "PAID" } });
        if (claimed.count !== ids.length) throw new PayoutError("Someone else just recorded part of this payout. Refresh the page.");

        const projectCount = new Set(rows.map((r) => r.projectId).filter((x): x is string => x != null)).size;
        const payment = await tx.payment.create({
          data: {
            paymentId: firstNumber > 0 ? formatId("PAYMENT", firstNumber + minted++) : await nextId("PAYMENT"),
            type: PAYMENT_TYPE[recipientType],
            direction: "OUTFLOW",
            personName: rows[0].recipientName,
            personRole: PERSON_ROLE[recipientType],
            amount,
            reference: input.reference || null,
            confirmedById: input.paidById,
            status: "Confirmed",
            source: "SYSTEM",
            date: paidOn,
            notes: `${rows[0].month} payout for ${projectCount} project${projectCount === 1 ? "" : "s"}`,
          },
          select: { id: true },
        });
        await tx.payoutRecord.updateMany({
          where: { id: { in: ids } },
          data: { paidAt: paidOn, paidById: input.paidById, paidToUserId: userId, paymentId: payment.id },
        });
        // The project flags the portals and the old queue read.
        const byLeg = (leg: PayoutLeg) => rows.filter((r) => r.leg === leg).map((r) => r.projectId).filter((x): x is string => x != null);
        const workerProjects = byLeg("WORKER");
        const ambProjects = byLeg("AMBASSADOR");
        const parentProjects = byLeg("PARENT");
        if (workerProjects.length) await tx.project.updateMany({ where: { id: { in: workerProjects } }, data: { workerPayoutPaid: true } });
        if (ambProjects.length) await tx.project.updateMany({ where: { id: { in: ambProjects } }, data: { ambassadorCommPaid: true } });
        if (parentProjects.length) await tx.project.updateMany({ where: { id: { in: parentProjects } }, data: { parentCommPaid: true } });

        paidTo.push({ recipientType, recipientId, userId, amount });
        records += ids.length;
        totalAmount += amount;
      }
      return { paidTo, records, totalAmount };
    },
    { timeout: 25_000, maxWait: 10_000 }
  );

  await Promise.all(
    outcome.paidTo
      .filter((t) => t.userId)
      .map((t) =>
        notifyUsers([t.userId as string], {
          title: t.recipientType === "WORKER" ? "Payout sent" : "Commission paid",
          message: `${formatNaira(t.amount)} was recorded as paid to you.`,
          type: "success",
          link: t.recipientType === "WORKER" ? "/worker/earnings" : t.recipientType === "AMBASSADOR" ? "/ambassador/commissions" : "/admin/earnings",
        })
      )
  );
  return { recipients: outcome.paidTo.length, records: outcome.records, totalAmount: outcome.totalAmount };
}

// ── Performance bonuses ─────────────────────────────────────────────────

/**
 * Enter an executive performance bonus. Since Phase 3 a bonus is a BONUS-leg
 * PayoutRecord (recipientType EXECUTIVE) so it rides the same ledger, queue and
 * batch as commissions; its `bonusKey` (perf:…) keeps it unique and lets the
 * cleanup tell it apart. It is paid through `markPayoutsPaid`, not a separate path.
 */
export async function addPerformanceBonus(input: { month: string; recipientId: ExecRecipient; amount: number; reason: string; createdById: string }): Promise<BonusRow> {
  const execs = await execNames();
  const now = new Date();
  const row = await db.payoutRecord.create({
    data: {
      month: input.month,
      leg: "BONUS",
      recipientType: "EXECUTIVE",
      recipientId: input.recipientId,
      recipientName: execs[input.recipientId].name,
      bonusKey: `perf:${randomUUID()}`,
      amount: Math.round(input.amount),
      basis: input.reason.trim(),
      status: CREATE_STATUS,
      accruedAt: now,
      notes: `Performance bonus entered by ${input.createdById}`,
    },
  });
  await notifyRole(input.recipientId, {
    title: "Performance bonus added",
    message: `A ${formatNaira(row.amount)} bonus for ${monthLabel(input.month)} has been entered: ${row.basis}. It is paid with your commission.`,
    type: "success",
    link: "/admin/earnings",
  });
  return { id: row.id, recipientId: row.recipientId, recipientName: row.recipientName, amount: row.amount, reason: row.basis, status: CREATE_STATUS, createdAt: row.createdAt.toISOString(), paidAt: null };
}

/** Owed and paid by leg for a month — the finance figures other pages read (never Payment OUTFLOW sums). */
export async function payoutTotalsForMonth(month: string): Promise<{ owed: number; paid: number; unpaid: number; byLeg: Record<string, number> }> {
  const rows = await db.payoutRecord.groupBy({ by: ["leg", "status"], where: { month, status: { notIn: [...NOT_OWED] } }, _sum: { amount: true } });
  const byLeg: Record<string, number> = { WORKER: 0, AMBASSADOR: 0, PARENT: 0, HOG: 0, COO: 0, BONUS: 0 };
  let owed = 0;
  let paid = 0;
  for (const r of rows) {
    const amt = Math.round(r._sum.amount ?? 0);
    byLeg[r.leg] = (byLeg[r.leg] ?? 0) + amt;
    owed += amt;
    if (isPaid(r.status)) paid += amt;
  }
  return { owed, paid, unpaid: owed - paid, byLeg };
}

/** Months with any payout activity, newest first, for the month picker. */
export async function payoutMonths(limit = 12): Promise<string[]> {
  const rows = await db.payoutRecord.findMany({ select: { month: true }, distinct: ["month"], orderBy: { month: "desc" }, take: limit });
  const now = monthKeyOf(new Date());
  const set = new Set([now, ...rows.map((r) => r.month)]);
  return [...set].sort().reverse();
}

export { monthRange };
