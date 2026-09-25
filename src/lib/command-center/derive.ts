/**
 * Pure rules the Command Center shares with the Ambassador Platform
 * (phase-3) and the Operations Platform (phase-4), copied here because those
 * branches are not merged into this one yet. Each names the function it
 * mirrors; after the merge they can be replaced by imports of those.
 * No database. `npm run check:cc` tests them.
 */

// ── Operations (Phase 4) ─────────────────────────────────────────

/** Three supervisor-correction rounds are part of the service (`MAX_CORRECTION_ROUNDS`, @/lib/operations/corrections). */
export const MAX_CORRECTION_ROUNDS = 3;

/** Tier 2 reference flags are counted over a rolling 30 days (`TIER2_FLAG_WINDOW_DAYS`, @/lib/operations/worker-performance). */
export const TIER2_FLAG_WINDOW_DAYS = 30;

/** A worker with this many unresolved Tier 2 flags in the window is a quality risk (`TIER2_FLAG_WARNING`). */
export const TIER2_FLAG_WARNING = 3;

/** The QA queue flags a submission waiting this long (`QA_OVERDUE_HOURS`, @/lib/services/operations/qa-reviews). */
export const QA_OVERDUE_HOURS = 24;

/**
 * The round a project in SUPERVISOR_CORRECTIONS is on. Phase 4 opens round
 * max(rounds in the table, the older counter) + 1, and the older counter
 * (`supervisorCorrectionCount`) grows only when a round is re-delivered, so
 * the open round is the larger of the latest recorded round and counter + 1.
 * Projects from before the table have no rows: counter + 1.
 */
export function currentCorrectionRound(latestRecordedRound: number, legacyCount: number): number {
  return Math.max(latestRecordedRound, legacyCount + 1);
}

/** Delivered on or before the internal deadline; null when either date is missing (`deliveredOnTime`, @/lib/operations/worker-performance). */
export function deliveredOnTime(deliveryDate: Date | null, internalDeadline: Date | null): boolean | null {
  if (!deliveryDate || !internalDeadline) return null;
  return deliveryDate.getTime() <= internalDeadline.getTime();
}

/** The supervisor accepted it: it never came back for corrections (`supervisorAccepted`, @/lib/operations/worker-performance). */
export function supervisorAccepted(p: { status: string; supervisorCorrectionCount: number; correctionRounds: number }): boolean {
  return p.status !== "SUPERVISOR_CORRECTIONS" && p.supervisorCorrectionCount === 0 && p.correctionRounds === 0;
}

/** A whole percent, or null when there is nothing to divide by — the Operations report's `kpi()` rounding. */
export function ratePercent(count: number, total: number): number | null {
  return total > 0 ? Math.round((count / total) * 100) : null;
}

// ── Ambassador Platform (Phase 3) ────────────────────────────────

/** "Q3-2026" for the UTC calendar quarter an instant falls in (`currentQuarterKey`, ambassador-platform/commissions). */
export function quarterKeyOf(d: Date): string {
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1}-${d.getUTCFullYear()}`;
}

export interface QuarterSpan {
  key: string;
  /** "Q3 2026" */
  label: string;
  start: Date;
  /** Exclusive: the first instant of the next quarter. */
  end: Date;
  /** The month a bonus earned in the quarter is paid in, "2026-10" (`quarterFromKey`). */
  payoutMonth: string;
}

/** The span of a "Q3-2026" key, or null when the key is not one. */
export function quarterSpan(key: string): QuarterSpan | null {
  const m = /^Q([1-4])-(\d{4})$/.exec(key);
  if (!m) return null;
  const q = Number(m[1]);
  const y = Number(m[2]);
  const start = new Date(Date.UTC(y, (q - 1) * 3, 1));
  const end = new Date(Date.UTC(y, q * 3, 1));
  const payoutMonth = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}`;
  return { key, label: `Q${q} ${y}`, start, end, payoutMonth };
}

/** The quarter before the one `key` names. */
export function previousQuarterKey(key: string): string | null {
  const span = quarterSpan(key);
  return span ? quarterKeyOf(new Date(span.start.getTime() - 1)) : null;
}

/** The quarter part of a Platinum bonus key "platinum:Q3-2026:<ambassadorId>", or null for any other key. */
export function platinumBonusQuarter(bonusKey: string | null): string | null {
  const m = /^platinum:(Q[1-4]-\d{4}):/.exec(bonusKey ?? "");
  return m ? m[1] : null;
}

/** The HOG's weekly rhythm posts (`RHYTHM`, @/lib/ambassadors/content-types); "OTHER" posts do not count. */
export const RHYTHM_POSTS = ["MONDAY_FLIER", "WEDS_CHECKIN", "FRIDAY_SPOTLIGHT"] as const;

export interface ContentConsistency {
  /** Rhythm posts that went out: at most one per type per week. */
  made: number;
  /** Three per week. */
  expected: number;
  weeks: number;
  /** made ÷ expected as a whole percent; null with no full week to judge. */
  rate: number | null;
}

/**
 * Share of the rhythm posts (three a week) that went out over the given full
 * weeks — the Content Hub's per-post check (`contentConsistency`,
 * ambassador-platform/content) taken over all three posts at once. A second
 * post of the same type in a week does not make up for a missing one.
 */
export function contentConsistencyOf(
  weeks: readonly { start: Date; end: Date }[],
  posts: readonly { contentType: string; postedAt: Date }[]
): ContentConsistency {
  let made = 0;
  for (const w of weeks) {
    for (const type of RHYTHM_POSTS) {
      const posted = posts.some(
        (p) => p.contentType === type && p.postedAt.getTime() >= w.start.getTime() && p.postedAt.getTime() < w.end.getTime()
      );
      if (posted) made += 1;
    }
  }
  const expected = weeks.length * RHYTHM_POSTS.length;
  return { made, expected, weeks: weeks.length, rate: ratePercent(made, expected) };
}
