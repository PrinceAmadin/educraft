import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/PageHeader";
import { ResearchRequestsTable } from "@/components/operations/ResearchRequestsTable";
import { RerunRequestsBoard, type RerunRequestItem } from "@/components/research/RerunRequestsBoard";
import { listResearchRequests } from "@/lib/services/operations/research-requests";
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

/**
 * Every research run — pending approval, running, finished — with what it
 * found and what it cost. Requests made before the ledger existed (if any
 * are still waiting) show underneath so nothing is lost.
 */
export default async function ResearchApprovalsPage() {
  const [requests, rerun] = await Promise.all([listResearchRequests(), listRerunRequests()]);
  const linked = new Set(requests.map((r) => r.rerunRequestId).filter((x): x is string => x != null));
  const legacyPending = rerun.pending.filter((r) => !linked.has(r.id));
  const pending = requests.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-7">
      <PageHeader
        title="Research approvals"
        description={`Every research run spends Claude credits. A project's first run and ${FREE_RERUNS} re-run are free; after that a worker asks, and an approval covers one run within ${APPROVAL_WINDOW_HOURS} hours. ${pending} waiting for you.`}
      />
      <ResearchRequestsTable requests={requests} />
      {legacyPending.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-foreground">Older requests</h2>
          <RerunRequestsBoard pending={legacyPending.map(toItem)} recent={[]} />
        </section>
      ) : null}
    </div>
  );
}
