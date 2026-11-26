import crypto from "crypto";
import { NextResponse } from "next/server";
import { VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE_SECONDS, readVisitorId } from "@/lib/click-tracking/record-click";

/**
 * The `ecv` visitor cookie, shared by every tracked redirect: the ambassador
 * referral links and the printed recruitment cards.
 *
 * It is an anonymous random id, so "same visitor" means "same device". Without
 * it `recordClick` falls back to hashing the IP and user agent, and on shared
 * campus Wi-Fi or a Nigerian carrier's NAT thousands of phones sit behind one
 * address — similar phones collapse into one visitor and real first scans are
 * recorded as duplicates.
 *
 * This is why a scan is tracked by a ROUTE HANDLER and not by the landing
 * page: a server component cannot set a cookie, and a page GET fires again on
 * refresh, back-navigation and link previews, where a redirect is requested
 * once.
 */

export { VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE_SECONDS } from "@/lib/click-tracking/record-click";

/** The visitor's existing id, or a fresh one to set on the response. */
export function resolveVisitorId(req: Request): string {
  return readVisitorId(req.headers) ?? crypto.randomUUID();
}

const COOKIE_OPTIONS = {
  maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  secure: true,
} as const;

/** A 302 that also carries the visitor cookie, plus any extra cookies the caller needs. */
export function redirectWithVisitor(
  url: string,
  visitorId: string,
  extra: { name: string; value: string; maxAge: number }[] = []
) {
  const res = NextResponse.redirect(url, 302);
  res.cookies.set(VISITOR_COOKIE, visitorId, COOKIE_OPTIONS);
  for (const cookie of extra) {
    res.cookies.set(cookie.name, cookie.value, { ...COOKIE_OPTIONS, maxAge: cookie.maxAge });
  }
  return res;
}
