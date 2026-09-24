import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { agingBand } from "@/lib/finance/commission-config";
import {
  REVENUE_PAGE_SIZE,
  type AgingBand,
  type RevenueSort,
  type RevenueType,
} from "@/lib/finance/revenue-constants";
import type { RevenueQuery } from "@/lib/validations/finance";
import { markPaymentPaid, rejectPayment, verifyPayment, TransitionError } from "@/lib/services/projects";
import { siteUrl } from "@/lib/site-url";
import { formatNaira } from "@/lib/utils";
import { greetingName, toWaNumber, waLink } from "@/lib/whatsapp";

/**
 * The Revenue Tracker: every naira that comes in from a client, and the two
 * finance acts on it — confirming a payment the team marked as paid (which
 * verifies the leg and allocates the buckets, through `verifyPayment`) and
 * refusing one. It reads Payment rows; it never writes money on its own.
 */

export class RevenueError extends Error {}

const CLIENT_INFLOW_TYPES = ["CLIENT_DOWNPAYMENT", "CLIENT_BALANCE"] as const;

export interface RevenueRow {
  id: string;
  paymentId: string;
  date: string;
  projectDbId: string | null;
  projectCode: string | null;
  clientName: string | null;
  serviceName: string | null;
  amount: number;
  direction: "INFLOW" | "OUTFLOW";
  type: RevenueType;
  method: string | null;
  reference: string | null;
  status: string;
  source: string;
  /** Who confirmed it: a person, "Paystack" for a checkout, null while pending. */
  verifiedBy: string | null;
  ambassadorName: string | null;
  notes: string | null;
  /** The project leg's own status — a Pending row can only be confirmed while the leg is still "Paid". */
  legStatus: string | null;
  /** Whether EduCraft's retained share of this row is in the buckets. */
  allocated: boolean;
}

export interface RevenueList {
  rows: RevenueRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  /** Totals of the filtered set, not just the page. */
  filtered: { confirmedIn: number; refundsOut: number; pendingCount: number; pendingAmount: number };
}

function dayStart(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
function nextDay(iso: string): Date {
  const d = dayStart(iso);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function rowType(type: string): RevenueType {
  if (type === "CLIENT_BALANCE") return "balance";
  if (type === "REFUND") return "refund";
  return "downpayment";
}

function whereFor(q: RevenueQuery): Prisma.PaymentWhereInput {
  const kinds: Prisma.PaymentWhereInput[] = [];
  const wantType = q.type || undefined;
  if (!wantType || wantType === "downpayment") kinds.push({ direction: "INFLOW", type: "CLIENT_DOWNPAYMENT" });
  if (!wantType || wantType === "balance") kinds.push({ direction: "INFLOW", type: "CLIENT_BALANCE" });
  if (!wantType || wantType === "refund") kinds.push({ direction: "OUTFLOW", type: "REFUND" });

  const and: Prisma.PaymentWhereInput[] = [{ OR: kinds }];
  if (q.status && q.status !== "All") and.push({ status: q.status });
  if (q.source) and.push({ source: q.source });
  if (q.serviceId) and.push({ project: { serviceId: q.serviceId } });
  if (q.ambassadorId) and.push({ ambassadorId: q.ambassadorId });
  if (q.from) and.push({ date: { gte: dayStart(q.from) } });
  if (q.to) and.push({ date: { lt: nextDay(q.to) } });
  if (q.q) {
    const term = q.q.trim();
    and.push({
      OR: [
        { paymentId: { contains: term, mode: "insensitive" } },
        { reference: { contains: term, mode: "insensitive" } },
        { personName: { contains: term, mode: "insensitive" } },
        { project: { projectId: { contains: term, mode: "insensitive" } } },
        { project: { client: { fullName: { contains: term, mode: "insensitive" } } } },
      ],
    });
  }
  return { AND: and };
}

const ROW_INCLUDE = {
  project: {
    select: {
      id: true,
      projectId: true,
      downpaymentStatus: true,
      balanceStatus: true,
      client: { select: { fullName: true } },
      service: { select: { serviceName: true } },
    },
  },
  confirmedBy: { select: { displayName: true, email: true } },
  ambassador: { select: { fullName: true } },
  bucketAllocation: { select: { id: true } },
} satisfies Prisma.PaymentInclude;

type RowSource = Prisma.PaymentGetPayload<{ include: typeof ROW_INCLUDE }>;

function toRow(p: RowSource): RevenueRow {
  const type = rowType(p.type);
  const person = p.confirmedBy ? (p.confirmedBy.displayName ?? p.confirmedBy.email.split("@")[0]) : null;
  const verifiedBy =
    p.status === "Confirmed" || p.status === "Duplicate" || p.status === "Rejected"
      ? (person ?? (p.source === "PAYSTACK" ? "Paystack" : "System"))
      : null;
  return {
    id: p.id,
    paymentId: p.paymentId,
    date: p.date.toISOString(),
    projectDbId: p.project?.id ?? null,
    projectCode: p.project?.projectId ?? null,
    clientName: p.project?.client.fullName ?? p.personName,
    serviceName: p.project?.service.serviceName ?? null,
    amount: p.amount,
    direction: p.direction,
    type,
    method: p.paymentMethod,
    reference: p.reference,
    status: p.status,
    source: p.source,
    verifiedBy,
    ambassadorName: p.ambassador?.fullName ?? null,
    notes: p.notes,
    legStatus: type === "refund" ? null : type === "balance" ? (p.project?.balanceStatus ?? null) : (p.project?.downpaymentStatus ?? null),
    allocated: p.bucketAllocation != null,
  };
}

export async function listRevenue(q: RevenueQuery): Promise<RevenueList> {
  const where = whereFor(q);
  const page = Math.max(1, q.page ?? 1);
  const sort: RevenueSort = q.sort || "date";
  const dir = q.dir || "desc";
  const orderBy: Prisma.PaymentOrderByWithRelationInput[] =
    sort === "amount" ? [{ amount: dir }, { date: "desc" }] : [{ date: dir }, { createdAt: dir }];

  const [rows, total, confirmedIn, refundsOut, pending] = await Promise.all([
    db.payment.findMany({ where, include: ROW_INCLUDE, orderBy, skip: (page - 1) * REVENUE_PAGE_SIZE, take: REVENUE_PAGE_SIZE }),
    db.payment.count({ where }),
    db.payment.aggregate({ where: { AND: [where, { status: "Confirmed", direction: "INFLOW" }] }, _sum: { amount: true } }),
    db.payment.aggregate({ where: { AND: [where, { status: "Confirmed", direction: "OUTFLOW" }] }, _sum: { amount: true } }),
    db.payment.aggregate({ where: { AND: [where, { status: "Pending", source: "MANUAL" }] }, _sum: { amount: true }, _count: true }),
  ]);

  return {
    rows: rows.map(toRow),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / REVENUE_PAGE_SIZE)),
    pageSize: REVENUE_PAGE_SIZE,
    filtered: {
      confirmedIn: Math.round(confirmedIn._sum.amount ?? 0),
      refundsOut: Math.round(refundsOut._sum.amount ?? 0),
      pendingCount: pending._count,
      pendingAmount: Math.round(pending._sum.amount ?? 0),
    },
  };
}

export interface RevenueSummary {
  month: string;
  /** Confirmed client money this month, less refunds this month. */
  netThisMonth: number;
  confirmedThisMonth: number;
  refundsThisMonth: number;
  /** Bank transfers marked paid that finance has not confirmed or refused yet. */
  awaiting: { count: number; amount: number };
  /** Second charges held for a refund. */
  duplicates: { count: number; amount: number };
}

function monthRange(now: Date): { start: Date; end: Date; key: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end, key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}` };
}

export async function getRevenueSummary(now: Date = new Date()): Promise<RevenueSummary> {
  const { start, end, key } = monthRange(now);
  const [confirmed, refunds, awaiting, duplicates] = await Promise.all([
    db.payment.aggregate({
      where: { status: "Confirmed", direction: "INFLOW", type: { in: [...CLIENT_INFLOW_TYPES] }, date: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    db.payment.aggregate({
      where: { status: "Confirmed", direction: "OUTFLOW", type: "REFUND", date: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    db.payment.aggregate({
      where: { status: "Pending", source: "MANUAL", direction: "INFLOW", type: { in: [...CLIENT_INFLOW_TYPES] } },
      _sum: { amount: true },
      _count: true,
    }),
    db.payment.aggregate({
      where: { status: "Duplicate", direction: "INFLOW" },
      _sum: { amount: true },
      _count: true,
    }),
  ]);
  const confirmedThisMonth = Math.round(confirmed._sum.amount ?? 0);
  const refundsThisMonth = Math.round(refunds._sum.amount ?? 0);
  return {
    month: key,
    netThisMonth: confirmedThisMonth - refundsThisMonth,
    confirmedThisMonth,
    refundsThisMonth,
    awaiting: { count: awaiting._count, amount: Math.round(awaiting._sum.amount ?? 0) },
    duplicates: { count: duplicates._count, amount: Math.round(duplicates._sum.amount ?? 0) },
  };
}

export interface RevenueFilterOptions {
  services: { id: string; name: string }[];
  ambassadors: { id: string; name: string }[];
}

/** Services and ambassadors that actually appear on payment rows, for the filter bar. */
export async function getRevenueFilterOptions(): Promise<RevenueFilterOptions> {
  const [serviceIds, ambassadorIds] = await Promise.all([
    db.project.findMany({ where: { payments: { some: {} } }, select: { serviceId: true }, distinct: ["serviceId"] }),
    db.payment.findMany({ where: { ambassadorId: { not: null } }, select: { ambassadorId: true }, distinct: ["ambassadorId"] }),
  ]);
  const [services, ambassadors] = await Promise.all([
    db.service.findMany({
      where: { id: { in: serviceIds.map((s) => s.serviceId) } },
      select: { id: true, serviceName: true },
      orderBy: { serviceName: "asc" },
    }),
    db.ambassador.findMany({
      where: { id: { in: ambassadorIds.map((a) => a.ambassadorId).filter((x): x is string => x != null) } },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  return {
    services: services.map((s) => ({ id: s.id, name: s.serviceName })),
    ambassadors: ambassadors.map((a) => ({ id: a.id, name: a.fullName })),
  };
}

// ── Outstanding balances ────────────────────────────────────────────────

export interface OutstandingRow {
  projectDbId: string;
  projectCode: string;
  clientName: string;
  clientId: string;
  clientPhone: string;
  serviceName: string;
  status: string;
  balanceAmount: number;
  /** "Unpaid", or "Paid" when marked and waiting on finance. */
  balanceStatus: string;
  since: string;
  daysSince: number;
  band: AgingBand;
  /** A WhatsApp chat with the reminder typed in; null when the phone number can't be read. */
  reminderHref: string | null;
  reminderText: string;
}

export interface OutstandingBalances {
  rows: OutstandingRow[];
  bands: Record<AgingBand, { count: number; amount: number }>;
  total: { count: number; amount: number };
}

/** The message the CFO sends: plain, names the amount, points at the dashboard. */
export function balanceReminderMessage(input: {
  fullName: string;
  clientId: string;
  projectCode: string;
  serviceName: string;
  balanceAmount: number;
}): string {
  const url = `${siteUrl()}/client/projects/${input.projectCode}?tab=payments`;
  return (
    `Hi ${greetingName(input.fullName)}, this is EduCraft. The balance of ${formatNaira(input.balanceAmount)} on your project ${input.projectCode} (${input.serviceName}) is still outstanding. ` +
    `You can pay it from your dashboard: ${url} (sign in with your Client ID ${input.clientId}), or by bank transfer — reply here and we will send the account details. Thank you.`
  );
}

/**
 * Projects with the downpayment in and the balance not yet verified, aged from
 * the day the downpayment was confirmed. Closed jobs are left out.
 */
export async function listOutstandingBalances(now: Date = new Date()): Promise<OutstandingBalances> {
  const projects = await db.project.findMany({
    where: {
      isProBono: false,
      downpaymentStatus: "Verified",
      balanceStatus: { not: "Verified" },
      balanceAmount: { gt: 0 },
      status: { notIn: ["CANCELLED", "REFUNDED"] },
    },
    select: {
      id: true,
      projectId: true,
      status: true,
      balanceAmount: true,
      balanceStatus: true,
      downpaymentDate: true,
      createdAt: true,
      client: { select: { fullName: true, clientId: true, phone: true } },
      service: { select: { serviceName: true } },
    },
    orderBy: { downpaymentDate: "asc" },
  });

  const rows: OutstandingRow[] = projects.map((p) => {
    const since = p.downpaymentDate ?? p.createdAt;
    const daysSince = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000));
    const reminderText = balanceReminderMessage({
      fullName: p.client.fullName,
      clientId: p.client.clientId,
      projectCode: p.projectId,
      serviceName: p.service.serviceName,
      balanceAmount: p.balanceAmount,
    });
    const number = toWaNumber(p.client.phone);
    return {
      projectDbId: p.id,
      projectCode: p.projectId,
      clientName: p.client.fullName,
      clientId: p.client.clientId,
      clientPhone: p.client.phone,
      serviceName: p.service.serviceName,
      status: p.status,
      balanceAmount: p.balanceAmount,
      balanceStatus: p.balanceStatus,
      since: since.toISOString(),
      daysSince,
      band: agingBand(daysSince),
      reminderHref: number ? waLink(number, reminderText) : null,
      reminderText,
    };
  });
  // Oldest first within the list: the escalations sit at the top.
  rows.sort((a, b) => b.daysSince - a.daysSince);

  const bands: OutstandingBalances["bands"] = {
    normal: { count: 0, amount: 0 },
    follow_up: { count: 0, amount: 0 },
    escalate: { count: 0, amount: 0 },
  };
  for (const r of rows) {
    bands[r.band].count += 1;
    bands[r.band].amount += r.balanceAmount;
  }
  return {
    rows,
    bands,
    total: { count: rows.length, amount: rows.reduce((s, r) => s + r.balanceAmount, 0) },
  };
}

// ── Finance acts ────────────────────────────────────────────────────────

async function loadPendingRow(id: string) {
  const row = await db.payment.findUnique({
    where: { id },
    select: { id: true, type: true, direction: true, status: true, source: true, projectId: true, project: { select: { projectId: true } } },
  });
  if (!row) throw new RevenueError("That payment row was not found");
  if (row.direction !== "INFLOW" || !CLIENT_INFLOW_TYPES.includes(row.type as (typeof CLIENT_INFLOW_TYPES)[number]) || !row.projectId) {
    throw new RevenueError("Only a client payment can be confirmed or refused here");
  }
  if (row.source !== "MANUAL") {
    throw new RevenueError("A Paystack payment is confirmed by Paystack — use Sync on the reconciliation page if it is stuck");
  }
  if (row.status !== "Pending") throw new RevenueError(`That payment is already ${row.status.toLowerCase()}`);
  return { ...row, projectId: row.projectId, leg: (row.type === "CLIENT_BALANCE" ? "balance" : "downpayment") as "balance" | "downpayment" };
}

export interface ConfirmInput {
  changedById: string;
  paymentMethod?: string;
  reference?: string;
  /** YYYY-MM-DD */
  paymentDate?: string;
  notes?: string;
}

/**
 * Confirm a bank transfer the team marked as paid: the leg becomes Verified,
 * the row Confirmed, EduCraft's retained share is allocated to the buckets,
 * and the project advances if it was waiting on this money.
 */
export async function confirmRevenuePayment(id: string, input: ConfirmInput): Promise<{ projectCode: string; status: string }> {
  const row = await loadPendingRow(id);
  try {
    const detail = await verifyPayment(row.projectId, {
      leg: row.leg,
      changedById: input.changedById,
      paymentMethod: input.paymentMethod || undefined,
      reference: input.reference || undefined,
      paymentDate: input.paymentDate || undefined,
      notes: input.notes || undefined,
      pendingPaymentId: row.id,
    });
    return { projectCode: detail.projectId, status: detail.status };
  } catch (error) {
    if (error instanceof TransitionError) throw new RevenueError(error.message);
    throw error;
  }
}

/** Refuse a marked payment: the leg goes back to Unpaid, the row is Rejected, nothing was allocated. */
export async function rejectRevenuePayment(id: string, input: { changedById: string; note: string }): Promise<{ projectCode: string }> {
  const row = await loadPendingRow(id);
  try {
    const detail = await rejectPayment(row.projectId, { leg: row.leg, changedById: input.changedById, note: input.note, pendingPaymentId: row.id });
    return { projectCode: detail.projectId };
  } catch (error) {
    if (error instanceof TransitionError) throw new RevenueError(error.message);
    throw error;
  }
}

export interface ManualPaymentInput {
  projectCode: string;
  leg: "downpayment" | "balance";
  paymentMethod: string;
  reference?: string;
  /** YYYY-MM-DD */
  paymentDate?: string;
  notes?: string;
  changedById: string;
}

/**
 * Finance recording a transfer nobody marked first: the leg goes Unpaid ->
 * Paid (a MANUAL Pending row) -> Verified in one go. A leg already marked
 * paid is simply confirmed.
 */
export async function recordManualPayment(input: ManualPaymentInput): Promise<{ projectCode: string; status: string }> {
  const code = input.projectCode.trim().toUpperCase();
  const project = await db.project.findFirst({
    where: { OR: [{ projectId: code }, { id: input.projectCode.trim() }] },
    select: { id: true, projectId: true, isProBono: true, downpaymentStatus: true, balanceStatus: true },
  });
  if (!project) throw new RevenueError(`No project ${code}`);
  if (project.isProBono) throw new RevenueError("A pro bono project has no payments");
  const legStatus = input.leg === "downpayment" ? project.downpaymentStatus : project.balanceStatus;
  if (legStatus === "Verified") throw new RevenueError(`The ${input.leg} on ${project.projectId} is already verified`);

  const details = {
    paymentMethod: input.paymentMethod,
    reference: input.reference || undefined,
    paymentDate: input.paymentDate || undefined,
    notes: input.notes || undefined,
  };
  try {
    if (legStatus === "Unpaid") await markPaymentPaid(project.id, input.leg, details);
    const detail = await verifyPayment(project.id, { leg: input.leg, changedById: input.changedById, ...details });
    return { projectCode: detail.projectId, status: detail.status };
  } catch (error) {
    if (error instanceof TransitionError) throw new RevenueError(error.message);
    throw error;
  }
}
