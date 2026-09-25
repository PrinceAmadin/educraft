import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/PageHeader";
import { QaQueueOps } from "@/components/operations/QaQueueOps";
import { listQaQueueOps } from "@/lib/services/operations/qa-reviews";

export const metadata: Metadata = { title: "QA queue" };
export const dynamic = "force-dynamic";

export default async function QaQueuePage() {
  const [session, data] = await Promise.all([auth(), listQaQueueOps()]);
  const waiting = data.rows.length;

  return (
    <div className="space-y-7">
      <PageHeader
        title="QA review queue"
        description={`${waiting} project${waiting === 1 ? "" : "s"} waiting. Assign a reviewer, review directly, or monitor a review in progress; anything over 24 hours is flagged.`}
      />
      <QaQueueOps data={data} currentUserId={session?.user?.id ?? ""} />
    </div>
  );
}
