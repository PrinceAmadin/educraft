import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/PageHeader";
import { BroadcastAction } from "@/components/ambassadors/BroadcastAction";
import { AmbassadorTabs } from "@/components/ambassadors/AmbassadorTabs";
import { RosterManageTable } from "@/components/ambassadors/RosterManageTable";
import { AddSlotButton } from "@/components/ambassadors/SlotDialog";
import { db } from "@/lib/db";
import { listRoster } from "@/lib/services/ambassador-roster";

export const metadata: Metadata = { title: "Core ambassadors" };
export const dynamic = "force-dynamic";

export default async function CoreAmbassadorsPage() {
  const [rows, pendingApplications] = await Promise.all([
    listRoster("CORE"),
    db.ambassadorApplication.count({ where: { status: "PENDING" } }),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Ambassadors"
        description="Core ambassadors (ECCA) are senior partners who recruit Sub ambassadors. Share a recruit link with someone you want under them."
        actions={
          <>
            <AddSlotButton kind="CORE" label="Add core ambassador" />
            <BroadcastAction />
          </>
        }
      />
      <AmbassadorTabs active="core" pendingApplications={pendingApplications} />

      <RosterManageTable rows={rows} kind="CORE" cores={[]} showLink />
      <p className="text-xs text-muted-foreground">
        Percentages are the rates recorded in the original panel (base %, plus 3% per Sub). Commission on a
        job is still set per job in Tracking.
      </p>
    </div>
  );
}
