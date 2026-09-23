import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProjectDetail } from "@/lib/services/projects";
import { listAllocatableAmbassadors } from "@/lib/services/ambassador-commission";
import { ProjectDetailHeader } from "@/components/projects/ProjectDetailHeader";
import { ProjectActions } from "@/components/projects/ProjectActions";
import { toCandidate } from "@/lib/pipeline";
import { ProjectTabs, type ProjectTab } from "@/components/projects/ProjectTabs";
import { RequirementsTab } from "@/components/projects/tabs/RequirementsTab";
import { TimelineTab } from "@/components/projects/tabs/TimelineTab";
import { FinancialsTab } from "@/components/projects/tabs/FinancialsTab";
import { FilesTab } from "@/components/projects/tabs/FilesTab";
import { NotesTab } from "@/components/projects/tabs/NotesTab";
import { ClientMessagesTab } from "@/components/projects/tabs/ClientMessagesTab";
import { DocumentsTab } from "@/components/projects/tabs/DocumentsTab";
import { listDeliverablesForAdmin } from "@/lib/services/deliverables";
import { getResearchSummary } from "@/lib/services/research-summary";
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
  const [researchSummary, unreadFromClient, deliverables] = await Promise.all([
    getResearchSummary(project.id),
    db.projectMessage.count({ where: { projectId: project.id, authorSide: "CLIENT", readAt: null } }),
    listDeliverablesForAdmin(project.id),
  ]);
  const toReview = deliverables.filter((d) => !d.archived && d.versions.some((v) => v.status === "SUBMITTED")).length;
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";

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
        project={{ code: project.projectId, candidate: toCandidate(project) }}
      />

      {/* The tabs sit on the page — the tab track is the only line. */}
      <ProjectTabs tabs={tabs} initial={searchParams.tab} />
    </div>
  );
}
