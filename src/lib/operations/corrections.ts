/**
 * Supervisor corrections, the rules. Pure.
 *
 * Three rounds are part of the service. After round three, further
 * corrections are out of scope and need a new order — the limit is fixed
 * here, not in a setting, and only the founder can open a fourth round (in
 * the database).
 */
export const MAX_CORRECTION_ROUNDS = 3;

/** A round's default deadline: a week from when the client's note arrives. */
export const DEFAULT_CORRECTION_DAYS = 7;

export const CORRECTION_LIMIT_MESSAGE =
  "This project has reached the 3-round correction limit. Further corrections are out of scope and require a new service order.";

export type CorrectionRoundStatus = "IN_PROGRESS" | "COMPLETED" | "ESCALATED";

/** How many rounds a project has had: the Phase 4 rounds table, or the older counter when it is higher. */
export function roundsSoFar(tableRounds: number, legacyCount: number): number {
  return Math.max(tableRounds, legacyCount);
}

export function correctionLimitReached(tableRounds: number, legacyCount: number): boolean {
  return roundsSoFar(tableRounds, legacyCount) >= MAX_CORRECTION_ROUNDS;
}
