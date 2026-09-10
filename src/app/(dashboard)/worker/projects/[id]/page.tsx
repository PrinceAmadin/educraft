import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LuFile, LuDownload, LuTriangleAlert } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getWorkerAssignment, getWorkerByUserId } from "@/lib/services/worker-portal";
import { WorkerAssignmentActions } from "@/components/worker/WorkerAssignmentActions";
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

export default async function WorkerAssignmentPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const worker = session?.user ? await getWorkerByUserId(session.user.id) : null;
  if (!worker) {
    return <EmptyState icon={LuInbox} title="No worker profile" description="Contact an admin." />;
  }

  const project = await getWorkerAssignment(worker.id, params.id);
  if (!project) notFound();

  const deadline = project.internalDeadline ?? project.clientDeadline;
  const info = deadlineInfo(deadline);
  const clientFiles = project.files.filter((f) => f.category === "from_client");
  const mySubmissions = project.files.filter((f) => f.category === "from_worker");
  const showRevisionFeedback = project.status === "REVISION_NEEDED" && project.qaNotes;

  return (
    <div className="space-y-5">
      <Link
        href="/worker/projects"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        My projects
      </Link>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-xl font-bold tracking-tight text-foreground">
            {project.projectId}
          </h1>
          <StatusBadge status={project.status} />
          {project.revisionCount > 0 ? (
            <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold">
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
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <LuTriangleAlert className="size-4" aria-hidden />
            QA feedback — revision needed
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{project.qaNotes}</p>
        </div>
      ) : null}

      <WorkerAssignmentActions projectCode={project.projectId} status={project.status} />

      {project.departmentOutline || project.specialInstructions ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Requirements</h2>
          {project.departmentOutline ? (
            <div className="mt-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Department outline
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {project.departmentOutline}
              </p>
            </div>
          ) : null}
          {project.specialInstructions ? (
            <div className="mt-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Special instructions
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {project.specialInstructions}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FileGroup title="From client" files={clientFiles} emptyHint="No files from the client." />
        <FileGroup title="My submissions" files={mySubmissions} emptyHint="You haven't submitted anything yet." />
      </div>

      {project.qaNotes && !showRevisionFeedback ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">QA feedback</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{project.qaNotes}</p>
        </section>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  );
}

function FileGroup({
  title,
  files,
  emptyHint,
}: {
  title: string;
  files: { id: string; fileName: string; fileUrl: string; createdAt: Date }[];
  emptyHint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {files.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{emptyHint}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {files.map((f) => (
            <li key={f.id}>
              <a
                href={f.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md p-1.5 text-sm text-foreground transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
              >
                <LuFile className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
                <LuDownload className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </a>
              <p className="pl-8 text-[11px] text-subtle">{formatDate(f.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
