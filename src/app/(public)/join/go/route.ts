import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { drainClickRetryQueue, recordClick } from "@/lib/click-tracking/record-click";
import { recruitCtaCode } from "@/lib/click-tracking/namespaces";
import { resolveVisitorId } from "@/lib/click-tracking/visitor-cookie";
import { readRecruitCardCode } from "@/lib/recruit-attribution";

/**
 * Every button on the join page points here, and this sends them on to the
 * application form.
 *
 * Its only job is the one number the page cannot otherwise know: how many
 * people who read the pitch went on to the form. The application form holds
 * nothing on the server until it is submitted, so "started the form" cannot be
 * counted honestly — this click is the closest honest proxy, and the funnel
 * says so rather than pretending otherwise.
 *
 * It records nothing when the visitor arrived without a card: an organic
 * visitor's tap is not a card's result and must not be counted as one.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const apply = new URL("/apply", req.url);
  const code = readRecruitCardCode(req.headers);
  if (!code) return NextResponse.redirect(apply, 302);

  const isTestClick = new URL(req.url).searchParams.get("test") === "1";
  waitUntil(
    recordClick({
      slotCode: recruitCtaCode(code),
      headers: req.headers,
      isTestClick,
      visitorId: resolveVisitorId(req),
    })
      .then(() => drainClickRetryQueue())
      .catch((error) => {
        console.error("[recruit-card] CTA write failed:", error instanceof Error ? error.message : error);
      })
  );

  return NextResponse.redirect(apply, 302);
}
