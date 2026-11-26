import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import {
  RECRUIT_CTA_PREFIX,
  RECRUIT_SCAN_PREFIX,
  cardCodeFromSlotCode,
} from "@/lib/click-tracking/namespaces";
import { resolveRecruiterNames } from "@/lib/services/growth/recruit-cards";

/**
 * What a print run actually produced: scan → page → application → approved →
 * first paying student, per card and per school.
 *
 * Every stage is DERIVED from rows that already exist. No counters, nothing to
 * sweep, nothing that can drift from the records it is counted from — the same
 * discipline as the activity statuses and the trust tiers.
 *
 * Two stages are deliberately absent.
 *
 * There is no separate "page view": the scan redirects straight onto the page,
 * so a scan IS a view, and counting it twice would only measure redirect loss
 * while being inflated by every refresh.
 *
 * And "started the application" cannot be counted honestly — the form holds
 * nothing on the server until it is submitted. The tap through to the form is
 * the closest honest proxy, and the screen says so rather than implying a
 * number it does not have.
 */

export interface FunnelStage {
  scans: number;
  /** Distinct devices. The only honest denominator: one person re-scanning is not two people. */
  uniqueScans: number;
  ctaClicks: number;
  applications: number;
  approved: number;
  rejected: number;
  /** Approved AND has since brought a paying student. The only stage that touches revenue. */
  activated: number;
}

export interface CardFunnelRow extends FunnelStage {
  code: string;
  label: string;
  batch: string | null;
  holderType: string;
  holderName: string | null;
  cardSchool: string | null;
  status: string;
  printedCount: number | null;
  /** printedCount × unitCostNgn, when both are known. */
  costNgn: number | null;
  /** What one submitted application cost in print. Null until there is one. */
  costPerApplicationNgn: number | null;
}

export interface SchoolFunnelRow extends FunnelStage {
  school: string;
}

export interface RecruitFunnel {
  totals: FunnelStage;
  byCard: CardFunnelRow[];
  /** Where the cards were sent. */
  byCardSchool: SchoolFunnelRow[];
  /** Where the applicants turned out to be. Different from the above, and the difference is the signal. */
  byApplicantSchool: SchoolFunnelRow[];
}

const EMPTY: FunnelStage = {
  scans: 0,
  uniqueScans: 0,
  ctaClicks: 0,
  applications: 0,
  approved: 0,
  rejected: 0,
  activated: 0,
};

const blank = (): FunnelStage => ({ ...EMPTY });

function add(into: FunnelStage, from: FunnelStage): void {
  into.scans += from.scans;
  into.uniqueScans += from.uniqueScans;
  into.ctaClicks += from.ctaClicks;
  into.applications += from.applications;
  into.approved += from.approved;
  into.rejected += from.rejected;
  into.activated += from.activated;
}

async function compute(): Promise<RecruitFunnel> {
  const [clicks, cards, applications] = await Promise.all([
    // One index scan on (slotCode, timestamp): `JOIN` catches both prefixes,
    // and they are told apart below. Test clicks and archived rows are
    // excluded here, as every other click read does.
    db.clickEvent.groupBy({
      by: ["slotCode", "quality"],
      where: { slotCode: { startsWith: "JOIN" }, isTestClick: false, archivedAt: null },
      _count: { _all: true },
    }),
    db.recruitCard.findMany({
      select: {
        code: true,
        label: true,
        batch: true,
        holderType: true,
        holderId: true,
        status: true,
        printedCount: true,
        unitCostNgn: true,
        university: { select: { name: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    db.ambassadorApplication.findMany({
      where: { recruitCardCode: { not: null } },
      select: {
        recruitCardCode: true,
        status: true,
        universityId: true,
        otherUniversity: true,
        university: { select: { name: true } },
        ambassadorId: true,
      },
    }),
  ]);

  // Activation is joined back to a card THROUGH the application, so nothing
  // extra has to be stored on the ambassador.
  const ambassadorIds = applications.map((a) => a.ambassadorId).filter((id): id is string => Boolean(id));
  const activated = ambassadorIds.length
    ? await db.ambassador.findMany({
        where: { id: { in: ambassadorIds }, activatedAt: { not: null } },
        select: { id: true },
      })
    : [];
  const activatedIds = new Set(activated.map((a) => a.id));

  const byCode = new Map<string, FunnelStage>();
  const stage = (code: string) => {
    const existing = byCode.get(code);
    if (existing) return existing;
    const fresh = blank();
    byCode.set(code, fresh);
    return fresh;
  };

  for (const row of clicks) {
    const code = cardCodeFromSlotCode(row.slotCode);
    if (!code) continue;
    const count = row._count._all;
    const target = stage(code);
    if (row.slotCode.startsWith(RECRUIT_CTA_PREFIX)) {
      target.ctaClicks += count;
    } else if (row.slotCode.startsWith(RECRUIT_SCAN_PREFIX)) {
      // BOT rows are stored in full but counted nowhere, same as the
      // ambassador link analytics.
      if (row.quality === "BOT") continue;
      target.scans += count;
      if (row.quality === "UNIQUE") target.uniqueScans += count;
    }
  }

  const applicantSchools = new Map<string, FunnelStage>();
  for (const app of applications) {
    const code = app.recruitCardCode;
    if (!code) continue;
    const target = stage(code);
    target.applications += 1;
    if (app.status === "APPROVED") target.approved += 1;
    if (app.status === "REJECTED") target.rejected += 1;
    const isActivated = app.ambassadorId ? activatedIds.has(app.ambassadorId) : false;
    if (isActivated) target.activated += 1;

    const school = app.university?.name ?? app.otherUniversity ?? "Not given";
    const schoolStage = applicantSchools.get(school) ?? blank();
    schoolStage.applications += 1;
    if (app.status === "APPROVED") schoolStage.approved += 1;
    if (app.status === "REJECTED") schoolStage.rejected += 1;
    if (isActivated) schoolStage.activated += 1;
    applicantSchools.set(school, schoolStage);
  }

  const names = await resolveRecruiterNames(cards);

  const totals = blank();
  const cardSchools = new Map<string, FunnelStage>();

  const byCard: CardFunnelRow[] = cards.map((card) => {
    const s = byCode.get(card.code) ?? blank();
    add(totals, s);

    const school = card.university?.name ?? "Not set";
    const schoolStage = cardSchools.get(school) ?? blank();
    add(schoolStage, s);
    cardSchools.set(school, schoolStage);

    const costNgn =
      card.printedCount !== null && card.unitCostNgn !== null ? card.printedCount * card.unitCostNgn : null;

    return {
      ...s,
      code: card.code,
      label: card.label,
      batch: card.batch,
      holderType: card.holderType,
      holderName: names.get(`${card.holderType}:${card.holderId}`) ?? null,
      cardSchool: card.university?.name ?? null,
      status: card.status,
      printedCount: card.printedCount,
      costNgn,
      costPerApplicationNgn: costNgn !== null && s.applications > 0 ? Math.round(costNgn / s.applications) : null,
    };
  });

  // Scans on a card that has since been deleted still happened, and the
  // totals must not quietly lose them.
  const known = new Set(cards.map((c) => c.code));
  for (const [code, s] of byCode) {
    if (!known.has(code)) add(totals, s);
  }

  const toRows = (map: Map<string, FunnelStage>): SchoolFunnelRow[] =>
    [...map.entries()]
      .map(([school, s]) => ({ school, ...s }))
      .sort((a, b) => b.applications - a.applications || b.scans - a.scans);

  return { totals, byCard, byCardSchool: toRows(cardSchools), byApplicantSchool: toRows(applicantSchools) };
}

export const RECRUIT_FUNNEL_TAG = "recruit-funnel";

/** Cached for five minutes: the same shape as the leaderboard's cache, and nothing here is per-viewer. */
export const getRecruitFunnel = unstable_cache(compute, ["growth", RECRUIT_FUNNEL_TAG, "v1"], {
  tags: [RECRUIT_FUNNEL_TAG],
  revalidate: 300,
});

/** A percentage, or null when the denominator is zero — never a misleading 0%. */
export function rate(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}
