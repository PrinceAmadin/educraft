import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createSponsorshipExpense } from "@/lib/services/expenses";
import type { CreatePartnershipInput, UpdatePartnershipInput } from "@/lib/validations/ambassador-platform";

/**
 * Partnerships (Phase 3 Section 6): student unions and faculty associations
 * the HOG works with. Money never lives here: a term's commitment (and each
 * renewal) is a SPONSORSHIP expense from the Growth Fund, logged through the
 * Phase 2 rules (up to ₦50,000 the HOG's call, above that the founder's) and
 * linked back by `Expense.partnershipId`. Projects are counted through the
 * ambassadors who came in through the partnership
 * (`Ambassador.recruitedByType = "PARTNERSHIP"`, `recruitedBy` = its id).
 */

export class PartnershipError extends Error {}

export const RENEWAL_ALERT_DAYS = 30;
const DAY = 86_400_000;

export const WHAT_WE_RECEIVE_LABELS: Record<string, string> = {
  GROUP_ACCESS: "Access to announce in their group",
  PHYSICAL_ACCESS: "Physical access (stands, visits)",
  BOTH: "Group access and physical access",
};

/** ACTIVE / IN_NEGOTIATION / INACTIVE as stored; the display adds the renewal window. */
export type PartnershipDisplayStatus = "ACTIVE" | "DUE_RENEWAL" | "RENEWAL_OVERDUE" | "IN_NEGOTIATION" | "INACTIVE";

export function partnershipDisplayStatus(p: { status: string; renewalDate: Date | null }, now: Date = new Date()): PartnershipDisplayStatus {
  if (p.status === "IN_NEGOTIATION") return "IN_NEGOTIATION";
  if (p.status !== "ACTIVE") return "INACTIVE";
  if (p.renewalDate) {
    if (p.renewalDate.getTime() < now.getTime()) return "RENEWAL_OVERDUE";
    if (p.renewalDate.getTime() - now.getTime() <= RENEWAL_ALERT_DAYS * DAY) return "DUE_RENEWAL";
  }
  return "ACTIVE";
}

/** Active partnerships whose renewal falls within 30 days or has passed — the dashboard's alert. */
export function renewalDueWhere(now: Date = new Date()): Prisma.PartnershipWhereInput {
  return { status: "ACTIVE", renewalDate: { not: null, lte: new Date(now.getTime() + RENEWAL_ALERT_DAYS * DAY) } };
}

export interface PartnershipRow {
  id: string;
  organisationName: string;
  school: string;
  faculty: string | null;
  status: string;
  displayStatus: PartnershipDisplayStatus;
  startDate: string | null;
  renewalDate: string | null;
  commitmentAmount: number;
  /** Growth Fund money paid for it (approved or within the HOG's limit). */
  paid: number;
  /** Logged but waiting for the founder (over ₦50,000). */
  pending: number;
  ambassadors: number;
  projects: number;
}

const ROW_SELECT = {
  id: true,
  organisationName: true,
  school: true,
  faculty: true,
  status: true,
  startDate: true,
  renewalDate: true,
  commitmentAmount: true,
  expenses: { where: { approvalStatus: { not: "DECLINED" } }, select: { amount: true, approvalStatus: true } },
} satisfies Prisma.PartnershipSelect;

async function channelCounts(ids: string[]): Promise<Map<string, { ambassadors: number; projects: number }>> {
  const out = new Map<string, { ambassadors: number; projects: number }>();
  if (ids.length === 0) return out;
  const ambassadors = await db.ambassador.findMany({ where: { recruitedByType: "PARTNERSHIP", recruitedBy: { in: ids } }, select: { id: true, recruitedBy: true } });
  const owner = new Map(ambassadors.map((a) => [a.id, a.recruitedBy!]));
  const conversions = ambassadors.length
    ? await db.ambassadorReferral.groupBy({ by: ["ambassadorId"], where: { ambassadorId: { in: ambassadors.map((a) => a.id) }, status: "CONVERTED", projectId: { not: null } }, _count: { _all: true } })
    : [];
  for (const id of ids) out.set(id, { ambassadors: 0, projects: 0 });
  for (const a of ambassadors) out.get(a.recruitedBy!)!.ambassadors += 1;
  for (const c of conversions) {
    const pid = owner.get(c.ambassadorId);
    if (pid) out.get(pid)!.projects += c._count._all;
  }
  return out;
}

function toRow(p: Prisma.PartnershipGetPayload<{ select: typeof ROW_SELECT }>, counts: { ambassadors: number; projects: number } | undefined, now: Date): PartnershipRow {
  const settled = p.expenses.filter((e) => e.approvalStatus !== "PENDING_APPROVAL");
  const waiting = p.expenses.filter((e) => e.approvalStatus === "PENDING_APPROVAL");
  return {
    id: p.id,
    organisationName: p.organisationName,
    school: p.school,
    faculty: p.faculty,
    status: p.status,
    displayStatus: partnershipDisplayStatus(p, now),
    startDate: p.startDate?.toISOString() ?? null,
    renewalDate: p.renewalDate?.toISOString() ?? null,
    commitmentAmount: p.commitmentAmount,
    paid: Math.round(settled.reduce((s, e) => s + e.amount, 0)),
    pending: Math.round(waiting.reduce((s, e) => s + e.amount, 0)),
    ambassadors: counts?.ambassadors ?? 0,
    projects: counts?.projects ?? 0,
  };
}

const STATUS_ORDER: Record<PartnershipDisplayStatus, number> = { RENEWAL_OVERDUE: 0, DUE_RENEWAL: 1, ACTIVE: 2, IN_NEGOTIATION: 3, INACTIVE: 4 };

/** Every partnership: the ones needing a renewal first, then active, in negotiation, inactive. */
export async function listPartnerships(now: Date = new Date()): Promise<PartnershipRow[]> {
  const rows = await db.partnership.findMany({ orderBy: [{ renewalDate: "asc" }, { organisationName: "asc" }], select: ROW_SELECT });
  const counts = await channelCounts(rows.map((r) => r.id));
  return rows
    .map((r) => toRow(r, counts.get(r.id), now))
    .sort((a, b) => STATUS_ORDER[a.displayStatus] - STATUS_ORDER[b.displayStatus] || (a.renewalDate ?? "9999").localeCompare(b.renewalDate ?? "9999") || a.organisationName.localeCompare(b.organisationName));
}

export interface PartnershipDetail extends PartnershipRow {
  contactPerson: string | null;
  contactWhatsapp: string | null;
  whatWeReceive: string | null;
  whatWeReceiveLabel: string | null;
  notes: string | null;
  createdByName: string | null;
  /** From this date the renewal shows on the dashboard's Needs attention panel. */
  reminderFrom: string | null;
  payments: { id: string; date: string; description: string; amount: number; approvalStatus: string }[];
  linkedAmbassadors: { id: string; ambassadorId: string; fullName: string; tier: string; conversions: number; projects: number }[];
}

export async function getPartnership(id: string, now: Date = new Date()): Promise<PartnershipDetail | null> {
  const p = await db.partnership.findUnique({
    where: { id },
    select: { ...ROW_SELECT, contactPerson: true, contactWhatsapp: true, whatWeReceive: true, notes: true, createdBy: true },
  });
  if (!p) return null;
  const [counts, payments, ambassadors, creator] = await Promise.all([
    channelCounts([id]),
    db.expense.findMany({ where: { partnershipId: id }, orderBy: { date: "desc" }, select: { id: true, date: true, description: true, amount: true, approvalStatus: true } }),
    db.ambassador.findMany({ where: { recruitedByType: "PARTNERSHIP", recruitedBy: id }, orderBy: { fullName: "asc" }, select: { id: true, ambassadorId: true, fullName: true, tier: true, lifetimeConversions: true } }),
    db.user.findUnique({ where: { id: p.createdBy }, select: { displayName: true, execProfile: { select: { fullName: true } } } }),
  ]);
  const perAmbassador = ambassadors.length
    ? await db.ambassadorReferral.groupBy({ by: ["ambassadorId"], where: { ambassadorId: { in: ambassadors.map((a) => a.id) }, status: "CONVERTED", projectId: { not: null } }, _count: { _all: true } })
    : [];
  const projectsOf = new Map(perAmbassador.map((x) => [x.ambassadorId, x._count._all]));
  return {
    ...toRow(p, counts.get(id), now),
    contactPerson: p.contactPerson,
    contactWhatsapp: p.contactWhatsapp,
    whatWeReceive: p.whatWeReceive,
    whatWeReceiveLabel: p.whatWeReceive ? (WHAT_WE_RECEIVE_LABELS[p.whatWeReceive] ?? p.whatWeReceive) : null,
    notes: p.notes,
    createdByName: creator?.execProfile?.fullName ?? creator?.displayName ?? null,
    reminderFrom: p.renewalDate ? new Date(p.renewalDate.getTime() - RENEWAL_ALERT_DAYS * DAY).toISOString() : null,
    payments: payments.map((e) => ({ id: e.id, date: e.date.toISOString(), description: e.description, amount: e.amount, approvalStatus: e.approvalStatus })),
    linkedAmbassadors: ambassadors.map((a) => ({ id: a.id, ambassadorId: a.ambassadorId, fullName: a.fullName, tier: a.tier, conversions: a.lifetimeConversions, projects: projectsOf.get(a.id) ?? 0 })),
  };
}

// ── Writes ───────────────────────────────────────────────────────────────

interface Actor {
  userId: string;
  role: string;
}

function dateOrNull(v: string | undefined | null): Date | null {
  return v ? new Date(`${v}T00:00:00.000Z`) : null;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The day a commitment is recorded as paid: the start date if it has passed, else today. */
function paidOnFor(startDate: Date | null, now: Date): string {
  return isoDay(startDate && startDate.getTime() <= now.getTime() ? startDate : now);
}

async function recordCommitment(partnership: { id: string; organisationName: string; commitmentAmount: number; startDate: Date | null }, actor: Actor, now: Date, label = "partnership"): Promise<{ expenseId: string; approvalStatus: string } | null> {
  if (partnership.commitmentAmount <= 0) return null;
  const res = await createSponsorshipExpense(
    { description: `${partnership.organisationName} ${label}`.slice(0, 200), amount: partnership.commitmentAmount, date: paidOnFor(partnership.startDate, now), notes: "" },
    actor.userId,
    actor.role,
    { partnershipId: partnership.id }
  );
  return { expenseId: res.id, approvalStatus: res.approvalStatus };
}

/**
 * "Add partnership". An ACTIVE one with a commitment logs that commitment as
 * a Growth Fund sponsorship straight away; one still in negotiation pays
 * nothing until it becomes active.
 */
export async function createPartnership(input: CreatePartnershipInput, actor: Actor, now: Date = new Date()): Promise<{ id: string; expense: { expenseId: string; approvalStatus: string } | null }> {
  const created = await db.partnership.create({
    data: {
      organisationName: input.organisationName,
      school: input.school,
      faculty: input.faculty || null,
      contactPerson: input.contactPerson || null,
      contactWhatsapp: input.contactWhatsapp || null,
      status: input.status,
      commitmentAmount: input.commitmentAmount,
      whatWeReceive: input.whatWeReceive || null,
      startDate: dateOrNull(input.startDate),
      renewalDate: dateOrNull(input.renewalDate),
      notes: input.notes || null,
      createdBy: actor.userId,
    },
    select: { id: true, organisationName: true, commitmentAmount: true, startDate: true, status: true },
  });
  const expense = created.status === "ACTIVE" ? await recordCommitment(created, actor, now) : null;
  return { id: created.id, expense };
}

/**
 * Edit. Becoming ACTIVE for the first time with a commitment (it was in
 * negotiation) logs the commitment then, once — a partnership that already
 * has a payment on record is not charged again by an edit (use Renew).
 */
export async function updatePartnership(id: string, input: UpdatePartnershipInput, actor: Actor, now: Date = new Date()): Promise<{ expense: { expenseId: string; approvalStatus: string } | null }> {
  const existing = await db.partnership.findUnique({ where: { id }, select: { id: true, status: true, startDate: true, renewalDate: true } });
  if (!existing) throw new PartnershipError("Partnership not found");
  const start = input.startDate !== undefined ? dateOrNull(input.startDate) : existing.startDate;
  const renewal = input.renewalDate !== undefined ? dateOrNull(input.renewalDate) : existing.renewalDate;
  if (start && renewal && renewal.getTime() <= start.getTime()) throw new PartnershipError("The renewal date must be after the start date");
  const data: Prisma.PartnershipUpdateInput = {};
  if (input.organisationName !== undefined) data.organisationName = input.organisationName;
  if (input.school !== undefined) data.school = input.school;
  if (input.faculty !== undefined) data.faculty = input.faculty || null;
  if (input.contactPerson !== undefined) data.contactPerson = input.contactPerson || null;
  if (input.contactWhatsapp !== undefined) data.contactWhatsapp = input.contactWhatsapp || null;
  if (input.commitmentAmount !== undefined) data.commitmentAmount = input.commitmentAmount;
  if (input.whatWeReceive !== undefined) data.whatWeReceive = input.whatWeReceive || null;
  if (input.status !== undefined) data.status = input.status;
  if (input.startDate !== undefined) data.startDate = start;
  if (input.renewalDate !== undefined) data.renewalDate = renewal;
  if (input.notes !== undefined) data.notes = input.notes || null;
  const updated = await db.partnership.update({ where: { id }, data, select: { id: true, organisationName: true, commitmentAmount: true, startDate: true, status: true } });
  let expense: { expenseId: string; approvalStatus: string } | null = null;
  if (existing.status !== "ACTIVE" && updated.status === "ACTIVE") {
    const paidBefore = await db.expense.count({ where: { partnershipId: id, approvalStatus: { not: "DECLINED" } } });
    if (paidBefore === 0) expense = await recordCommitment(updated, actor, now);
  }
  return { expense };
}

/**
 * "Renew": the next term. Records the new term's payment (if any) from the
 * Growth Fund, moves the renewal date on and makes the partnership active.
 */
export async function renewPartnership(id: string, input: { amount: number; renewalDate: string }, actor: Actor, now: Date = new Date()): Promise<{ expense: { expenseId: string; approvalStatus: string } | null }> {
  const p = await db.partnership.findUnique({ where: { id }, select: { id: true, organisationName: true, renewalDate: true, status: true } });
  if (!p) throw new PartnershipError("Partnership not found");
  const next = dateOrNull(input.renewalDate)!;
  if (next.getTime() <= now.getTime()) throw new PartnershipError("The next renewal date must be in the future");
  if (p.renewalDate && next.getTime() <= p.renewalDate.getTime()) throw new PartnershipError("The next renewal date must be after the current one");
  await db.partnership.update({ where: { id }, data: { renewalDate: next, commitmentAmount: input.amount, status: "ACTIVE" } });
  const expense = input.amount > 0 ? await recordCommitment({ id, organisationName: p.organisationName, commitmentAmount: input.amount, startDate: null }, actor, now, "partnership renewal") : null;
  return { expense };
}

/** Record that an ambassador came in through this partnership (their channel). */
export async function linkAmbassador(partnershipId: string, ambassadorId: string): Promise<void> {
  const [p, a] = await Promise.all([
    db.partnership.findUnique({ where: { id: partnershipId }, select: { id: true } }),
    db.ambassador.findUnique({ where: { id: ambassadorId }, select: { id: true, recruitedByType: true, recruitedBy: true } }),
  ]);
  if (!p) throw new PartnershipError("Partnership not found");
  if (!a) throw new PartnershipError("Ambassador not found");
  if (a.recruitedByType === "PARTNERSHIP" && a.recruitedBy === partnershipId) return;
  await db.ambassador.update({ where: { id: ambassadorId }, data: { recruitedByType: "PARTNERSHIP", recruitedBy: partnershipId } });
}

export async function unlinkAmbassador(partnershipId: string, ambassadorId: string): Promise<void> {
  const a = await db.ambassador.findUnique({ where: { id: ambassadorId }, select: { recruitedByType: true, recruitedBy: true } });
  if (!a || a.recruitedByType !== "PARTNERSHIP" || a.recruitedBy !== partnershipId) throw new PartnershipError("That ambassador is not linked to this partnership");
  await db.ambassador.update({ where: { id: ambassadorId }, data: { recruitedByType: null, recruitedBy: null } });
}

/** Partnerships an ambassador can be said to have come in through (for pickers). */
export async function partnershipOptions(): Promise<{ id: string; organisationName: string; school: string }[]> {
  return db.partnership.findMany({ where: { status: { in: ["ACTIVE", "IN_NEGOTIATION"] } }, orderBy: { organisationName: "asc" }, select: { id: true, organisationName: true, school: true } });
}
