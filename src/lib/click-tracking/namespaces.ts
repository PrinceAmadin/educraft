/**
 * `ClickEvent.slotCode` carries two unrelated families of link, and this file
 * is the line between them.
 *
 *   "054" / "ECCA-001" / "ECSA-001-003"   an ambassador's CLIENT referral link
 *   "JOIN-A7K3" / "JOINCTA-A7K3"          a printed recruitment card
 *
 * They share the column so the recruitment scan reuses `recordClick` whole —
 * its quality subquery, its retries, its Redis replay queue, its visitor
 * cookie. What they must never share is a number.
 *
 * THE INVARIANT: a recruitment code is never attributed to an ambassador.
 * `ClickEvent.ambassadorId` is only ever resolved by matching
 * `Ambassador.legacySlotId`, which no `JOIN-` value can equal, and every
 * ambassador-facing read (the public leaderboard, link analytics, the weekly
 * email, the CSV export) filters on `ambassadorId`. So recruitment scans are
 * already invisible to all of them.
 *
 * That holds by accident of naming. These helpers make it hold on purpose:
 * anything that walks slot codes checks `isRecruitSlotCode` first, so a
 * recruitment scan can never be claimed as an ambassador's own click and can
 * never reach the leaderboard.
 */

/** A card was scanned. */
export const RECRUIT_SCAN_PREFIX = "JOIN-";

/** Someone on the recruitment page tapped through to the application. */
export const RECRUIT_CTA_PREFIX = "JOINCTA-";

export const recruitScanCode = (cardCode: string) => `${RECRUIT_SCAN_PREFIX}${cardCode}`;
export const recruitCtaCode = (cardCode: string) => `${RECRUIT_CTA_PREFIX}${cardCode}`;

/** True for either recruitment family — i.e. "this is not an ambassador's client link". */
export function isRecruitSlotCode(slotCode: string): boolean {
  return slotCode.startsWith(RECRUIT_SCAN_PREFIX) || slotCode.startsWith(RECRUIT_CTA_PREFIX);
}

/** The card code inside a namespaced slot code, or null if it is not one. */
export function cardCodeFromSlotCode(slotCode: string): string | null {
  if (slotCode.startsWith(RECRUIT_CTA_PREFIX)) return slotCode.slice(RECRUIT_CTA_PREFIX.length);
  if (slotCode.startsWith(RECRUIT_SCAN_PREFIX)) return slotCode.slice(RECRUIT_SCAN_PREFIX.length);
  return null;
}
