import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LuArrowLeft, LuDownload, LuFile } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getQaReviewDetail } from "@/lib/services/operations/qa-reviews";
import { QaDecisionPanel } from "@/components/operations/QaDecisionPanel";
import { QaStartReview } from "@/components/qa/QaStartReview";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { cn, deadlineInfo, formatDate, formatDateTime } from "@/lib/utils";
import { fileHref } from "@/lib/files/links";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const data = await getQaReviewDetail(params.id);
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

/**
 * The inline QA review: the automated gate results the project arrived
 * with, the files to download, the two checklists and the decision.
 */
export default async function QaReviewPage({ params }: { params: { id: string } }) {
  const [data, session] = await Promise.all([getQaReviewDetail(params.id), auth()]);
  if (!data) notFound();

  const { project, checklist, checked, delivery, deliveryDone, deliveryTotal, submittedAt } = data;
  const review = project.qaReview;
  const deadline = project.internalDeadline ?? project.clientDeadline;
  const info = deadlineInfo(deadline);
  const workerFiles = project.files.filter((f) => f.category === "from_worker");
  const otherFiles = project.files.filter((f) => f.category !== "from_worker");
  const routeBase = `/api/admin/projects/${encodeURIComponent(project.projectId)}`;
  const inReview = project.status === "IN_QA_REVIEW";
  const submitted = project.status === "SUBMITTED";
  const reviewerLabel = review?.reviewerName ? (review.reviewerId === session?.user?.id ? "You" : review.reviewerName) : "Not yet assigned";
  const gatesRan = review != null && (review.formattingScore != null || review.structuralPass != null || review.referenceVerPass != null || review.voiceCheckPass != null);

  return (
    <div className="space-y-6">
      <Link href="/admin/qa" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline">
        <LuArrowLeft className="size-4" aria-hidden />
        QA queue
      </Link>

      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-xl font-bold tracking-tight text-foreground">{project.projectId}</h1>
              <StatusBadge status={project.status} />
              {project.revisionCount > 0 ? <span className="rounded-full bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold">Revision #{project.revisionCount}</span> : null}
              {review && review.round > 1 ? <span className="rounded-full bg-elevated px-2 py-0.5 text-xs font-medium text-muted-foreground">Review round {review.round}</span> : null}
            </div>
            <p className="mt-1 text-sm text-foreground">
              {project.client.fullName} · {project.client.department} · {project.service.serviceName}
              {project.projectTitle ? <span className="text-muted-foreground"> · {project.projectTitle}</span> : null}
            </p>
          </div>
          <Link href={`/admin/projects/${project.projectId}`} className="text-xs font-medium text-primary hover:underline">
            Full project →
          </Link>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl bg-zone p-4 text-sm sm:grid-cols-4">
          <Field label="Worker">{project.worker?.fullName ?? "—"}</Field>
          <Field label="Submitted">{submittedAt ? formatDateTime(submittedAt) : "—"}</Field>
          <Field label="Reviewer">
            {reviewerLabel}
            {review?.reviewerType === "WORKER" ? <span className="text-muted-foreground"> (junior)</span> : null}
          </Field>
          <Field label="Deadline">
            <span className={info.urgency === "overdue" ? "text-danger" : undefined}>
              {formatDate(deadline)}
              {info.daysLeft !== null ? ` · ${info.label}` : ""}
            </span>
          </Field>
          <Field label="Referencing">{project.referencingStyle ? REFERENCING_LABELS[project.referencingStyle] ?? project.referencingStyle : "—"}</Field>
          {project.chapterCount != null ? <Field label="Chapters">{String(project.chapterCount)}</Field> : null}
          {project.minimumPages ? <Field label="Min pages">{project.minimumPages}</Field> : null}
          <Field label="Delivery checks">
            <span className={cn("font-mono tabular-nums", deliveryDone === deliveryTotal ? "text-success" : "")}>
              {deliveryDone}/{deliveryTotal}
            </span>
          </Field>
        </dl>

        {project.specialInstructions ? (
          <div>
            <p className="meta-label">Special instructions</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{project.specialInstructions}</p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <section>
            <h2 className="text-sm font-semibold text-foreground">Automated quality gates</h2>
            {gatesRan && review ? (
              <ul className="mt-2 space-y-1 text-[13px]">
                <Gate label="Formatting check (Layer 3)" value={review.formattingScore != null ? `${review.formattingScore}%` : null} />
                <Gate label="Structural check (Layer 1)" value={review.structuralPass == null ? null : review.structuralPass ? "Pass" : "Fail"} />
                <Gate label="Reference verification (Tier 2)" value={review.referenceVerPass == null ? null : review.referenceVerPass ? "Pass" : "Fail"} />
                <Gate label="Voice check (Layer 2a)" value={review.voiceCheckPass == null ? null : review.voiceCheckPass ? "Pass" : "Fail"} />
                {review.tier3Triggered ? <li className="text-gold">Tier 3 reference check was triggered for this project.</li> : null}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] text-muted-foreground">
                Not run on this project{project.supervisorHighRisk ? " — the supervisor is marked high risk, so check the references with extra care" : ""}. The gates arrive with the report production system; the human checklist below is the standard.
              </p>
            )}
          </section>

          <FileGroup title="Download for review" files={workerFiles} routeBase={routeBase} emptyHint="No worker files uploaded." />
          {otherFiles.length > 0 ? <FileGroup title="Other files" files={otherFiles} routeBase={routeBase} /> : null}
        </aside>

        <section>
          {inReview ? (
            <QaDecisionPanel projectCode={project.projectId} def={checklist} initialChecked={checked} initialDelivery={delivery} initialNotes={project.qaNotes} />
          ) : submitted ? (
            <div className="space-y-4">
              <QaStartReview projectCode={project.projectId} />
              <p className="text-[13px] text-muted-foreground">
                {review?.reviewerName ? `Assigned to ${reviewerLabel}. ` : "Nobody has been assigned yet. "}
                To hand it to a junior reviewer instead, use Assign on the <Link href="/admin/qa" className="text-primary hover:underline">queue</Link>.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-zone p-4 text-sm">
              <p className="font-medium text-foreground">This project is {project.status.replace(/_/g, " ").toLowerCase()} — not in QA.</p>
              {review?.decision ? (
                <p className="mt-1 text-muted-foreground">
                  Last decision: {review.decision.replace(/_/g, " ").toLowerCase()}
                  {review.completedAt ? ` on ${formatDateTime(review.completedAt)}` : ""}
                  {review.reviewerName ? ` by ${review.reviewerName}` : ""}.
                </p>
              ) : null}
              <Link href={`/admin/projects/${project.projectId}`} className="mt-2 inline-flex text-sm font-medium text-primary hover:underline">
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
      <dt className="meta-label">{label}</dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  );
}

function Gate({ label, value }: { label: string; value: string | null }) {
  const ok = value != null && value !== "Fail";
  return (
    <li className="flex items-center gap-2">
      <span className={cn("size-1.5 rounded-full", value == null ? "bg-border" : ok ? "bg-success" : "bg-danger")} aria-hidden />
      <span className="text-foreground">{label}:</span>
      <span className={cn(value == null ? "text-muted-foreground" : ok ? "text-success" : "text-danger")}>{value ?? "not run"}</span>
    </li>
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
  emptyHint?: string;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {files.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{emptyHint ?? "None."}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {files.map((f) => (
            <li key={f.id}>
              {fileHref(f, routeBase) ? (
                <a
                  href={fileHref(f, routeBase)!}
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
          ))}
        </ul>
      )}
    </section>
  );
}
