import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
  const [project, ambassadors] = await Promise.all([
    getProjectDetail(params.id),
    listAllocatableAmbassadors(),
  ]);
  if (!project) notFound();

  const tabs: ProjectTab[] = [
    { id: "requirements", label: "Requirements", content: <RequirementsTab project={project} /> },
    { id: "timeline", label: "Timeline", content: <TimelineTab project={project} /> },
    {
      id: "financials",
      label: "Financials",
      content: <FinancialsTab project={project} ambassadors={ambassadors} />,
    },
    { id: "files", label: "Files", content: <FilesTab project={project} /> },
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
