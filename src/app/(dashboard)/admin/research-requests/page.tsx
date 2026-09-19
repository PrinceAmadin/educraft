import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/PageHeader";
import { RerunRequestsBoard, type RerunRequestItem } from "@/components/research/RerunRequestsBoard";
import { listRerunRequests, FREE_RERUNS, APPROVAL_WINDOW_HOURS, type RerunRequestRow } from "@/lib/services/research-runs";

export const metadata: Metadata = { title: "Research approvals" };
export const dynamic = "force-dynamic";

// Dates cross the server/client boundary as ISO strings.
const toItem = (r: RerunRequestRow): RerunRequestItem => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
  reviewedAt: r.reviewedAt?.toISOString() ?? null,
  approvedUntil: r.approvedUntil?.toISOString() ?? null,
});

export default async function ResearchApprovalsPage() {
  const { pending, recent } = await listRerunRequests();

  return (
    <div className="space-y-7">
      <PageHeader
        title="Research approvals"
        description={`Every research run spends AI credits. Each project gets its first run and ${FREE_RERUNS} re-run free; after that a worker has to ask. An approval lasts ${APPROVAL_WINDOW_HOURS} hours and covers one run.`}
      />
      <RerunRequestsBoard pending={pending.map(toItem)} recent={recent.map(toItem)} />
    </div>
  );
}
