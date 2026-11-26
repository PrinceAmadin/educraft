import type { Metadata } from "next";
import { Section } from "@/components/primitives/Section";
import { JoinHero } from "@/components/join/JoinHero";
import { WhatYouDo, TheMoney, WhyUs, Receipts, Questions } from "@/components/join/JoinSections";
import { JoinClose } from "@/components/join/JoinClose";
import { StickyApply } from "@/components/join/StickyApply";
import { JOIN_TEXT } from "@/lib/ambassadors/ambassador-copy";
import { publicCommissionLadder } from "@/lib/services/cashflow";
import { openGeneralSlots } from "@/lib/services/ambassador-roster";
import { getAmbassadorRecruitmentVideo } from "@/lib/services/settings";
import { db } from "@/lib/db";

/**
 * The public ambassador recruitment page — what a printed card's QR code
 * opens, and where the site's own "Ambassadors" link goes.
 *
 * Section rhythm, mirroring the home page so the two read as one site:
 *
 *   01  HERO        A · the position, the promise, the button, the video's edge
 *   02  ROLE        B · three things, that is the job
 *   03  MONEY       A · the live tier ladder in naira
 *   04  WHY US      B · a company, not a side hustle
 *   05  RECEIPTS    A · what is already running
 *   06  QUESTIONS   B · the three a final year student actually has
 *   07  CLOSE       ink · one statement, one button
 *
 * Two rules this page lives under.
 *
 * It is PUBLIC — a client or a competitor can scan a card — so the external
 * rule holds without exception: EduCraft is a team of specialists who
 * research, write and review academic work. How the work is produced is not on
 * this page, in any wording. `check:client-copy` scans these files.
 *
 * And every figure is a live read: the tier rates and the deposit share from
 * the published cashflow structure, the reference price from the service
 * catalogue, the open positions from the roster, the counts from the
 * ambassador table. Nothing is typed in, so a republished structure or a
 * repriced service moves the page instead of contradicting it.
 *
 * Every read is individually fault-tolerant. A card is printed paper: if this
 * page 500s, three hundred of them are dead, so a section that cannot get its
 * data renders without it rather than taking the page down.
 */

export const metadata: Metadata = {
  title: JOIN_TEXT.meta.title,
  description: JOIN_TEXT.meta.description,
  alternates: { canonical: "/join" },
};

/** Live counts and open positions change, and a stale open-slot number would be a lie. */
export const revalidate = 300;

const ok = <T,>(promise: Promise<T>, label: string): Promise<T | null> =>
  promise.catch((error) => {
    console.error(`[join] ${label} read failed:`, error instanceof Error ? error.message : error);
    return null;
  });

/** Below this, the number reads as "nobody is doing this" and is better left out. */
const AMBASSADOR_FLOOR = 10;

export default async function JoinPage() {
  const [ladder, positions, video, ambassadors, campuses] = await Promise.all([
    ok(publicCommissionLadder(), "commission ladder"),
    ok(openGeneralSlots(), "open positions"),
    ok(getAmbassadorRecruitmentVideo(), "recruitment video"),
    ok(db.ambassador.count({ where: { status: "Active" } }), "ambassador count"),
    ok(
      db.ambassador
        .groupBy({ by: ["universityId"], where: { status: "Active" } })
        .then((rows) => rows.length),
      "campus count"
    ),
  ]);

  // Every button goes through /join/go, which records the one number the page
  // cannot otherwise know — who read the pitch and went on to the form — then
  // sends them to /apply.
  const ctaHref = "/join/go";

  return (
    <>
      <JoinHero
        ctaHref={ctaHref}
        topRate={ladder?.topRate ?? null}
        positions={positions}
        video={video?.videoUrl ? { src: video.videoUrl, poster: video.posterUrl } : null}
      />

      {/* The seam into the first B ground, as on the home page. */}
      <Section ground="into-b" rhythm="tight" className="py-0" />

      <WhatYouDo />
      <TheMoney ladder={ladder} />
      <WhyUs />
      <Receipts
        ambassadors={ambassadors !== null && ambassadors >= AMBASSADOR_FLOOR ? ambassadors : null}
        campuses={campuses !== null && campuses > 0 ? campuses : null}
        dashboard={null}
      />
      <Questions />
      <JoinClose ctaHref={ctaHref} />

      <StickyApply
        href={ctaHref}
        label={JOIN_TEXT.hero.cta}
        note={positions && positions.open > 0 ? JOIN_TEXT.hero.openPositions(positions.open, positions.total) : undefined}
      />
    </>
  );
}
