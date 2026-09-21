import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/PageHeader";
import { BroadcastAction } from "@/components/ambassadors/BroadcastAction";
import { AmbassadorTabs } from "@/components/ambassadors/AmbassadorTabs";
import { RosterManageTable } from "@/components/ambassadors/RosterManageTable";
import { AddSlotButton } from "@/components/ambassadors/SlotDialog";
import { db } from "@/lib/db";
import { listRoster } from "@/lib/services/ambassador-roster";

export const metadata: Metadata = { title: "Sub ambassadors" };
export const dynamic = "force-dynamic";

export default async function SubAmbassadorsPage() {
  const [rows, cores, pendingApplications] = await Promise.all([
    listRoster("SUB"),
    listRoster("CORE"),
    db.ambassadorApplication.count({ where: { status: "PENDING" } }),
  ]);
  const coreOptions = cores.map((c) => ({ code: c.code, name: c.name }));

  return (
    <div className="space-y-7">
      <PageHeader
        title="Ambassadors"
        description="Sub ambassadors (ECSA) are recruited by a Core ambassador and share their own client link."
        actions={
          <>
            <AddSlotButton kind="SUB" cores={coreOptions} label="Add sub ambassador" />
            <BroadcastAction />
          </>
        }
      />
      <AmbassadorTabs active="sub" pendingApplications={pendingApplications} />

      <RosterManageTable rows={rows} kind="SUB" cores={coreOptions} showLink />
    </div>
  );
}
