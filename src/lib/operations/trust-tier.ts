/**
 * Phase 6: a worker's trust tier — a coarse Green / Amber / Red probation
 * signal the COO sees in the directory, on a worker's page and when assigning.
 *
 * It is DERIVED from dated records, never a hand-set counter (the same choice
 * as the activity status in the ambassador platform): clean completed projects
 * count up; open flags and a chapter currently in revision count down. Because
 * it is derived on read it can never drift from the facts, and there is nothing
 * to backfill. Pure.
 *
 * Deliberately NOT in scope: routing review intensity by tier (who approves a
 * chapter). That changes the approval pipeline and is a separate founder call.
 */

export type TrustTier = "GREEN" | "AMBER" | "RED";

export interface TrustSignals {
  /** Projects this worker has completed — a clean delivery record. */
  completed: number;
  /** Open (unresolved) worker flags of any kind. */
  openFlags: number;
  /** Open flags that are conduct concerns. */
  conductFlags: number;
  /** The worker's projects currently sent back for revision. */
  openRevisions: number;
}

/** Clean completed projects a worker needs before they can be Green. */
export const TRUST_GREEN_MIN_COMPLETED = 5;

/**
 * Red needs oversight (a conduct flag, or two or more open flags). Green is
 * trusted (enough clean deliveries, nothing open against them). Everyone else —
 * new, still proving out, or with one open concern — is Amber (on probation).
 */
export function deriveTrustTier(s: TrustSignals): TrustTier {
  if (s.conductFlags >= 1 || s.openFlags >= 2) return "RED";
  if (s.openFlags >= 1 || s.openRevisions >= 1 || s.completed < TRUST_GREEN_MIN_COMPLETED) return "AMBER";
  return "GREEN";
}

/** One short line on why the worker sits in this tier, for the COO. */
export function trustTierReason(s: TrustSignals): string {
  if (s.conductFlags >= 1) return "A conduct flag is open.";
  if (s.openFlags >= 2) return `${s.openFlags} flags are open.`;
  if (s.openFlags >= 1) return "A flag is open.";
  if (s.openRevisions >= 1) return s.openRevisions === 1 ? "A project is in revision." : `${s.openRevisions} projects are in revision.`;
  if (s.completed < TRUST_GREEN_MIN_COMPLETED) return s.completed === 0 ? "New — no completed projects yet." : `Still proving out — ${s.completed} of ${TRUST_GREEN_MIN_COMPLETED} clean deliveries.`;
  return `${s.completed} clean deliveries, nothing open.`;
}

export const TRUST_TIER: Record<TrustTier, { label: string; tone: string; description: string }> = {
  GREEN: { label: "Green", tone: "bg-success/15 text-success", description: "Trusted — a clean track record." },
  AMBER: { label: "Amber", tone: "bg-gold/15 text-gold", description: "On probation — new, still proving out, or an open concern." },
  RED: { label: "Red", tone: "bg-danger/15 text-danger", description: "Needs oversight — open flags or a conduct concern." },
};
