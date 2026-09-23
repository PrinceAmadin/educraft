import { db } from "@/lib/db";
import type { ProjectDetail } from "@/lib/services/projects";
import type { DeliverableView } from "@/lib/services/deliverables";
import { clientProjectPath } from "@/lib/services/client-notify";
import { siteUrl } from "@/lib/site-url";
import { greetingName, toWaNumber } from "@/lib/whatsapp";
import { DeliverableReviewCard } from "@/components/projects/documents/DeliverableReviewCard";
import { AddDeliverableForm, ResearchShareControl } from "@/components/projects/documents/DocumentsControls";
import { formatDate } from "@/lib/utils";

const QA_PASSED = ["APPROVED", "BALANCE_VERIFIED", "DELIVERED", "SUPERVISOR_CORRECTIONS", "COMPLETED"];

function payState(p: ProjectDetail): string {
  if (p.isProBono) return "Pro bono: everything released opens for the client.";
  const down = p.downpaymentStatus === "Verified" ? "Downpayment paid" : "Downpayment not paid";
  const bal = p.balanceStatus === "Verified" ? "balance paid" : "balance not paid";
  return `${down}, ${bal}.`;
}

/**
 * What the client downloads, managed by EduCraft: each chapter/document with
 * the upload waiting for review, what's released, and when the client may
 * download it. Plus the research papers, shared in the client's dashboard
 * instead of a Drive link.
 */
export async function DocumentsTab({
  project,
  deliverables,
  isSuperAdmin,
}: {
  project: ProjectDetail;
  deliverables: DeliverableView[];
  isSuperAdmin: boolean;
}) {
  const job = await db.researchJob.findUnique({
    where: { projectId: project.id },
    select: {
      status: true,
      releasedToClientAt: true,
      references: { where: { status: "KEPT" }, select: { driveFileId: true } },
    },
  });
  const contact = {
    waNumber: toWaNumber(project.client.phone),
    fullName: project.client.fullName,
    clientId: project.client.clientId,
    documentsUrl: `${siteUrl()}${clientProjectPath(project.projectId, "documents")}`,
  };
  const canReleaseFinal = QA_PASSED.includes(project.status);
  const active = deliverables.filter((d) => !d.archived);
  const archived = deliverables.filter((d) => d.archived);
  const withPdf = job?.references.filter((r) => r.driveFileId && r.driveFileId !== "SKIPPED").length ?? 0;

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Chapters and documents</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            The worker uploads here and you release each one to the client or send it back with a note. A released
            item downloads once its payment is in. {payState(project)}
          </p>
        </div>
        <div className="divide-y divide-border/80">
          {active.map((d) => (
            <DeliverableReviewCard
              key={d.id}
              projectCode={project.projectId}
              deliverable={d}
              canReleaseFinal={canReleaseFinal}
              isSuperAdmin={isSuperAdmin}
              contact={contact}
            />
          ))}
        </div>
        <AddDeliverableForm projectCode={project.projectId} isSuperAdmin={isSuperAdmin} />
        {archived.length > 0 ? (
          <details className="group">
            <summary className="cursor-pointer text-[13px] font-medium text-muted-foreground hover:text-foreground">
              Archived ({archived.length})
            </summary>
            <div className="mt-2 divide-y divide-border/80">
              {archived.map((d) => (
                <DeliverableReviewCard
                  key={d.id}
                  projectCode={project.projectId}
                  deliverable={d}
                  canReleaseFinal={canReleaseFinal}
                  isSuperAdmin={isSuperAdmin}
                  contact={contact}
                />
              ))}
            </div>
          </details>
        ) : null}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Research papers</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            Shared papers show in the client&apos;s Documents tab: the free PDFs download there, paywalled ones link to
            their DOI, and the reference list comes as a Word file. The Drive folder stays private.
          </p>
        </div>
        {!job ? (
          <p className="text-sm text-muted-foreground">No research has been run for this project.</p>
        ) : job.status !== "PASSED" ? (
          <p className="text-sm text-muted-foreground">The research step hasn&apos;t finished yet.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              <span className="font-mono">{job.references.length}</span> papers,{" "}
              <span className="font-mono">{withPdf}</span> with a free PDF.{" "}
              {job.releasedToClientAt ? (
                <span className="text-success">Shared with the client on {formatDate(job.releasedToClientAt)}.</span>
              ) : (
                <span className="text-muted-foreground">Not shared with the client.</span>
              )}
            </p>
            <ResearchShareControl
              projectCode={project.projectId}
              shared={Boolean(job.releasedToClientAt)}
              clientFirstName={greetingName(project.client.fullName)}
            />
          </div>
        )}
      </section>
    </div>
  );
}
