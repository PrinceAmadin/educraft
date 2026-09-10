import type { Metadata } from "next";
import { LuClipboardCheck } from "react-icons/lu";
import { EmptyState } from "@/components/shared/EmptyState";
import { QaQueueTable } from "@/components/qa/QaQueueTable";
import { listQaQueue } from "@/lib/services/qa";

export const metadata: Metadata = { title: "QA queue" };
export const dynamic = "force-dynamic";

export default async function QaQueuePage() {
  const rows = await listQaQueue();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">QA queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Submitted work waiting for review, most urgent first.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={LuClipboardCheck}
          title="Nothing in the QA queue"
          description="Projects appear here when a worker submits their completed work."
        />
      ) : (
        <QaQueueTable rows={rows} />
      )}
    </div>
  );
}
