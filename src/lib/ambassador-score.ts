import { DISTRIBUTION_ROLES, REACH_SIZES } from "@/lib/constants";

/**
 * Triage score for an ambassador application.
 *
 * This sorts the pile, it does not decide it. The number only ever means "read
 * these first", and the founder still reads the answers before approving
 * anyone. Length is a completeness proxy, never a measure of quality, so it is
 * worth at most a single point.
 *
 * Pure: no Prisma, no React, so it can be recomputed anywhere and tested.
 */

export const SCORE_MAX = 10;

export type ScoreFlag = "NO_REACH" | "OVERCLAIM";

export interface ApplicationScoreInput {
  reachRoles: string[];
  reachSize: string | null;
  reachGroups: string | null;
  expectedReferrals: number | null;
  firstWeekPlan: string | null;
}

export interface ApplicationScore {
  total: number;
  max: typeof SCORE_MAX;
  reach: number;
  roles: number;
  commitment: number;
  flags: ScoreFlag[];
  band: "strong" | "middle" | "weak";
}

const REACH_POINTS: Record<string, number> = {
  UNDER_50: 0,
  R50_150: 1,
  R150_400: 2,
  OVER_400: 3,
};

const len = (s: string | null | undefined) => (s ?? "").trim().length;

/** An application from before Sept 2026 answers none of this: it scores 0 and is marked weak. */
export function scoreApplication(input: ApplicationScoreInput): ApplicationScore {
  const roleSet = new Set(input.reachRoles ?? []);

  const reachBand = REACH_POINTS[input.reachSize ?? ""] ?? 0;
  const reach = reachBand + (len(input.reachGroups) >= 20 ? 1 : 0);

  const strong = (DISTRIBUTION_ROLES as readonly string[]).filter((r) => roleSet.has(r)).length;
  const roles = strong > 0 ? Math.min(strong, 3) : roleSet.has("CLUB_ACTIVE") ? 1 : 0;

  // Both the timid and the fantasists score below someone with a real number,
  // and a week-one plan with some thought in it is worth one more.
  const expected = input.expectedReferrals;
  const commitment =
    (expected == null || expected <= 0 ? 0 : expected >= 5 && expected <= 40 ? 2 : 1) +
    (len(input.firstWeekPlan) >= 40 ? 1 : 0);

  const flags: ScoreFlag[] = [];
  if (roleSet.has("NONE") && input.reachSize === "UNDER_50") flags.push("NO_REACH");
  if (expected != null && expected > 40) flags.push("OVERCLAIM");

  const total = reach + roles + commitment;

  return {
    total,
    max: SCORE_MAX,
    reach,
    roles,
    commitment,
    flags,
    band: total >= 7 ? "strong" : total >= 4 ? "middle" : "weak",
  };
}

/** True for a row that predates the screening questions, so the UI can hide a meaningless 0/10. */
export function isLegacyApplication(input: ApplicationScoreInput): boolean {
  return (
    !input.reachSize &&
    !input.reachGroups &&
    input.expectedReferrals == null &&
    (input.reachRoles ?? []).length === 0
  );
}

const labelFrom = (opts: readonly { value: string; label: string }[], value: string | null) =>
  opts.find((o) => o.value === value)?.label ?? null;

export const reachSizeLabel = (value: string | null) => labelFrom(REACH_SIZES, value);

export function flagLabel(flag: ScoreFlag, input: ApplicationScoreInput): string {
  switch (flag) {
    case "NO_REACH":
      return "No reach yet";
    case "OVERCLAIM":
      return `Claims ${input.expectedReferrals} in 30 days`;
  }
}
