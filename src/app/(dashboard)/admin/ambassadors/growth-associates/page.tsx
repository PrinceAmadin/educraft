import type { Metadata } from "next";
import { LuCalendarClock, LuNetwork, LuSprout } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared/PageHeader";
import { AmbassadorTabs } from "@/components/ambassadors/AmbassadorTabs";
import { LaunchNoticeButton } from "@/components/ambassadors/platform/LaunchNoticeButton";
import { COMMISSION_RATES } from "@/lib/finance/commission-config";
import { wantsLaunchNotice } from "@/lib/services/ambassador-platform/growth-associates";

export const metadata: Metadata = { title: "Growth Associates" };
export const dynamic = "force-dynamic";

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

/** Phase 3 Section 7 — Growth Associates: a Year 2 feature, explained now (the schema is already in place). */
export default async function GrowthAssociatesPage() {
  const [session, pendingApplications] = await Promise.all([auth(), db.ambassadorApplication.count({ where: { status: "PENDING" } })]);
  const subscribed = session?.user?.id ? await wantsLaunchNotice(session.user.id) : false;
  const retained = 1 - COMMISSION_RATES.workers - COMMISSION_RATES.ambassador - COMMISSION_RATES.hog - COMMISSION_RATES.coo;
  const ga = COMMISSION_RATES.growthAssociate;

  return (
    <div className="space-y-7">
      <PageHeader title="Growth Associates" description="Coming in Year 2: a level above Core ambassadors, so the network can grow past what one Head of Growth can manage person by person." />
      <AmbassadorTabs active="growth-associates" pendingApplications={pendingApplications} />

      <section aria-labelledby="ga-what" className="rounded-2xl bg-zone p-5 sm:p-7">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          <LuSprout className="size-3.5" aria-hidden />
          Coming in Year 2 · not active yet
        </p>
        <h2 id="ga-what" className="mt-3 text-lg font-semibold text-foreground">
          What is a Growth Associate?
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Growth Associates are a new level above Core ambassadors, recruited directly by the Head of Growth. They manage clusters of ambassadors and earn from their cluster&apos;s performance.
        </p>

        <h3 className="mt-6 text-sm font-semibold text-foreground">How it works</h3>
        <ol className="mt-2 max-w-3xl list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>The Head of Growth recruits a Growth Associate from a top-performing ambassador.</li>
          <li>The Growth Associate is assigned a cluster of ambassadors to manage.</li>
          <li>
            The Growth Associate earns {pct(ga)} from EduCraft&apos;s retained share, not from the ambassadors&apos; commission: EduCraft keeps {pct(retained - ga)} instead of {pct(retained)}.
          </li>
          <li>The Growth Associate motivates, supports and grows their cluster.</li>
        </ol>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-foreground">
          <LuNetwork className="mr-1.5 inline size-4 align-text-bottom text-primary" aria-hidden />
          This is how EduCraft scales to 500+ ambassadors without the Head of Growth managing every ambassador directly.
        </p>

        <h3 className="mt-6 text-sm font-semibold text-foreground">When Year 2 launches, this page will show</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Growth Associate profiles and their clusters</li>
          <li>Cluster performance metrics</li>
          <li>Growth Associate commission tracking</li>
        </ul>

        <p className="mt-6 inline-flex items-center gap-2 text-sm text-foreground">
          <LuCalendarClock className="size-4 text-muted-foreground" aria-hidden />
          Expected activation: <span className="font-medium">January 2027</span>
        </p>
        <div className="mt-4">
          <LaunchNoticeButton initial={subscribed} />
        </div>
      </section>
    </div>
  );
}
