import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared/PageHeader";
import { AmbassadorTabs } from "@/components/ambassadors/AmbassadorTabs";
import { BroadcastAction } from "@/components/ambassadors/BroadcastAction";
import { HogBudgetPanel } from "@/components/finance/HogBudgetPanel";
import { SponsorshipForm } from "@/components/finance/SponsorshipForm";
import { getHogBudget } from "@/lib/services/expenses";
import { currentMonthKey } from "@/lib/services/finance/surplus";

export const metadata: Metadata = { title: "Sponsorship budget" };
export const dynamic = "force-dynamic";

/** The HOG's corner of Finance: the quarter's sponsorship budget from the Growth Fund, and logging what was spent. */
export default async function SponsorshipPage() {
  const [session, budget, pendingApplications] = await Promise.all([
    auth(),
    getHogBudget(currentMonthKey()),
    db.ambassadorApplication.count({ where: { status: "PENDING" } }),
  ]);
  const isFounder = session?.user?.role === "SUPER_ADMIN";

  return (
    <div className="space-y-7">
      <PageHeader
        title="Ambassadors"
        description="Student-union sponsorships and school entry, paid from the Growth Fund against a quarterly budget the founder sets. Up to ₦50,000 is logged at once; above that it waits for the founder."
        actions={<BroadcastAction />}
      />
      <AmbassadorTabs active="sponsorship" pendingApplications={pendingApplications} />

      <HogBudgetPanel budget={budget} title="Sponsorship budget" />

      <section aria-labelledby="log-sponsorship" className="space-y-3">
        <h2 id="log-sponsorship" className="text-[15px] font-semibold text-foreground">
          Log a sponsorship
        </h2>
        <SponsorshipForm isFounder={isFounder} />
      </section>
    </div>
  );
}
