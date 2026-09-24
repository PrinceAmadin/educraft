import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { recountAmbassador } from "@/lib/services/ambassador-platform/conversions";

/**
 * Referral tracking (Phase 3 Section 2 / Step 4).
 *
 * An `AmbassadorReferral` is one student an ambassador brought in. It starts
 * PENDING — logged by the HOG on the ambassador's behalf, or created the
 * moment an order carries their code / is allocated to them — and becomes
 * CONVERTED when that order's downpayment is confirmed. A conversion is what
 * moves the tier. The conversion trigger (`recordConversion`) is called from
 * every path that confirms a downpayment, inside the same transaction, and is
 * idempotent: a webhook replay, an admin Sync or a second click finds the row
 * converted and changes nothing.
 *
 * "Ambassador-driven" is `Project.ambassadorId` (snapshotted on Payment as
 * `ambassadorId` / `isAmbassadorDriven` by Phase 2) — no parallel field.
 */

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof db;

export class ReferralError extends Error {}

const CLOSED_ACCOUNTS = ["Suspended", "Terminated"];

const PROJECT_SELECT = {
  id: true,
  projectId: true,
  ambassadorId: true,
  clientId: true,
  price: true,
  isProBono: true,
  status: true,
  downpaymentStatus: true,
  downpaymentDate: true,
  createdAt: true,
  client: { select: { id: true, fullName: true, phone: true } },
} satisfies Prisma.ProjectSelect;

type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof PROJECT_SELECT }>;

/** Digits only, Nigerian +234 folded to the local 0-prefix, so 0803… and +234803… match. */
export function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length >= 13) return `0${digits.slice(3)}`;
  return digits;
}

function phoneVariants(raw: string | null | undefined): string[] {
  const local = normalizePhone(raw);
  if (!local) return [];
  const out = new Set([local]);
  if (local.startsWith("0") && local.length === 11) {
    const rest = local.slice(1);
    out.add(`234${rest}`);
    out.add(`+234${rest}`);
    out.add(`+234 ${rest}`);
  }
  return [...out];
}

function appendNote(existing: string | null, line: string): string {
  return [existing, line].filter(Boolean).join("\n");
}

/**
 * A PENDING referral the HOG logged for this ambassador that names this
 * client (same phone, else same name) — adopted by the order instead of a
 * second row, so "referrals submitted" is never inflated.
 */
async function matchPendingReferral(tx: Db, ambassadorId: string, client: { fullName: string; phone: string }): Promise<{ id: string } | null> {
  const phones = phoneVariants(client.phone);
  const candidates = await tx.ambassadorReferral.findMany({
    where: { ambassadorId, status: "PENDING", projectId: null },
    orderBy: { submittedAt: "desc" },
    select: { id: true, clientName: true, clientWhatsapp: true },
  });
  const byPhone = phones.length ? candidates.find((c) => c.clientWhatsapp && phones.includes(normalizePhone(c.clientWhatsapp)) ) : undefined;
  if (byPhone) return byPhone;
  const name = client.fullName.trim().toLowerCase();
  const byName = candidates.find((c) => c.clientName.trim().toLowerCase() === name);
  return byName ?? null;
}

/**
 * Make sure exactly one live referral row stands for a project that has an
 * ambassador. Called when an order arrives with a code (INTAKE), an admin
 * creates a job against an ambassador (ADMIN) and on (re)allocation. On a
 * reallocation the previous ambassador's row is cancelled and freed; a row
 * cancelled earlier for the same ambassador is revived. If the downpayment is
 * already confirmed, the conversion is recorded at once.
 */
export async function ensureProjectReferral(tx: Tx, projectDbId: string, source: "INTAKE" | "ADMIN", createdById?: string | null): Promise<void> {
  const project = await tx.project.findUnique({ where: { id: projectDbId }, select: PROJECT_SELECT });
  if (!project || !project.ambassadorId || project.isProBono) return;
  const row = await upsertProjectRow(tx, project, source, createdById ?? null);
  const verified = project.downpaymentStatus === "Verified";
  if (verified) await recordConversion(tx, projectDbId, { paidOn: project.downpaymentDate ?? undefined, source });
  // Everyone the row change touched is recounted — including the ambassador
  // who just lost this referral on a reallocation (recordConversion only
  // recounts the one who now holds it).
  for (const id of row.touched) {
    if (verified && id === project.ambassadorId) continue;
    await recountAmbassador(tx, id);
  }
}

async function upsertProjectRow(tx: Tx, project: ProjectRow, source: "INTAKE" | "ADMIN", createdById: string | null): Promise<{ id: string; status: string; touched: Set<string> }> {
  const ambassadorId = project.ambassadorId!;
  const touched = new Set<string>([ambassadorId]);
  const existing = await tx.ambassadorReferral.findUnique({ where: { projectId: project.id }, select: { id: true, ambassadorId: true, status: true, notes: true } });

  if (existing && existing.ambassadorId === ambassadorId) {
    if (existing.status === "CANCELLED" || existing.status === "LOST") {
      await tx.ambassadorReferral.update({ where: { id: existing.id }, data: { status: "PENDING", notes: appendNote(existing.notes, "Reinstated: the job is theirs again") } });
      return { id: existing.id, status: "PENDING", touched };
    }
    return { id: existing.id, status: existing.status, touched };
  }
  if (existing) {
    // Reallocated: the previous ambassador loses this referral and the project link is freed.
    await tx.ambassadorReferral.update({
      where: { id: existing.id },
      data: { status: "CANCELLED", projectId: null, notes: appendNote(existing.notes, `Reallocated to another ambassador (${project.projectId})`) },
    });
    touched.add(existing.ambassadorId);
  }
  const pending = await matchPendingReferral(tx, ambassadorId, project.client);
  if (pending) {
    await tx.ambassadorReferral.update({ where: { id: pending.id }, data: { projectId: project.id, clientId: project.client.id, projectValue: project.price } });
    return { id: pending.id, status: "PENDING", touched };
  }
  const created = await tx.ambassadorReferral.create({
    data: {
      ambassadorId,
      clientName: project.client.fullName,
      clientWhatsapp: project.client.phone || null,
      clientId: project.client.id,
      projectId: project.id,
      projectValue: project.price,
      status: "PENDING",
      source,
      submittedAt: project.createdAt,
      createdById,
    },
    select: { id: true },
  });
  return { id: created.id, status: "PENDING", touched };
}

export interface ConversionResult {
  ambassadorId: string;
  referralId: string;
  tier: string;
  previousTier: string;
  tierChanged: boolean;
  /** False when the row was already converted (a replay). */
  newConversion: boolean;
}

/**
 * THE CONVERSION TRIGGER. A project's downpayment has just been confirmed
 * (manual verify, Paystack webhook / poll / Sync, or pay-first intake): if the
 * project has an ambassador, its referral becomes CONVERTED, the confirmed
 * downpayment Payment row(s) point at it (`referralId`), and the ambassador's
 * lifetime counters and tier are recomputed (a tier change is logged).
 * Pro bono and direct (no ambassador) jobs never convert anything.
 */
export async function recordConversion(tx: Tx, projectDbId: string, opts: { paymentId?: string; paidOn?: Date; source?: "INTAKE" | "ADMIN" } = {}): Promise<ConversionResult | null> {
  const project = await tx.project.findUnique({ where: { id: projectDbId }, select: PROJECT_SELECT });
  if (!project || !project.ambassadorId || project.isProBono) return null;
  const row = await upsertProjectRow(tx, project, opts.source ?? "INTAKE", null);
  const newConversion = row.status !== "CONVERTED";
  if (newConversion) {
    await tx.ambassadorReferral.update({
      where: { id: row.id },
      data: { status: "CONVERTED", convertedAt: opts.paidOn ?? project.downpaymentDate ?? new Date(), clientId: project.client.id, projectValue: project.price },
    });
  }
  await tx.payment.updateMany({
    where: { projectId: projectDbId, type: "CLIENT_DOWNPAYMENT", status: "Confirmed", referralId: null, ...(opts.paymentId ? {} : {}) },
    data: { referralId: row.id },
  });
  let result: Awaited<ReturnType<typeof recountAmbassador>> = null;
  for (const id of row.touched) {
    const r = await recountAmbassador(tx, id);
    if (id === project.ambassadorId) result = r;
  }
  if (!result) return null;
  return { ambassadorId: project.ambassadorId, referralId: row.id, tier: result.tier, previousTier: result.previousTier, tierChanged: result.tierChanged, newConversion };
}

/**
 * The job was cancelled / refunded, or its ambassador removed: the referral
 * no longer counts (CANCELLED) and the counters follow. The row keeps its
 * project link for history; an allocation back to the same ambassador
 * revives it.
 */
export async function cancelProjectReferral(tx: Tx, projectDbId: string, reason: string): Promise<void> {
  const row = await tx.ambassadorReferral.findUnique({ where: { projectId: projectDbId }, select: { id: true, ambassadorId: true, status: true, notes: true } });
  if (!row || row.status === "CANCELLED") return;
  await tx.ambassadorReferral.update({ where: { id: row.id }, data: { status: "CANCELLED", notes: appendNote(row.notes, reason) } });
  await recountAmbassador(tx, row.ambassadorId);
}

// ── The HOG's own entries ────────────────────────────────────────────────

export interface LogReferralInput {
  clientName: string;
  clientWhatsapp?: string;
  school?: string;
  notes?: string;
}

/** The HOG logs a student an ambassador brought in, before (or without) an order. */
export async function logReferral(ambassadorId: string, input: LogReferralInput, createdById: string): Promise<{ id: string; clientId: string | null }> {
  const ambassador = await db.ambassador.findUnique({ where: { id: ambassadorId }, select: { id: true, fullName: true, status: true } });
  if (!ambassador) throw new ReferralError("Ambassador not found");
  if (CLOSED_ACCOUNTS.includes(ambassador.status)) throw new ReferralError(`${ambassador.fullName} is ${ambassador.status.toLowerCase()} — their referrals do not count until they are reactivated`);
  const phones = phoneVariants(input.clientWhatsapp);
  const client = phones.length ? await db.client.findFirst({ where: { phone: { in: phones } }, select: { id: true } }) : null;
  return db.$transaction(async (tx) => {
    const row = await tx.ambassadorReferral.create({
      data: {
        ambassadorId,
        clientName: input.clientName.trim(),
        clientWhatsapp: input.clientWhatsapp?.trim() || null,
        school: input.school?.trim() || null,
        notes: input.notes?.trim() || null,
        clientId: client?.id ?? null,
        status: "PENDING",
        source: "HOG",
        createdById,
      },
      select: { id: true, clientId: true },
    });
    await recountAmbassador(tx, ambassadorId);
    return row;
  });
}

export interface UpdateReferralInput {
  status?: "PENDING" | "LOST" | "CANCELLED";
  clientName?: string;
  clientWhatsapp?: string;
  school?: string;
  notes?: string;
}

/** Edit or close a referral the HOG logged. A row tied to an order follows the order instead. */
export async function updateReferral(ambassadorId: string, referralId: string, input: UpdateReferralInput): Promise<void> {
  const row = await db.ambassadorReferral.findUnique({ where: { id: referralId }, select: { id: true, ambassadorId: true, projectId: true, status: true } });
  if (!row || row.ambassadorId !== ambassadorId) throw new ReferralError("Referral not found");
  if (row.projectId && input.status) throw new ReferralError("This referral is tied to an order — its status follows the order");
  if (row.status === "CONVERTED" && input.status) throw new ReferralError("A converted referral cannot be changed");
  const data: Prisma.AmbassadorReferralUpdateInput = {};
  if (input.status) data.status = input.status;
  if (input.clientName !== undefined) data.clientName = input.clientName.trim();
  if (input.clientWhatsapp !== undefined) data.clientWhatsapp = input.clientWhatsapp.trim() || null;
  if (input.school !== undefined) data.school = input.school.trim() || null;
  if (input.notes !== undefined) data.notes = input.notes.trim() || null;
  await db.$transaction(async (tx) => {
    await tx.ambassadorReferral.update({ where: { id: referralId }, data });
    await recountAmbassador(tx, ambassadorId);
  });
}

/** Every referral of one ambassador, newest first (the detail page shows the last 20; this is the full list). */
export async function listReferrals(ambassadorId: string) {
  return db.ambassadorReferral.findMany({
    where: { ambassadorId },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      submittedAt: true,
      convertedAt: true,
      clientName: true,
      clientWhatsapp: true,
      school: true,
      status: true,
      source: true,
      notes: true,
      projectValue: true,
      client: { select: { id: true, clientId: true } },
      project: { select: { projectId: true, status: true, service: { select: { serviceName: true } } } },
    },
  });
}
