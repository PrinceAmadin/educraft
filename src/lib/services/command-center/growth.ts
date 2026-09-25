import { db } from "@/lib/db";
import { PAID_ORDER } from "@/lib/ambassador";
import { tierFor } from "@/lib/finance/commission-config";
import { fractionToPercent } from "@/lib/command-center/rag";
import {
  currentMonthKey,
  lastMonths,
  monthBounds,
  monthLongLabel,
  monthShortLabel,
  weekBuckets,
} from "@/lib/command-center/time";
import type {
  ConversionTrendPoint,
  GrowthPayload,
  SchoolStat,
  TierDistributionPoint,
  TierKey,
  TopAmbassador,
} from "@/lib/command-center/types";
import {
  activationSnapshot,
  conversionsBetween,
  countConversions,
  referralsBetween,
  type Conversion,
} from "./ambassador-activity";
import { getThresholds } from "./settings";
import { CLOSED_AMBASSADOR_STATUSES, growthLinks, tierPromotions } from "./sources/phase3";

/**
 * The Growth engine tab (Phase 5): the acquisition funnel, ambassador
 * activity, school penetration, the 6-month tier distribution, this month's
 * top ambassadors and the 12-week conversion trend. Read-only, cached for
 * 600 s by the route, so everything returned is JSON-safe (ISO strings,
 * numbers, null).
 *
 * "All numbers from Phase 3's ambassador data" (the spec): referrals,
 * conversions and activation come from `ambassador-activity.ts`, which reads
 * the Ambassador Platform's `AmbassadorReferral` rows once phase-3 is in
 * this build and main's orders until then; tier promotions come from
 * `AmbassadorTierLog` (nothing to show before the merge).
 *
 * Months are UTC keys like every finance figure (`time.ts`); weeks start
 * Monday 00:00 WAT. Reads run in small groups so the pool is never flooded.
 */

const TOP_AMBASSADORS = 5;
const TIER_MONTHS = 6;
const TREND_WEEKS = 12;

const TIER_FIELD: Record<TierKey, "bronze" | "silver" | "gold" | "platinum"> = {
  BRONZE: "bronze",
  SILVER: "silver",
  GOLD: "gold",
  PLATINUM: "platinum",
};

interface AmbassadorRow {
  id: string;
  createdAt: Date;
  status: string;
}

/** Instants that count toward each ambassador's tier, per ambassador id. */
type Ladder = Map<string, number[]>;

// ── Pure helpers ──────────────────────────────────────────────────

function inRange(at: Date, start: Date, end: Date): boolean {
  const t = at.getTime();
  return t >= start.getTime() && t < end.getTime();
}

function isOpen(status: string): boolean {
  return !(CLOSED_AMBASSADOR_STATUSES as readonly string[]).includes(status);
}

// ── Tier ladders ──────────────────────────────────────────────────

/**
 * Phase 3's ladder: an ambassador's tier is `calculateTier` of their
 * CONVERTED referrals (`recountAmbassador`), so every conversion row counts
 * once, on the day it converted.
 */
function referralLadder(rows: readonly Conversion[]): Ladder {
  const ladder: Ladder = new Map();
  for (const r of rows) {
    const list = ladder.get(r.ambassadorId) ?? [];
    list.push(r.at.getTime());
    ladder.set(r.ambassadorId, list);
  }
  return ladder;
}

/**
 * Main's ladder, until phase-3 is in this build: an ambassador's paying
 * clients are the clients they referred (`Client.referredById`) whose first
 * verified downpayment (`PAID_ORDER`, whatever became of the order) landed
 * — the rule the ambassador pages on main apply.
 */
async function ordersLadder(): Promise<Ladder> {
  const orders = await db.project.findMany({
    where: { ...PAID_ORDER, client: { referredById: { not: null } } },
    select: { clientId: true, downpaymentDate: true, createdAt: true, client: { select: { referredById: true } } },
  });
  const firstPaid = new Map<string, { referredById: string; at: number }>();
  for (const o of orders) {
    const referredById = o.client.referredById;
    if (!referredById) continue;
    const at = (o.downpaymentDate ?? o.createdAt).getTime();
    const seen = firstPaid.get(o.clientId);
    if (!seen || at < seen.at) firstPaid.set(o.clientId, { referredById, at });
  }
  const ladder: Ladder = new Map();
  for (const { referredById, at } of firstPaid.values()) {
    const list = ladder.get(referredById) ?? [];
    list.push(at);
    ladder.set(referredById, list);
  }
  return ladder;
}

// ── Sections ──────────────────────────────────────────────────────

/** Ambassadors in the network per tier at each of the last six month ends, from the ladder. */
function tierDistribution(ladder: Ladder, roster: readonly AmbassadorRow[], months: readonly string[]): TierDistributionPoint[] {
  return months.map((month) => {
    const cutoff = monthBounds(month).end.getTime();
    const point: TierDistributionPoint = {
      month,
      label: monthShortLabel(month),
      bronze: 0,
      silver: 0,
      gold: 0,
      platinum: 0,
    };
    for (const a of roster) {
      if (a.createdAt.getTime() >= cutoff) continue;
      const conversions = (ladder.get(a.id) ?? []).filter((at) => at < cutoff).length;
      point[TIER_FIELD[tierFor(conversions)]] += 1;
    }
    return point;
  });
}

/** Schools (the client's university) with at least one conversion, all time. */
function schoolPenetration(conversions: readonly Conversion[]): GrowthPayload["schoolPenetration"] {
  const schools = new Map<string, { stat: Omit<SchoolStat, "conversions" | "since">; units: Set<string>; since: number }>();
  for (const r of conversions) {
    if (!r.university) continue;
    const at = r.at.getTime();
    const s = schools.get(r.university.id) ?? {
      stat: { universityId: r.university.id, name: r.university.name, abbreviation: r.university.abbreviation },
      units: new Set<string>(),
      since: at,
    };
    s.units.add(r.unit);
    if (at < s.since) s.since = at;
    schools.set(r.university.id, s);
  }
  const stats: SchoolStat[] = [...schools.values()].map((s) => ({
    ...s.stat,
    conversions: s.units.size,
    since: new Date(s.since).toISOString(),
  }));
  const bySince = (s: SchoolStat) => (s.since ? Date.parse(s.since) : 0);
  const topSchool =
    stats.length === 0
      ? null
      : stats.reduce((best, s) =>
          s.conversions > best.conversions || (s.conversions === best.conversions && bySince(s) < bySince(best)) ? s : best
        );
  const newestSchool =
    stats.length === 0
      ? null
      : stats.reduce((best, s) =>
          bySince(s) > bySince(best) || (bySince(s) === bySince(best) && s.conversions > best.conversions) ? s : best
        );
  return { count: stats.length, topSchool, newestSchool };
}

/**
 * This month's conversions grouped by ambassador. "Earned" is the
 * commission credited at conversion — Σ `ambassadorCommission` on their
 * orders plus any Core override (`parentCommission`) they hold on a sub's
 * order this month, the spec's "paid on downpayment" framing. Only
 * ambassadors with a conversion this month are ranked, and, as on Phase 3's
 * leaderboard, never a suspended or terminated one (their conversions still
 * count in the funnel).
 */
async function topAmbassadors(monthRows: readonly Conversion[]): Promise<TopAmbassador[]> {
  const groups = new Map<string, { units: Set<string>; earned: number }>();
  for (const r of monthRows) {
    if (!isOpen(r.ambassadorStatus)) continue;
    const g = groups.get(r.ambassadorId) ?? { units: new Set<string>(), earned: 0 };
    g.units.add(r.unit);
    g.earned += r.project?.ambassadorCommission ?? 0;
    groups.set(r.ambassadorId, g);
  }
  for (const r of monthRows) {
    const parent = r.project?.parentAmbassadorId;
    if (!parent) continue;
    const core = groups.get(parent);
    if (core) core.earned += r.project?.parentCommission ?? 0;
  }
  const ranked = [...groups.entries()]
    .map(([id, g]) => ({ id, conversions: g.units.size, earned: Math.round(g.earned) }))
    .sort((a, b) => b.conversions - a.conversions || b.earned - a.earned || a.id.localeCompare(b.id))
    .slice(0, TOP_AMBASSADORS);
  if (ranked.length === 0) return [];

  const people = await db.ambassador.findMany({
    where: { id: { in: ranked.map((r) => r.id) } },
    select: { id: true, ambassadorId: true, fullName: true, tier: true, university: { select: { abbreviation: true } } },
  });
  const byId = new Map(people.map((p) => [p.id, p]));
  return ranked.flatMap((r) => {
    const p = byId.get(r.id);
    if (!p) return []; // an ambassador with orders cannot be deleted, so this is belt and braces
    return [
      {
        id: p.id,
        code: p.ambassadorId,
        name: p.fullName,
        tier: p.tier,
        school: p.university.abbreviation || null,
        conversions: r.conversions,
        earned: r.earned,
        href: `/admin/ambassadors/${p.id}`,
      },
    ];
  });
}

/** Weekly conversions and new ambassadors over the last 12 Monday-aligned WAT weeks. */
function conversionTrend(conversions: readonly Conversion[], ambassadors: readonly AmbassadorRow[], now: Date): ConversionTrendPoint[] {
  return weekBuckets(TREND_WEEKS, now).map((w) => ({
    weekStart: w.start.toISOString(),
    label: w.label,
    conversions: countConversions(conversions.filter((r) => inRange(r.at, w.start, w.end))),
    newAmbassadors: ambassadors.filter((a) => inRange(a.createdAt, w.start, w.end)).length,
  }));
}

// ── The payload ───────────────────────────────────────────────────

export async function getGrowth(now: Date = new Date()): Promise<GrowthPayload> {
  const month = currentMonthKey(now);
  const { start, end } = monthBounds(month);

  // Group 1: the month's referrals and projects, the roster, the thresholds.
  const [referrals, [projectsCreated, ambassadorDriven], ambassadors, thresholds] = await Promise.all([
    referralsBetween(start, end),
    db.$transaction([
      db.project.count({ where: { createdAt: { gte: start, lt: end } } }),
      db.project.count({ where: { createdAt: { gte: start, lt: end }, ambassadorId: { not: null } } }),
    ]),
    // Every ambassador, whatever their status: the tier chart, the trend and "joined this month" filter this one list.
    db.ambassador.findMany({ select: { id: true, createdAt: true, status: true } }),
    getThresholds(),
  ]);

  // Group 2: every conversion (one all-time read serves the funnel, the trend, the schools, the top five
  // and the tier ladder) and the month's promotions.
  const [conversions, promotions] = await Promise.all([conversionsBetween(null, null), tierPromotions(month)]);
  const fromReferrals = conversions.source === "referrals";

  // Group 3: activation over the same conversions, and main's ladder when phase-3 is not in this build.
  const [activation, ladder] = await Promise.all([
    activationSnapshot(now, conversions),
    fromReferrals ? Promise.resolve(referralLadder(conversions.rows)) : ordersLadder(),
  ]);

  const monthRows = conversions.rows.filter((r) => inRange(r.at, start, end));
  const monthConversions = countConversions(monthRows);

  // Group 4: names for the top five (only when someone converted this month).
  const top = await topAmbassadors(monthRows);

  const pending: string[] = [];
  if (!promotions) pending.push("Tier promotions (Phase 3)");
  if (referrals.source !== "referrals") pending.push("Referrals logged before an order (Phase 3)");

  const links = growthLinks(fromReferrals);
  return {
    generatedAt: now.toISOString(),
    month,
    monthLabel: monthLongLabel(month),
    funnel: {
      referrals: referrals.rows.length,
      referralSource: referrals.source,
      conversions: monthConversions,
      // Before phase-3 the two are different populations (a client referred last month may convert this
      // month), so the rate can pass 100; the referral table makes it a true funnel.
      conversionRate: referrals.rows.length > 0 ? Math.round((monthConversions / referrals.rows.length) * 1000) / 10 : null,
      projectsCreated,
      channel: { ambassadorDriven, direct: projectsCreated - ambassadorDriven },
    },
    ambassadorStats: {
      total: activation.total,
      active: ambassadors.filter((a) => a.status === "Active").length,
      activeThisMonth: activation.active,
      activationRate: activation.rate,
      activationTarget: fractionToPercent(thresholds["cc.growth.activation_rate.target"]),
      activationAmber: fractionToPercent(thresholds["cc.growth.activation_rate.amber"]),
      newThisMonth: ambassadors.filter((a) => inRange(a.createdAt, start, end)).length,
      tierPromotions: promotions ?? [],
    },
    schoolPenetration: schoolPenetration(conversions.rows),
    tierDistribution: {
      basis: fromReferrals ? "referrals" : "conversions",
      points: tierDistribution(
        ladder,
        ambassadors.filter((a) => isOpen(a.status)),
        lastMonths(TIER_MONTHS, now)
      ),
    },
    topAmbassadors: top,
    conversionTrend: conversionTrend(conversions.rows, ambassadors, now),
    links,
    pending,
  };
}
