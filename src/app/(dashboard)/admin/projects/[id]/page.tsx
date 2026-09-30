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
import { ensureChapterDrafts } from "@/lib/services/chapter-review";
import { approvedVersion } from "@/lib/chapter-review";
import { getResearchSummary } from "@/lib/services/research-summary";
import { getProjectOps } from "@/lib/services/operations/project-ops";
import { getExpectedHours } from "@/lib/services/operations/pipeline";
import { firstName } from "@/lib/utils";
import { db } from "@/lib/db";
import { ModeCard } from "@/components/projects/mode/ModeCard";
import { DataPauseReviewCard } from "@/components/worker/DataPauseReviewCard";
import { getAdminPauses } from "@/lib/services/data-pause";
import { SecondaryDataCard } from "@/components/projects/mode/SecondaryDataCard";
import { secondaryDataStatus } from "@/lib/services/secondary-data";
import { GenerationDashboard } from "@/components/generation/GenerationDashboard";
import { QualityGatePanel } from "@/components/generation/QualityGatePanel";
import { PreliminaryPagesCard } from "@/components/generation/PreliminaryPagesCard";
import { getPreliminaryPagesView } from "@/lib/services/preliminary-pages";
import { ResearchRerunControl } from "@/components/projects/ResearchRerunControl";
import { generationDashboardFor } from "@/lib/services/generation-dashboard";
import { getModeCard, isReportTemplate } from "@/lib/services/research-mode";

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
  const reportProject = isReportTemplate(project.service.intakeFormTemplate);
  // Chapter review: a finished chapter with no AI draft gets one now (normally made when it was written).
  if (reportProject) await ensureChapterDrafts(project.id).catch((error) => console.warn("[chapter review] drafts not checked", error instanceof Error ? error.message : error));
  const [researchSummary, unreadFromClient, deliverables, ops, expected, modeCard, pauses, secondary, generation, prelims] = await Promise.all([
    getResearchSummary(project.id),
    db.projectMessage.count({ where: { projectId: project.id, authorSide: "CLIENT", readAt: null } }),
    listDeliverablesForAdmin(project.id),
    getProjectOps(project.id),
    getExpectedHours(),
    // D3: the research-mode card the COO approves, for written reports only.
    reportProject ? getModeCard(project.id).then((r) => r.card) : Promise.resolve(null),
    // D4: the report's data pauses (the client's files, checked by the specialist or here).
    reportProject ? getAdminPauses(project.id) : Promise.resolve([]),
    // D5: a Mode 5 project's dataset (World Bank + CBN), fetched once Chapter 3 is written.
    reportProject ? secondaryDataStatus(project.id, project.projectId) : Promise.resolve(null),
    // D6: the live report dashboard (chapters, pause, queue).
    reportProject ? generationDashboardFor(project.id) : Promise.resolve(null),
    // D7b: the acknowledgement, abstract and abbreviations the page writer adds to a full report.
    reportProject ? getPreliminaryPagesView(project.id) : Promise.resolve(null),
  ]);
  const adminBase = `/api/admin/projects/${encodeURIComponent(project.projectId)}`;
  const dataToCheck = pauses.some((p) => p.status === "SUBMITTED");
  // An AI draft waits for the specialist, not for the COO: only people's uploads count here.
  const toReview = deliverables.filter((d) => !d.archived && d.versions.some((v) => v.status === "SUBMITTED" && !v.aiDraft)).length;
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";
  // Chapter review: which chapters are approved (the Report tab's working copy), and which a person has
  // reviewed (the quality panel returns those to the specialist instead of re-generating them).
  const reviewChapters = deliverables.filter((d) => d.review && !d.archived && d.chapter != null);
  const reportReview = reviewChapters.length
    ? { audience: "staff" as const, notApproved: reviewChapters.filter((d) => !approvedVersion(d.versions)).map((d) => d.chapter as number) }
    : null;
  const chapterReviewMap = reviewChapters.length
    ? Object.fromEntries(reviewChapters.map((d) => [d.chapter as number, { deliverableId: d.id, reviewed: d.versions.some((v) => !v.aiDraft) }]))
    : null;

  const candidate = toCandidate(project);
  const transitions: TransitionOption[] = allowedTransitions(candidate).map((r) => ({
    to: r.to,
    label: r.action,
    blocked: r.guard?.(candidate) ?? null,
    requiresNote: Boolean(r.requiresNote),
  }));

  const tabs: ProjectTab[] = [
    { id: "requirements", label: "Requirements", content: <RequirementsTab project={project} /> },
    ...(modeCard
      ? [
          {
            id: "report",
            label: dataToCheck ? "Report · data to check" : modeCard.status === "APPROVED" || modeCard.generationStarted ? "Report" : "Report · mode",
            content: (
              <div className="space-y-8">
                {generation && (modeCard.status === "APPROVED" || modeCard.generationStarted) ? (
                  <GenerationDashboard
                    initial={generation}
                    renderedAt={new Date().toISOString()}
                    streamUrl={`${adminBase}/generation/progress`}
                    uploadEndpoint={`${adminBase}/upload`}
                    actionEndpoint={`${adminBase}/data-pause`}
                    downloadUrl={`${adminBase}/documents/docx`}
                    // D9: Start, Stop, Continue and a chapter's restart, for the founder and the COO.
                    controls={{ generation: `${adminBase}/generation`, dataPause: `${adminBase}/data-pause` }}
                    review={reportReview}
                  />
                ) : null}
                {generation && (modeCard.status === "APPROVED" || modeCard.generationStarted) ? (
                  // The key is the last quality run: a check the orchestrator ran by itself reloads the panel.
                  <QualityGatePanel
                    key={generation.run?.gateRanAt ?? "not-run"}
                    endpoint={`${adminBase}/quality`}
                    canRegenerate
                    chapterReview={chapterReviewMap}
                    changesBase={`${adminBase}/deliverables`}
                  />
                ) : null}
                {prelims?.applies && generation && (modeCard.status === "APPROVED" || modeCard.generationStarted) ? (
                  <PreliminaryPagesCard
                    key={`${prelims.pages?.updatedAt ?? "none"}-${generation.run?.gateRanAt ?? "not-run"}`}
                    initial={prelims}
                    endpoint={`${adminBase}/generation/preliminary-pages`}
                    editIntakeHref={`/admin/projects/${encodeURIComponent(project.projectId)}/edit-intake`}
                  />
                ) : null}
                {pauses.map((p) => (
                  <DataPauseReviewCard
                    key={`${p.id}-${p.status}-${p.round}-${p.files.length}`}
                    initial={p}
                    actionEndpoint={`/api/admin/projects/${encodeURIComponent(project.projectId)}/data-pause`}
                    uploadEndpoint={`/api/admin/projects/${encodeURIComponent(project.projectId)}/upload`}
                    isAdmin
                  />
                ))}
                {secondary?.eligible ? (
                  <SecondaryDataCard
                    initial={secondary}
                    endpoint={`/api/admin/projects/${encodeURIComponent(project.projectId)}/generation/fetch-secondary-data`}
                    uploadEndpoint={`/api/admin/projects/${encodeURIComponent(project.projectId)}/generation/upload-secondary-data`}
                    filesBase={`/api/admin/projects/${encodeURIComponent(project.projectId)}`}
                  />
                ) : null}
                {generation?.run ? (
                  // D9: the research can be run again until the first chapter exists; then the button stays, greyed out.
                  <ResearchRerunControl
                    endpoint={`${adminBase}/research/rerun`}
                    references={generation.run.references}
                    research={generation.run.research}
                    generationStarted={generation.run.generationStarted}
                  />
                ) : null}
                <ModeCard initial={modeCard} />
              </div>
            ),
          },
        ]
      : []),
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
