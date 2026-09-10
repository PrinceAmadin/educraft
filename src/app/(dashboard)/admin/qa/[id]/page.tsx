import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LuDownload, LuFile } from "react-icons/lu";
import { getQaReview } from "@/lib/services/qa";
import { QaReviewPanel } from "@/components/qa/QaReviewPanel";
import { QaStartReview } from "@/components/qa/QaStartReview";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { deadlineInfo, formatDate } from "@/lib/utils";
import type { ProjectStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const data = await getQaReview(params.id);
  return { title: data ? `QA · ${data.project.projectId}` : "QA review" };
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

export default async function QaReviewPage({ params }: { params: { id: string } }) {
  const data = await getQaReview(params.id);
  if (!data) notFound();

  const { project, checklist, checked } = data;
  const deadline = project.internalDeadline ?? project.clientDeadline;
  const info = deadlineInfo(deadline);
  const workerFiles = project.files.filter((f) => f.category === "from_worker");
  const otherFiles = project.files.filter((f) => f.category !== "from_worker");

  const inReview = project.status === "IN_QA_REVIEW";
  const submitted = project.status === "SUBMITTED";

  return (
    <div className="space-y-5">
      <Link
        href="/admin/qa"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        QA queue
      </Link>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-xl font-bold tracking-tight text-foreground">
                {project.projectId}
              </h1>
              <StatusBadge status={project.status as ProjectStatus} />
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
          </div>
          <Link
            href={`/admin/projects/${project.projectId}`}
            className="text-xs font-medium text-primary hover:underline"
          >
            Full project →
          </Link>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-4">
          <Field label="Worker">{project.worker?.fullName ?? "—"}</Field>
          <Field label="Department">{project.client.department}</Field>
          <Field label="Referencing">
            {project.referencingStyle
              ? REFERENCING_LABELS[project.referencingStyle] ?? project.referencingStyle
              : "—"}
          </Field>
          <Field label="Deadline">
            <span className={info.urgency === "overdue" ? "text-danger" : undefined}>
              {formatDate(deadline)}
              {info.daysLeft !== null ? ` · ${info.label}` : ""}
            </span>
          </Field>
          {project.chapterCount != null ? (
            <Field label="Chapters">{String(project.chapterCount)}</Field>
          ) : null}
          {project.minimumPages ? <Field label="Min pages">{project.minimumPages}</Field> : null}
        </dl>

        {project.specialInstructions ? (
          <div className="mt-3 border-t border-border pt-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Special instructions
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
              {project.specialInstructions}
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* Left: files */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <FileGroup title="Submitted work" files={workerFiles} emptyHint="No worker files uploaded." />
          {otherFiles.length > 0 ? <FileGroup title="Other files" files={otherFiles} /> : null}
        </aside>

        {/* Right: review */}
        <section>
          {inReview ? (
            <QaReviewPanel
              projectCode={project.projectId}
              def={checklist}
              initialChecked={checked}
              initialNotes={project.qaNotes}
            />
          ) : submitted ? (
            <QaStartReview projectCode={project.projectId} />
          ) : (
            <div className="rounded-xl border border-border bg-card p-4 text-sm">
              <p className="font-medium text-foreground">
                This project is {project.status.replace(/_/g, " ").toLowerCase()} — not in QA.
              </p>
              <Link
                href={`/admin/projects/${project.projectId}`}
                className="mt-2 inline-flex text-sm font-medium text-primary hover:underline"
              >
                Open the project
              </Link>
            </div>
          )}
        </section>
      </div>
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
  emptyHint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {files.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{emptyHint ?? "None."}</p>
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
