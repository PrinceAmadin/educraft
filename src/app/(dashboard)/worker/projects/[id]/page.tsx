import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LuFile, LuDownload, LuTriangleAlert } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getWorkerAssignment, getWorkerByUserId } from "@/lib/services/worker-portal";
import { canSubmitDeliverable, listDeliverablesForWorker, whySubmitClosed } from "@/lib/services/deliverables";
import { OrderDetailsNotice } from "@/components/projects/OrderDetailsNotice";
import { fileHref } from "@/lib/files/links";
import { WorkerAssignmentActions } from "@/components/worker/WorkerAssignmentActions";
import { ResearchPanel } from "@/components/worker/ResearchPanel";
import { WorkerDeliverablesPanel } from "@/components/worker/WorkerDeliverablesPanel";
import { ProjectTabs } from "@/components/projects/ProjectTabs";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { LuInbox } from "react-icons/lu";
import { deadlineInfo, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  return { title: `Assignment · ${params.id}` };
}

const REFERENCING_LABELS: Record<string, string> = {
  APA_7TH: "APA 7th",
  APA_6TH: "APA 6th",
  HARVARD: "Harvard",
  IEEE: "IEEE",
  CHICAGO: "Chicago",
  MLA: "MLA",
  CUSTOM: "Custom",
};

export default async function WorkerAssignmentPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const session = await auth();
  const worker = session?.user ? await getWorkerByUserId(session.user.id) : null;
  if (!worker) {
    return <EmptyState icon={LuInbox} title="No worker profile" description="Contact an admin." />;
  }

  const project = await getWorkerAssignment(worker.id, params.id);
  if (!project) notFound();

  const deadline = project.internalDeadline ?? project.clientDeadline;
  const info = deadlineInfo(deadline);
  const clientFiles = project.files.filter((f) => f.category === "from_client" || f.category === "department_outline");
  // Links pasted before uploads existed; new work lives in Documents.
  const earlierLinks = project.files.filter((f) => f.category === "from_worker" && !f.deliverableId);
  const showRevisionFeedback = project.status === "REVISION_NEEDED" && project.qaNotes;
  const routeBase = `/api/worker/projects/${encodeURIComponent(project.projectId)}`;

  const deliverables = (await listDeliverablesForWorker(project.id)).map((d) => {
    const open = canSubmitDeliverable(d.kind, project.status);
    return {
      id: d.id,
      title: d.title,
      kind: d.kind,
      status: d.status,
      versions: d.versions,
      canSubmit: open,
      closedReason: open ? null : whySubmitClosed(d.kind, project.status),
      goesToQa: d.kind === "FINAL" && (project.status === "IN_PROGRESS" || project.status === "REVISION_NEEDED"),
    };
  });

  return (
    <div className="space-y-5">
      <Link
        href="/worker/projects"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        My projects
      </Link>

      <div className="surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-xl font-bold tracking-tight text-foreground">
            {project.projectId}
          </h1>
          <StatusBadge status={project.status} />
          {project.revisionCount > 0 ? (
            <span className="rounded-full bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold">
              Revision #{project.revisionCount}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-foreground">
          {project.service.serviceName}
          {project.projectTitle ? (
            <span className="text-muted-foreground"> · {project.projectTitle}</span>
          ) : null}
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
          <Field label="Department">
            {project.client.department}
            {project.client.university?.abbreviation
              ? ` · ${project.client.university.abbreviation}`
              : ""}
          </Field>
          <Field label="Deadline">
            <span className={info.urgency === "overdue" ? "text-danger font-medium" : undefined}>
              {formatDate(deadline)}
              {info.daysLeft !== null ? ` · ${info.label}` : ""}
            </span>
            {project.deadlinePausedAt ? (
              <span className="block text-xs text-gold">Paused — awaiting client input</span>
            ) : null}
          </Field>
          {project.referencingStyle ? (
            <Field label="Referencing">
              {REFERENCING_LABELS[project.referencingStyle] ?? project.referencingStyle}
            </Field>
          ) : null}
          {project.chapterCount != null ? (
            <Field label="Chapters">{String(project.chapterCount)}</Field>
          ) : null}
          {project.minimumPages ? <Field label="Min pages">{project.minimumPages}</Field> : null}
          {project.supervisorName ? (
            <Field label="Supervisor">{project.supervisorName}</Field>
          ) : null}
        </dl>
      </div>

      {showRevisionFeedback ? (
        <div className="rounded-2xl bg-danger/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <LuTriangleAlert className="size-4" aria-hidden />
            QA feedback — revision needed
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{project.qaNotes}</p>
        </div>
      ) : null}

      <WorkerAssignmentActions projectCode={project.projectId} status={project.status} />

      <ProjectTabs
        initial={searchParams.tab}
        tabs={[
          {
            id: "brief",
            label: "Brief",
            content: (
              <div className="space-y-5">
                <OrderDetailsNotice
                  audience="worker"
                  additionalData={project.additionalData}
                  client={{ ...project.client, phone: "", email: null }}
                  universityName={project.client.university?.name ?? ""}
                />
                {project.departmentOutline || project.specialInstructions ? (
                  <section className="surface p-4">
                    <h2 className="text-sm font-semibold text-foreground">Requirements</h2>
                    {project.departmentOutline ? (
                      <div className="mt-2">
                        <p className="meta-label">Department outline</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{project.departmentOutline}</p>
                      </div>
                    ) : null}
                    {project.specialInstructions ? (
                      <div className="mt-3">
                        <p className="meta-label">Special instructions</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{project.specialInstructions}</p>
                      </div>
                    ) : null}
                  </section>
                ) : null}
                <FileGroup title="From client" files={clientFiles} routeBase={routeBase} emptyHint="No files from the client." />
                {project.qaNotes && !showRevisionFeedback ? (
                  <section className="surface p-4">
                    <h2 className="text-sm font-semibold text-foreground">QA feedback</h2>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{project.qaNotes}</p>
                  </section>
                ) : null}
              </div>
            ),
          },
          { id: "research", label: "Research", content: <ResearchPanel projectCode={project.projectId} /> },
          {
            id: "documents",
            label: "Documents",
            content: (
              <div className="space-y-8">
                <WorkerDeliverablesPanel projectCode={project.projectId} deliverables={deliverables} />
                {earlierLinks.length > 0 ? (
                  <FileGroup title="Earlier submissions (links)" files={earlierLinks} routeBase={routeBase} emptyHint="" />
                ) : null}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="meta-label">
        {label}
      </dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  );
}

function FileGroup({
  title,
  files,
  routeBase,
  emptyHint,
}: {
  title: string;
  files: { id: string; fileName: string; fileUrl: string; storage: string; createdAt: Date }[];
  routeBase: string;
  emptyHint: string;
}) {
  return (
    <div className="surface p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {files.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{emptyHint}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {files.map((f) => {
            const href = fileHref(f, routeBase);
            return (
              <li key={f.id}>
                {href ? (
                  <a
                    href={href}
                    target={f.storage === "PRIVATE_BLOB" ? undefined : "_blank"}
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md p-1.5 text-sm text-foreground transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
                  >
                    <LuFile className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
                    <LuDownload className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </a>
                ) : (
                  <p className="flex items-center gap-2 p-1.5 text-sm text-foreground">
                    <LuFile className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
                    <span className="text-xs text-danger">Unsafe link hidden</span>
                  </p>
                )}
                <p className="pl-8 text-[11px] text-subtle">{formatDate(f.createdAt)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
