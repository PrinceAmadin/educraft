import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { COMMISSION_RATES, executiveLegs, workerLeg, type ProjectLegs } from "@/lib/finance/commission-config";
import { monthKeyOf } from "@/lib/services/finance/buckets";
import { monthLabel, monthRange } from "@/lib/services/finance/surplus";
import { nextId } from "@/lib/services/projects";
import { formatId } from "@/lib/id-format";
import { notifyFinance, notifyRole, notifyUsers } from "@/lib/services/notifications";
import { formatNaira } from "@/lib/utils";

/**
 * The payout engine. Every naira owed out on a completed project is one
 * PayoutRecord per leg and recipient — WORKER (40%), AMBASSADOR (the
 * referrer's rate), PARENT (the Core's override), HOG (2.5% on
 * ambassador-driven jobs), COO (2.5% on every job). Records are produced
 * when a project reaches COMPLETED and reconciled whenever its legs change;
 * `calculateMonthlyPayouts` re-reconciles a whole month. Marking paid is a
 * claim (PENDING -> PAID under a count check) that writes one OUTFLOW
 * Payment per recipient and flips the project's legacy paid flags, so the
 * worker and ambassador portals keep reading the same truth.
 */

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof db;

export class PayoutError extends Error {}

export type PayoutLeg = "WORKER" | "AMBASSADOR" | "PARENT" | "HOG" | "COO";
export type RecipientType = "WORKER" | "AMBASSADOR" | "EXECUTIVE";
export type ExecRecipient = "HOG" | "COO";

const PROJECT_SELECT = {
  id: true,
  projectId: true,
  status: true,
  isProBono: true,
  price: true,
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
}

export interface ExecNames {
  HOG: { name: string; userId: string | null };
  COO: { name: string; userId: string | null };
}

/** The HOG and COO by role: the exec profile's name, else the login's, else the title. */
export async function execNames(client: Db = db): Promise<ExecNames> {
  const users = await client.user.findMany({
    where: { role: { in: ["HOG", "COO"] }, isActive: true },
    select: { id: true, role: true, displayName: true, email: true, execProfile: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
  const pick = (role: ExecRecipient, fallback: string) => {
    const u = users.find((x) => x.role === role);
    return { name: u?.execProfile?.fullName ?? u?.displayName ?? fallback, userId: u?.id ?? null };
  };
  return { HOG: pick("HOG", "Head of Growth"), COO: pick("COO", "Chief Operating Officer") };
}

function pct(rate: number | null | undefined, fallback: number): string {
  const r = rate ?? fallback;
  return `${Math.round(r * 100) / 100}%`;
}

function tierLabel(tier: string): string {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

/** The legs a completed project owes, whole naira, zero amounts left out. Pure given the names. */
export function legsFor(p: ProjectForLegs, execs: ExecNames): LegRow[] {
  if (p.isProBono || p.price <= 0) return [];
  const legs: ProjectLegs = p;
  const out: LegRow[] = [];

  if (p.workerId && p.worker) {
    const amount = workerLeg(legs);
    if (amount > 0) {
      out.push({
        leg: "WORKER",
        recipientType: "WORKER",
        recipientId: p.worker.id,
        recipientName: p.worker.fullName,
        amount,
        basis: `${pct(p.workerPayoutRate, COMMISSION_RATES.workers * 100)} worker rate`,
      });
    }
  }
  if (p.ambassadorId && p.ambassador && (p.ambassadorCommission ?? 0) > 0) {
    const sub = p.parentAmbassadorId != null;
    out.push({
      leg: "AMBASSADOR",
      recipientType: "AMBASSADOR",
      recipientId: p.ambassador.id,
      recipientName: p.ambassador.fullName,
      amount: Math.round(p.ambassadorCommission ?? 0),
      basis: `${pct(p.ambassadorCommRate, 10)} ${sub ? "Sub-Ambassador" : "ambassador"} rate (${tierLabel(p.ambassador.tier)} tier)`,
    });
  }
  if (p.parentAmbassadorId && p.parentAmbassador && (p.parentCommission ?? 0) > 0) {
    out.push({
      leg: "PARENT",
      recipientType: "AMBASSADOR",
      recipientId: p.parentAmbassador.id,
      recipientName: p.parentAmbassador.fullName,
      amount: Math.round(p.parentCommission ?? 0),
      basis: `${pct(p.parentCommRate, 5)} Core override`,
    });
  }
  const exec = executiveLegs(legs);
  if (exec.hog > 0) {
    out.push({
      leg: "HOG",
      recipientType: "EXECUTIVE",
      recipientId: "HOG",
      recipientName: execs.HOG.name,
      amount: exec.hog,
      basis: `${COMMISSION_RATES.hog * 100}% HOG commission on ambassador-driven project`,
    });
  }
  if (exec.coo > 0) {
    out.push({
      leg: "COO",
      recipientType: "EXECUTIVE",
      recipientId: "COO",
      recipientName: execs.COO.name,
      amount: exec.coo,
      basis: `${COMMISSION_RATES.coo * 100}% COO commission on delivered project`,
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

/**
 * Bring a project's PayoutRecords in line with what it owes now. Only a
 * COMPLETED project produces legs; anything else cancels its PENDING
 * records. A PAID record is never touched. A leg already marked paid on
 * the project before the engine existed is recorded as PAID.
 */
export async function reconcileProjectPayouts(tx: Tx, projectDbId: string, opts: { month?: string } = {}): Promise<ReconcileResult> {
  const project = await tx.project.findUnique({ where: { id: projectDbId }, select: PROJECT_SELECT });
  if (!project) return { created: 0, updated: 0, cancelled: 0 };
  const execs = await execNames(tx);
  const produced = project.status === "COMPLETED" ? legsFor(project, execs) : [];
  const month = opts.month ?? monthKeyOf(project.finalCompletionDate ?? new Date());
  const existing = await tx.payoutRecord.findMany({ where: { projectId: projectDbId } });
  const result: ReconcileResult = { created: 0, updated: 0, cancelled: 0 };
  const keep = new Set<string>();

  for (const leg of produced) {
    const key = `${leg.leg}:${leg.recipientId}`;
    keep.add(key);
    const row = existing.find((r) => r.leg === leg.leg && r.recipientId === leg.recipientId);
    if (!row) {
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
          status: paidBefore ? "PAID" : "PENDING",
          paidAt: paidBefore ? (project.finalCompletionDate ?? new Date()) : null,
          notes: paidBefore ? "Paid before the payout engine (project flag)" : null,
        },
      });
      result.created += 1;
      continue;
    }
    if (row.status === "PAID") continue;
    const changed =
      row.amount !== leg.amount || row.basis !== leg.basis || row.recipientName !== leg.recipientName || row.month !== month || row.status === "CANCELLED";
    if (changed) {
      await tx.payoutRecord.update({
        where: { id: row.id },
        data: { amount: leg.amount, basis: leg.basis, recipientName: leg.recipientName, recipientType: leg.recipientType, month, status: "PENDING" },
      });
      result.updated += 1;
    }
  }
  for (const row of existing) {
    if (row.status !== "PENDING") continue;
    if (keep.has(`${row.leg}:${row.recipientId}`)) continue;
    await tx.payoutRecord.update({ where: { id: row.id }, data: { status: "CANCELLED", notes: "No longer owed: the project's legs changed" } });
    result.cancelled += 1;
  }
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

/** Re-reconcile every project completed in the month. Idempotent. */
export async function calculateMonthlyPayouts(month: string): Promise<CalculateResult> {
  const ids = await completedProjectIds(month);
  const totals: CalculateResult = { month, projects: ids.length, created: 0, updated: 0, cancelled: 0 };
  for (const id of ids) {
    const r = await db.$transaction((tx) => reconcileProjectPayouts(tx, id, { month }), { timeout: 20_000, maxWait: 10_000 });
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
  status: "PENDING" | "PAID";
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
  recipientId: ExecRecipient;
  rate: number;
  userId: string | null;
}

export interface BonusRow {
  id: string;
  recipientId: string;
  recipientName: string;
  amount: number;
  reason: string;
  status: "PENDING" | "PAID" | "CANCELLED";
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
    status: r.status as "PENDING" | "PAID",
    paidAt: r.paidAt?.toISOString() ?? null,
  };
}

function groupBase(recipientId: string, name: string, lines: PayoutLine[]): GroupBase {
  const total = Math.round(lines.reduce((s, l) => s + l.amount, 0));
  const paid = Math.round(lines.filter((l) => l.status === "PAID").reduce((s, l) => s + l.amount, 0));
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
  const [records, bonuses, metrics, submission, execs] = await Promise.all([
    db.payoutRecord.findMany({ where: { month, status: { not: "CANCELLED" } }, include: RECORD_INCLUDE }),
    db.performanceBonus.findMany({ where: { month, status: { not: "CANCELLED" } }, orderBy: { createdAt: "asc" } }),
    getBonusMetrics(month),
    submissionInfo(month),
    execNames(),
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

  const executives: ExecutivePayoutGroup[] = (["HOG", "COO"] as const).map((role) => {
    const rows = byRecipient.get(`EXECUTIVE:${role}`) ?? [];
    const base = groupBase(role, execs[role].name, rows.map(toLine));
    return { ...base, recipientId: role, rate: role === "HOG" ? COMMISSION_RATES.hog * 100 : COMMISSION_RATES.coo * 100, userId: execs[role].userId };
  });

  const bonusRows: BonusRow[] = bonuses.map((b) => ({
    id: b.id,
    recipientId: b.recipientId,
    recipientName: b.recipientName,
    amount: b.amount,
    reason: b.reason,
    status: b.status as BonusRow["status"],
    createdAt: b.createdAt.toISOString(),
    paidAt: b.paidAt?.toISOString() ?? null,
  }));
  const bonusTotals = {
    owed: bonusRows.reduce((s, b) => s + b.amount, 0),
    paid: bonusRows.filter((b) => b.status === "PAID").reduce((s, b) => s + b.amount, 0),
    unpaid: bonusRows.filter((b) => b.status === "PENDING").reduce((s, b) => s + b.amount, 0),
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
};
const PERSON_ROLE: Record<RecipientType, string> = { WORKER: "Worker", AMBASSADOR: "Ambassador", EXECUTIVE: "Executive" };

/**
 * Record a transfer: the PENDING records become PAID under a count check
 * (a double click pays nothing twice), one OUTFLOW Payment per recipient
 * carries the sum, and the project's legacy paid flags follow. Recipients
 * with a login are told.
 */
export async function markPayoutsPaid(target: MarkPaidTarget, input: MarkPaidInput): Promise<MarkPaidResult> {
  const where: Prisma.PayoutRecordWhereInput =
    target.kind === "record"
      ? { id: target.id, status: "PENDING" }
      : target.kind === "recipient"
        ? { month: target.month, recipientType: target.recipientType, recipientId: target.recipientId, status: "PENDING" }
        : { month: target.month, recipientType: target.recipientType, status: "PENDING" };
  const paidOn = input.date ? new Date(input.date) : new Date();
  const execs = await execNames();
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
              : (execs[recipientId as ExecRecipient]?.userId ?? null);

        const claimed = await tx.payoutRecord.updateMany({ where: { id: { in: ids }, status: "PENDING" }, data: { status: "PAID" } });
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
          link: t.recipientType === "WORKER" ? "/worker/earnings" : t.recipientType === "AMBASSADOR" ? "/ambassador/commissions" : "/admin/settings/bank",
        })
      )
  );
  return { recipients: outcome.paidTo.length, records: outcome.records, totalAmount: outcome.totalAmount };
}

// ── Performance bonuses ─────────────────────────────────────────────────

export async function addPerformanceBonus(input: { month: string; recipientId: ExecRecipient; amount: number; reason: string; createdById: string }): Promise<BonusRow> {
  const execs = await execNames();
  const row = await db.performanceBonus.create({
    data: {
      month: input.month,
      recipientType: "EXECUTIVE",
      recipientId: input.recipientId,
      recipientName: execs[input.recipientId].name,
      amount: Math.round(input.amount),
      reason: input.reason.trim(),
      createdById: input.createdById,
    },
  });
  await notifyRole(input.recipientId, {
    title: "Performance bonus added",
    message: `A ${formatNaira(row.amount)} bonus for ${monthLabel(input.month)} has been entered: ${row.reason}. It is paid with your commission.`,
    type: "success",
  });
  return { id: row.id, recipientId: row.recipientId, recipientName: row.recipientName, amount: row.amount, reason: row.reason, status: "PENDING", createdAt: row.createdAt.toISOString(), paidAt: null };
}

/** Pay a bonus on its own: PENDING -> PAID under a claim, one OUTFLOW Payment. */
export async function markBonusPaid(id: string, input: MarkPaidInput): Promise<MarkPaidResult> {
  const paidOn = input.date ? new Date(input.date) : new Date();
  const execs = await execNames();
  const bonus = await db.$transaction(async (tx) => {
    const b = await tx.performanceBonus.findUnique({ where: { id } });
    if (!b) throw new PayoutError("That bonus was not found");
    const claimed = await tx.performanceBonus.updateMany({ where: { id, status: "PENDING" }, data: { status: "PAID" } });
    if (claimed.count !== 1) throw new PayoutError("That bonus is already paid");
    const payment = await tx.payment.create({
      data: {
        paymentId: await nextId("PAYMENT"),
        type: "EXECUTIVE_COMMISSION",
        direction: "OUTFLOW",
        personName: b.recipientName,
        personRole: "Executive",
        amount: b.amount,
        reference: input.reference || null,
        confirmedById: input.paidById,
        status: "Confirmed",
        source: "SYSTEM",
        date: paidOn,
        notes: `${b.month} performance bonus: ${b.reason}`,
      },
      select: { id: true },
    });
    await tx.performanceBonus.update({ where: { id }, data: { paidAt: paidOn, paidById: input.paidById, paymentId: payment.id } });
    return b;
  });
  const userId = execs[bonus.recipientId as ExecRecipient]?.userId;
  if (userId) {
    await notifyUsers([userId], { title: "Bonus paid", message: `${formatNaira(bonus.amount)} bonus (${bonus.reason}) was recorded as paid to you.`, type: "success" });
  }
  return { recipients: 1, records: 1, totalAmount: bonus.amount };
}

/** Owed and paid by leg for a month — the finance figures other pages read (never Payment OUTFLOW sums). */
export async function payoutTotalsForMonth(month: string): Promise<{ owed: number; paid: number; unpaid: number; byLeg: Record<PayoutLeg, number> }> {
  const rows = await db.payoutRecord.groupBy({ by: ["leg", "status"], where: { month, status: { not: "CANCELLED" } }, _sum: { amount: true } });
  const byLeg: Record<PayoutLeg, number> = { WORKER: 0, AMBASSADOR: 0, PARENT: 0, HOG: 0, COO: 0 };
  let owed = 0;
  let paid = 0;
  for (const r of rows) {
    const amt = Math.round(r._sum.amount ?? 0);
    byLeg[r.leg as PayoutLeg] += amt;
    owed += amt;
    if (r.status === "PAID") paid += amt;
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
