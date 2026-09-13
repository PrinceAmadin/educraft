import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { AmbassadorPanel } from "@/components/ambassador-panel/AmbassadorPanel";
import { PageHeader } from "@/components/shared/PageHeader";
import { overview } from "@/lib/ambassador-panel/actions";
import { emailConfigured } from "@/lib/ambassador-panel/email";
import { redisConfigured } from "@/lib/ambassador-panel/redis";
import { SEED_ROSTER } from "@/lib/ambassador-panel/seed-roster";
import type { PanelOverview } from "@/lib/ambassador-panel/types";

export const metadata: Metadata = { title: "Ambassador panel" };
export const dynamic = "force-dynamic";

export default async function AmbassadorPanelPage() {
  const session = await auth();

  let initial: PanelOverview;
  let loadError: string | null = null;
  try {
    initial = await overview();
  } catch (error) {
    // Redis configured but unreachable — show the seed roster and say why.
    loadError = error instanceof Error ? `Could not reach the panel's Redis store: ${error.message}` : "Could not reach Redis.";
    initial = {
      status: { redis: false, email: emailConfigured() },
      roster: structuredClone(SEED_ROSTER),
      stats: {},
      pending: [],
      applications: [],
      payments: [],
    };
  }
  // A configured-but-failing store should read as read-only, not as "not set up".
  if (loadError && redisConfigured()) initial.status.redis = false;

  return (
    <div className="space-y-8">
      <PageHeader
        back={{ href: "/admin/ambassadors", label: "All ambassadors" }}
        title="Ambassador panel"
        description="Referral links, click tracking, applications and payment records from the original ambassador programme."
      />
      <AmbassadorPanel initial={initial} canDelete={session?.user?.role === "SUPER_ADMIN"} loadError={loadError} />
    </div>
  );
}
