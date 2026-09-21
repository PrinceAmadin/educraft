import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/PageHeader";
import { BroadcastAction } from "@/components/ambassadors/BroadcastAction";
import { AmbassadorTabs } from "@/components/ambassadors/AmbassadorTabs";
import { RosterManageTable } from "@/components/ambassadors/RosterManageTable";
import { AddSlotButton } from "@/components/ambassadors/SlotDialog";
import { db } from "@/lib/db";
import { listRoster } from "@/lib/services/ambassador-roster";

export const metadata: Metadata = { title: "Manage ambassador slots" };
export const dynamic = "force-dynamic";

export default async function ManageAmbassadorsPage() {
  const [general, core, sub, pendingApplications] = await Promise.all([
    listRoster("GENERAL"),
    listRoster("CORE"),
    listRoster("SUB"),
    db.ambassadorApplication.count({ where: { status: "PENDING" } }),
  ]);
  const coreOptions = core.map((c) => ({ code: c.code, name: c.name }));

  return (
    <div className="space-y-10">
      <div className="space-y-7">
        <PageHeader
          title="Ambassadors"
          description="Edit, add or empty slots. Changes are live on every tab and on the shared links straight away. There is no separate deploy step."
          actions={
          <>
            <AddSlotButton kind="GENERAL" label="Add ambassador" />
            <BroadcastAction />
          </>
        }
        />
        <AmbassadorTabs active="manage" pendingApplications={pendingApplications} />
      </div>

      <section className="space-y-3" aria-label="Manage slots">
        <h2 className="meta-label">Ambassador slots · {general.length}</h2>
        <RosterManageTable rows={general} kind="GENERAL" cores={coreOptions} searchable />
      </section>

      <section className="space-y-3" aria-label="Manage core ambassadors">
        <div className="flex items-center justify-between gap-3">
          <h2 className="meta-label">Core ambassadors (ECCA)</h2>
          <AddSlotButton kind="CORE" label="Add core" />
        </div>
        <RosterManageTable rows={core} kind="CORE" cores={coreOptions} showLink />
      </section>

      <section className="space-y-3" aria-label="Manage sub ambassadors">
        <div className="flex items-center justify-between gap-3">
          <h2 className="meta-label">Sub ambassadors (ECSA)</h2>
          <AddSlotButton kind="SUB" cores={coreOptions} label="Add sub" />
        </div>
        <RosterManageTable rows={sub} kind="SUB" cores={coreOptions} showLink />
      </section>
    </div>
  );
}
