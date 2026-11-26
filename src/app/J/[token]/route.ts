import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { db } from "@/lib/db";
import { drainClickRetryQueue, recordClick } from "@/lib/click-tracking/record-click";
import { recruitScanCode } from "@/lib/click-tracking/namespaces";
import { redirectWithVisitor, resolveVisitorId } from "@/lib/click-tracking/visitor-cookie";
import { RECRUIT_CARD_COOKIE, RECRUIT_CARD_COOKIE_MAX_AGE } from "@/lib/recruit-attribution";

/**
 * A printed card's QR code: `/J/{CODE}` → record the scan → the join page.
 *
 * A route handler and not the page itself, for two reasons. Only a handler can
 * set the `ecv` visitor cookie, and without it a campus full of phones behind
 * one carrier address collapses into a single "visitor" and real first scans
 * are recorded as duplicates. And a page GET fires again on refresh, back
 * navigation and link previews, where a redirect is requested once.
 *
 * Upper case `J` is deliberate: a QR code can use its compact alphanumeric
 * mode only for digits and capitals, so a lowercase path forces the denser
 * byte mode. `next.config.ts` redirects a hand-typed `/j/` here, and the code
 * itself is upper-cased below, so neither has to be typed exactly.
 *
 * Nothing here can fail the redirect. An unknown code still lands on the join
 * page — a student holding a card EduCraft has since deleted should read the
 * pitch, not an error — it simply credits nobody.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const code = decodeURIComponent(params.token ?? "").trim().toUpperCase();
  const visitorId = resolveVisitorId(req);
  const join = new URL("/join", req.url);

  if (!code || code.length > 16) return NextResponse.redirect(join, 302);

  let card: { code: string; status: string } | null = null;
  try {
    card = await db.recruitCard.findUnique({ where: { code }, select: { code: true, status: true } });
  } catch (error) {
    // A database hiccup must not cost the student the page they scanned for.
    console.error("[recruit-card] lookup failed:", error instanceof Error ? error.message : error);
  }

  if (!card) return redirectWithVisitor(join.toString(), visitorId);

  // Record first, settings and everything else after: the write starts the
  // moment the card is confirmed and is handed to `waitUntil`, so the student
  // is redirected immediately and Vercel keeps the function alive until it
  // lands. `recordClick` never throws — it retries, then queues in Redis — and
  // the drain replays anything an earlier failure left behind.
  const isTestClick = new URL(req.url).searchParams.get("test") === "1";
  waitUntil(
    recordClick({ slotCode: recruitScanCode(card.code), headers: req.headers, isTestClick, visitorId })
      .then(() => drainClickRetryQueue())
      .catch((error) => {
        console.error("[recruit-card] scan write failed:", error instanceof Error ? error.message : error);
      })
  );

  // A retired card still records its scan but credits nobody, so it sets no
  // attribution cookie.
  const extra =
    card.status === "ACTIVE"
      ? [{ name: RECRUIT_CARD_COOKIE, value: card.code, maxAge: RECRUIT_CARD_COOKIE_MAX_AGE }]
      : [];

  return redirectWithVisitor(join.toString(), visitorId, extra);
}
