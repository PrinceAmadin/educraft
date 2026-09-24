import type { Metadata } from "next";
import Link from "next/link";
import { LuArrowRight } from "react-icons/lu";
import { PageHeader } from "@/components/shared/PageHeader";
import { InProgressNotice } from "@/components/shared/InProgressNotice";

export const metadata: Metadata = { title: "Growth" };

/** The Head of Growth's home beyond the ambassador roster. Real page, Phase 3 content. */
export default function GrowthPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Growth"
        description="How EduCraft is reaching students: ambassador activation, school by school reach, campaigns and the targets behind the Head of Growth's bonuses."
      />

      <InProgressNotice
        phase="Phase 3 — Ambassador Platform"
        summary="This page becomes the growth dashboard."
        items={[
          "Ambassador activation rate each month, against the 30% target",
          "Every school with its active ambassadors and paying clients, and the ones approaching 10+",
          "Campaign tracking: what was sent, who clicked, who ordered",
          "Quarterly challenge progress per ambassador",
          "New-client target for the period and how far past it the team is",
          "The Head of Growth's bonus tracker, calculated from all of the above",
        ]}
      />

      <p className="text-sm text-muted-foreground">
        Until then, the roster, click tracking and applications live under{" "}
        <Link href="/admin/ambassadors" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
          Ambassadors
          <LuArrowRight className="size-3.5" aria-hidden />
        </Link>
        .
      </p>
    </div>
  );
}
