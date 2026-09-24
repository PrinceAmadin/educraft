import { DISTRIBUTION_ROLES, REACH_SIZES, SERVICE_CHECK_CORRECT, SERVICE_CHECK_OPTIONS } from "@/lib/constants";

/**
 * Triage score for an ambassador application.
 *
 * This sorts the pile, it does not decide it. The effort points are a
 * completeness proxy — length is not quality — so the number only ever means
 * "read these first", and the founder still reads the pitch message before
 * approving anyone. The one mechanically checkable liability (picking the
 * wrong answer to "which do we NOT do") is a FLAG rather than a deduction, so
 * a big reach number can never average it away.
 *
 * Pure: no Prisma, no React, so it can be recomputed anywhere and tested.
 */

export const SCORE_MAX = 12;

export type ScoreFlag = "SERVICE_CHECK_FAILED" | "NO_REACH" | "OVERCLAIM";

export interface ApplicationScoreInput {
  reachRoles: string[];
  reachSize: string | null;
  reachGroups: string | null;
  expectedReferrals: number | null;
  firstWeekPlan: string | null;
  pitchMessage: string | null;
  objectionReply: string | null;
  clientUpsetReply: string | null;
  serviceCheck: string | null;
}

export interface ApplicationScore {
  total: number;
  max: typeof SCORE_MAX;
  reach: number;
  roles: number;
  commitment: number;
  effort: number;
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

  // Both the timid and the fantasists score below someone with a real number.
  const expected = input.expectedReferrals;
  const commitment = expected == null || expected <= 0 ? 0 : expected >= 5 && expected <= 40 ? 2 : 1;

  const effort =
    (len(input.pitchMessage) >= 80 ? 1 : 0) +
    (len(input.objectionReply) >= 40 && len(input.clientUpsetReply) >= 40 ? 1 : 0) +
    (len(input.firstWeekPlan) >= 40 ? 1 : 0);

  const flags: ScoreFlag[] = [];
  if (input.serviceCheck && input.serviceCheck !== SERVICE_CHECK_CORRECT) flags.push("SERVICE_CHECK_FAILED");
  if (roleSet.has("NONE") && input.reachSize === "UNDER_50") flags.push("NO_REACH");
  if (expected != null && expected > 40) flags.push("OVERCLAIM");

  const total = reach + roles + commitment + effort;

  return {
    total,
    max: SCORE_MAX,
    reach,
    roles,
    commitment,
    effort,
    flags,
    band: total >= 9 ? "strong" : total >= 5 ? "middle" : "weak",
  };
}

/** True for a row that predates the screening questions, so the UI can hide a meaningless 0/12. */
export function isLegacyApplication(input: ApplicationScoreInput): boolean {
  return !input.reachSize && !input.pitchMessage && !input.serviceCheck && (input.reachRoles ?? []).length === 0;
}

const labelFrom = (opts: readonly { value: string; label: string }[], value: string | null) =>
  opts.find((o) => o.value === value)?.label ?? null;

export const reachSizeLabel = (value: string | null) => labelFrom(REACH_SIZES, value);
export const serviceCheckLabel = (value: string | null) => labelFrom(SERVICE_CHECK_OPTIONS, value);

export function flagLabel(flag: ScoreFlag, input: ApplicationScoreInput): string {
  switch (flag) {
    case "SERVICE_CHECK_FAILED": {
      const picked = serviceCheckLabel(input.serviceCheck);
      return picked ? `Service check failed — picked "${picked}"` : "Service check failed";
    }
    case "NO_REACH":
      return "No reach yet";
    case "OVERCLAIM":
      return `Claims ${input.expectedReferrals} in 30 days`;
  }
}
