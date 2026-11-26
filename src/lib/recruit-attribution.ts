/**
 * How a printed card's credit reaches the application it produced.
 *
 * The scan route sets `ecr` to the card's code; the application POST reads it
 * off the request cookies, server-side, exactly as it already reads the
 * caller's IP. It never enters the form or the request body, so nobody can
 * credit a rival — or themselves — by editing what the browser sends.
 *
 * A cookie rather than a parameter threaded through the form: every field in
 * the application form lives in memory, so a refresh already loses the whole
 * form, which makes a hidden field LESS durable than a cookie, not more. The
 * cookie also survives the 409 "verify your email" round trip for nothing.
 *
 * It is not signed. An HMAC would add a key to rotate and protect only the
 * question of which real person gets credit for a real recruit who still has
 * to be approved and still has to bring a paying student. For scale: the
 * client referral path takes a referral code straight from the browser's own
 * body to route a commission many times larger.
 */

/** The card whose QR was scanned. */
export const RECRUIT_CARD_COOKIE = "ecr";

/** 30 days: long enough for the student who scans now and applies next week. */
export const RECRUIT_CARD_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

/** The card code in a request's cookies, or null. Shape-checked, never trusted further. */
export function readRecruitCardCode(headers: Headers): string | null {
  const header = headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== RECRUIT_CARD_COOKIE) continue;
    const value = decodeURIComponent(rest.join("=")).trim().toUpperCase();
    return /^[0-9A-Z]{2,16}$/.test(value) ? value : null;
  }
  return null;
}
