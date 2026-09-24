import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { canVerifyPayments } from "@/lib/rbac";
import { getProjectDetail } from "@/lib/services/projects";
import { listAllocatableAmbassadors } from "@/lib/services/ambassador-commission";
import { ProjectDetailHeader } from "@/components/projects/ProjectDetailHeader";
import { ProjectActions } from "@/components/projects/ProjectActions";
import { allowedTransitions, toCandidate } from "@/lib/pipeline";
import { ProjectTabs, type ProjectTab } from "@/components/projects/ProjectTabs";
import { RequirementsTab } from "@/components/projects/tabs/RequirementsTab";
import { TimelineTab } from "@/components/projects/tabs/TimelineTab";
import { FinancialsTab } from "@/components/projects/tabs/FinancialsTab";
import { FilesTab } from "@/components/projects/tabs/FilesTab";
import { NotesTab } from "@/components/projects/tabs/NotesTab";
import { ClientMessagesTab } from "@/components/projects/tabs/ClientMessagesTab";
import { DocumentsTab } from "@/components/projects/tabs/DocumentsTab";
import { OpsOverview } from "@/components/operations/OpsOverview";
import { CooActions, type TransitionOption } from "@/components/operations/CooActions";
import { NotesTimeline } from "@/components/operations/NotesTimeline";
import { SupervisorCorrectionsPanel } from "@/components/operations/SupervisorCorrectionsPanel";
import { listDeliverablesForAdmin } from "@/lib/services/deliverables";
import { getResearchSummary } from "@/lib/services/research-summary";
import { getProjectOps } from "@/lib/services/operations/project-ops";
import { getExpectedHours } from "@/lib/services/operations/pipeline";
import { firstName } from "@/lib/utils";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const project = await getProjectDetail(params.id);
  return { title: project ? project.projectId : "Project not found" };
}

function isoDay(d: Date | null): string | null {
  if (!d) return null;
  // The internal deadline is saved as the end of a Lagos day; show that day.
  const lagos = new Date(d.getTime() + 60 * 60_000);
  return lagos.toISOString().slice(0, 10);
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const session = await auth();
  const [project, ambassadors] = await Promise.all([
    getProjectDetail(params.id),
    listAllocatableAmbassadors(),
  ]);
  if (!project) notFound();
  const [researchSummary, unreadFromClient, deliverables, ops, expected] = await Promise.all([
    getResearchSummary(project.id),
    db.projectMessage.count({ where: { projectId: project.id, authorSide: "CLIENT", readAt: null } }),
    listDeliverablesForAdmin(project.id),
    getProjectOps(project.id),
    getExpectedHours(),
  ]);
  const toReview = deliverables.filter((d) => !d.archived && d.versions.some((v) => v.status === "SUBMITTED")).length;
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";

  const candidate = toCandidate(project);
  const transitions: TransitionOption[] = allowedTransitions(candidate).map((r) => ({
    to: r.to,
    label: r.action,
    blocked: r.guard?.(candidate) ?? null,
    requiresNote: Boolean(r.requiresNote),
  }));

  const tabs: ProjectTab[] = [
    { id: "requirements", label: "Requirements", content: <RequirementsTab project={project} /> },
    { id: "timeline", label: "Timeline", content: <TimelineTab project={project} /> },
    {
      id: "financials",
      label: "Financials",
      content: <FinancialsTab
          project={project}
          ambassadors={ambassadors}
          canProBono={isSuperAdmin}
          canVerify={canVerifyPayments(session?.user?.role)}
        />,
    },
    {
      id: "documents",
      label: toReview > 0 ? `Documents · ${toReview}` : "Documents",
      content: <DocumentsTab project={project} deliverables={deliverables} isSuperAdmin={isSuperAdmin} />,
    },
    { id: "files", label: "Files", content: <FilesTab project={project} /> },
    {
      id: "messages",
      label: unreadFromClient > 0 ? `Messages · ${unreadFromClient}` : "Messages",
      content: <ClientMessagesTab project={project} researchSummary={researchSummary} />,
    },
    {
      id: "notes",
      label: "Notes",
      content: (
        <NotesTab
          projectId={project.projectId}
          initialNotes={project.internalNotes}
          qaNotes={project.qaNotes}
        />
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <ProjectDetailHeader project={project} />

      <ProjectActions
        project={{ code: project.projectId, candidate }}
      />

      <SupervisorCorrectionsPanel
        code={project.projectId}
        rounds={ops.rounds}
        inCorrections={project.status === "SUPERVISOR_CORRECTIONS"}
        hasWorker={Boolean(project.worker?.userId)}
      />

      <OpsOverview
        project={project}
        ops={ops}
        expected={expected}
        actions={
          <CooActions
            code={project.projectId}
            status={project.status}
            transitions={transitions}
            isSuperAdmin={isSuperAdmin}
            hasWorker={Boolean(project.worker)}
            atRisk={project.atRisk}
            atRiskNote={project.atRiskNote}
            internalDeadline={isoDay(project.internalDeadline)}
            seniorReviewRequestedAt={project.seniorReviewRequestedAt?.toISOString() ?? null}
            seniorReviewNote={project.seniorReviewNote}
            parentCode={ops.parent?.projectId ?? null}
            clientFirstName={firstName(project.client.fullName)}
          />
        }
        timeline={<NotesTimeline code={project.projectId} entries={ops.timeline} />}
      />

      {/* The tabs sit on the page — the tab track is the only line. */}
      <ProjectTabs tabs={tabs} initial={searchParams.tab} />
    </div>
  );
}
