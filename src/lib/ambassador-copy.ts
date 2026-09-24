import type { TierProgress } from "@/lib/ambassador";

/**
 * Plain-language wording for the ambassador portal.
 *
 * Ambassadors are students, not marketers: nothing on their screens says
 * "conversion", "conversion rate" or "converted". The count they care about is
 * paying clients referred — people who used their link and paid a downpayment
 * — and the word "conversions" only ever appears spelled out, in the hint
 * below, for anyone who has met it in a group chat or on a flyer.
 *
 * Every portal screen imports from here so the wording cannot drift apart.
 */

/** Label for the tier-earning count. */
export const PAYING_CLIENTS_LABEL = "Paying clients referred";

/** The one-line explainer. Shown under the number, not hidden behind a hover. */
export const PAYING_CLIENTS_HINT =
  "Conversions = clients you referred who paid their downpayment";

/** Shorter form, for places with no room for the full sentence. */
export const PAYING_CLIENTS_SHORT = "Paid their downpayment";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "3 of the 8 people who used your link have paid" — the old "conversion rate". */
export function payingShareLine(payingClients: number, referrals: number): string {
  if (referrals === 0) return "Nobody has used your link yet";
  const people = referrals === 1 ? "1 person" : `${referrals} people`;
  return `${payingClients} of the ${people} who used your link ${payingClients === 1 ? "has" : "have"} paid`;
}

/**
 * The tier progress sentence: what they have brought, and exactly what the
 * next tier is worth. `nextRate` comes from Settings, not the ladder defaults,
 * so the promise on screen is the rate that will actually be paid.
 */
export function tierProgressLine(
  progress: TierProgress,
  rates: { current: number; next: number | null }
): string {
  const { payingClients, toNext, nextLabel } = progress;

  const brought =
    payingClients === 0
      ? "You haven't brought a paying client to EduCraft yet."
      : `You have brought ${plural(payingClients, "paying client")} to EduCraft.`;

  if (!nextLabel || rates.next == null) {
    return `${brought} You are on the top tier, earning ${rates.current}% on every project.`;
  }

  // Already past the threshold, waiting on the tier to be moved up.
  if (toNext === 0) {
    return `${brought} That is enough for ${nextLabel} — your ${rates.next}% on every project is being set up.`;
  }

  return `${brought} Bring ${toNext} more to reach ${nextLabel} and earn ${rates.next}% on every project.`;
}
