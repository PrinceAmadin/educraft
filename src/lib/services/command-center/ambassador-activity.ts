import type { Prisma, ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { DAY_MS } from "@/lib/command-center/time";
import { ratePercent } from "@/lib/command-center/derive";
import { CLOSED_AMBASSADOR_STATUSES, convertedReferrals, referralsSubmitted } from "./sources/phase3";

/**
 * Referrals, conversions and ambassador activation — one definition for the
 * Today, Health and Growth tabs.
 *
 * After the phase-3 merge they come from the Ambassador Platform's own
 * record, `AmbassadorReferral`: a referral is a row submitted in the window
 * (not cancelled), a conversion is a row that reached CONVERTED, counted per
 * referral exactly like its dashboard. Until then they are rebuilt from
 * main's orders: a referral is a client created with a referrer, a
 * conversion is a referred order whose downpayment was verified (pro bono,
 * cancelled and refunded orders left out), counted per client. Both date a
 * conversion by the downpayment (`recordConversion` copies its date).
 */

export type ConversionSource = "referrals" | "orders";

export interface Conversion {
  /** What a count counts: the referral (Phase 3) or the client (main). */
  unit: string;
  ambassadorId: string;
  ambassadorName: string;
  /** The ambassador's school: "schools with active ambassadors". */
  ambassadorUniversityId: string;
  ambassadorStatus: string;
  clientId: string | null;
  clientName: string | null;
  /** The client's school: school penetration. */
  university: { id: string; name: string; abbreviation: string } | null;
  at: Date;
  project: {
    id: string;
    code: string;
    ambassadorCommission: number | null;
    parentAmbassadorId: string | null;
    parentCommission: number | null;
  } | null;
}

export interface Conversions {
  source: ConversionSource;
  rows: Conversion[];
}

const DEAD: ProjectStatus[] = ["CANCELLED", "REFUNDED"];
const OPEN_AMBASSADOR: Prisma.AmbassadorWhereInput = { status: { notIn: [...CLOSED_AMBASSADOR_STATUSES] } };

/** Distinct units: the number the dashboards show for a set of conversions. */
export function countConversions(rows: readonly Conversion[]): number {
  return new Set(rows.map((r) => r.unit)).size;
}

/** Conversions with their date in [from, to); either end may be open. Newest first. */
export async function conversionsBetween(from: Date | null, to: Date | null): Promise<Conversions> {
  const referrals = await convertedReferrals(from, to);
  if (referrals) {
    return {
      source: "referrals",
      rows: referrals.map((r) => ({
        unit: r.id,
        ambassadorId: r.ambassadorId,
        ambassadorName: r.ambassador.fullName,
        ambassadorUniversityId: r.ambassador.universityId,
        ambassadorStatus: r.ambassador.status,
        clientId: r.clientId,
        clientName: r.client?.fullName ?? null,
        university: r.client ? { id: r.client.universityId, ...r.client.university } : null,
        at: r.convertedAt,
        project: r.project
          ? {
              id: r.project.id,
              code: r.project.projectId,
              ambassadorCommission: r.project.ambassadorCommission,
              parentAmbassadorId: r.project.parentAmbassadorId,
              parentCommission: r.project.parentCommission,
            }
          : null,
      })),
    };
  }

  const dated = from || to ? { downpaymentDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {};
  const orders = await db.project.findMany({
    where: { ambassadorId: { not: null }, downpaymentStatus: "Verified", isProBono: false, status: { notIn: DEAD }, ...dated },
    orderBy: { downpaymentDate: "desc" },
    select: {
      id: true,
      projectId: true,
      clientId: true,
      downpaymentDate: true,
      createdAt: true,
      ambassadorCommission: true,
      parentAmbassadorId: true,
      parentCommission: true,
      client: { select: { fullName: true, universityId: true, university: { select: { name: true, abbreviation: true } } } },
      ambassador: { select: { id: true, fullName: true, universityId: true, status: true } },
    },
  });
  return {
    source: "orders",
    rows: orders.flatMap((o) =>
      o.ambassador
        ? [
            {
              unit: o.clientId,
              ambassadorId: o.ambassador.id,
              ambassadorName: o.ambassador.fullName,
              ambassadorUniversityId: o.ambassador.universityId,
              ambassadorStatus: o.ambassador.status,
              clientId: o.clientId,
              clientName: o.client.fullName,
              university: { id: o.client.universityId, ...o.client.university },
              // Old rows carry no downpayment date; the order date stands in (all-time reads only).
              at: o.downpaymentDate ?? o.createdAt,
              project: {
                id: o.id,
                code: o.projectId,
                ambassadorCommission: o.ambassadorCommission,
                parentAmbassadorId: o.parentAmbassadorId,
                parentCommission: o.parentCommission,
              },
            },
          ]
        : []
    ),
  };
}

export interface Referral {
  ambassadorId: string;
  at: Date;
}

/** Referrals submitted in [from, to): Phase 3's referral rows, else clients created with a referrer. */
export async function referralsBetween(from: Date, to: Date): Promise<{ source: ConversionSource; rows: Referral[] }> {
  const submitted = await referralsSubmitted(from, to);
  if (submitted) return { source: "referrals", rows: submitted.map((r) => ({ ambassadorId: r.ambassadorId, at: r.submittedAt })) };
  const clients = await db.client.findMany({
    where: { referredById: { not: null }, createdAt: { gte: from, lt: to } },
    select: { referredById: true, createdAt: true },
  });
  return {
    source: "orders",
    rows: clients.flatMap((c) => (c.referredById ? [{ ambassadorId: c.referredById, at: c.createdAt }] : [])),
  };
}

// ── Activation ────────────────────────────────────────────────────

/** An ambassador is active with a conversion in the last 30 days (Phase 3's `activityStatus`). */
export const ACTIVE_WINDOW_DAYS = 30;

export interface ActivationSnapshot {
  /** Ambassadors in the network: not suspended or terminated. */
  total: number;
  /** Of them, those with a conversion in the last 30 days. */
  active: number;
  /** active ÷ total, whole percent; null with no ambassadors. */
  rate: number | null;
  source: ConversionSource;
}

/**
 * The Ambassador Dashboard's activation rate (Phase 3): ambassadors with a
 * conversion in the last 30 days over every ambassador not suspended or
 * terminated. `recent` may pass conversions already read for the last 30
 * days or more, to save a query.
 */
export async function activationSnapshot(now: Date, recent?: Conversions): Promise<ActivationSnapshot> {
  const since = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * DAY_MS);
  const [open, conversions] = await Promise.all([
    db.ambassador.findMany({ where: OPEN_AMBASSADOR, select: { id: true } }),
    recent ? Promise.resolve(recent) : conversionsBetween(since, null),
  ]);
  const openIds = new Set(open.map((a) => a.id));
  const active = new Set(
    conversions.rows.filter((c) => c.at.getTime() >= since.getTime() && openIds.has(c.ambassadorId)).map((c) => c.ambassadorId)
  );
  return { total: open.length, active: active.size, rate: ratePercent(active.size, open.length), source: conversions.source };
}

/**
 * Schools (the ambassador's university) where an ambassador in the network
 * converted a client in the last 30 days, and in the 30 days before that —
 * "schools with active ambassadors". Needs the last 60 days of conversions.
 */
export function activeSchools(conversions: Conversions, now: Date): { current: number; previous: number } {
  const cut = now.getTime() - ACTIVE_WINDOW_DAYS * DAY_MS;
  const floor = now.getTime() - 2 * ACTIVE_WINDOW_DAYS * DAY_MS;
  const current = new Set<string>();
  const previous = new Set<string>();
  for (const c of conversions.rows) {
    if ((CLOSED_AMBASSADOR_STATUSES as readonly string[]).includes(c.ambassadorStatus)) continue;
    const t = c.at.getTime();
    if (t >= cut) current.add(c.ambassadorUniversityId);
    else if (t >= floor) previous.add(c.ambassadorUniversityId);
  }
  return { current: current.size, previous: previous.size };
}
