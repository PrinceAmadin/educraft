import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAssignmentContext } from "@/lib/services/workers";
import { AssignWorkerScreen } from "@/components/projects/AssignWorkerScreen";
import { STATUS_META } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { deadlineInfo, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  return { title: `Assign worker · ${params.id}` };
}

const PROJECT_TYPE_LABELS: Record<string, string> = {
  THEORETICAL: "Theoretical",
  PRACTICAL: "Practical",
  DESIGN_BASED: "Design-based",
  SURVEY_BASED: "Survey-based",
  NOT_APPLICABLE: "Not applicable",
};

export default async function AssignWorkerPage({ params }: { params: { id: string } }) {
  const ctx = await getAssignmentContext(params.id);
  if (!ctx) notFound();

  const { project, recommendations } = ctx;
  const deadline = project.internalDeadline ?? project.clientDeadline;
  const info = deadlineInfo(deadline);
  const wrongStatus = project.status !== "REQUIREMENTS_CONFIRMED";

  return (
    <div className="space-y-5">
      <Link
        href={`/admin/projects/${project.projectId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to {project.projectId}
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Assign worker
        </h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">{project.projectId}</p>
      </div>

      {wrongStatus ? (
        <div className="rounded-xl border border-gold/30 bg-gold/10 p-4 text-sm">
          <p className="font-medium text-foreground">
            This project is {STATUS_META[project.status as keyof typeof STATUS_META]?.label ?? project.status}.
          </p>
          <p className="mt-1 text-muted-foreground">
            Workers are assigned once requirements are confirmed. Assigning now will be rejected.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href={`/admin/projects/${project.projectId}`}>Open project</Link>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* Left: project summary */}
        <aside className="space-y-3 rounded-xl border border-border bg-card p-4 lg:sticky lg:top-20 lg:self-start">
          <h2 className="text-sm font-semibold text-foreground">Project summary</h2>
          <dl className="space-y-2.5 text-sm">
            <Row label="Topic" value={project.projectTitle ?? "Untitled"} />
            <Row label="Service" value={project.serviceName} />
            <Row label="Department" value={project.department} />
            <Row label="Type" value={PROJECT_TYPE_LABELS[project.projectType] ?? project.projectType} />
            {project.chapterCount != null ? (
              <Row label="Chapters" value={String(project.chapterCount)} />
            ) : null}
            <Row
              label="Deadline"
              value={
                deadline
                  ? `${formatDate(deadline)}${info.daysLeft != null ? ` · ${info.label}` : ""}`
                  : "Not set"
              }
            />
          </dl>
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">
            Workers whose specialty matches the department are shown first, then by lightest load,
            rating, and on-time rate.
          </p>
        </aside>

        {/* Right: recommendations */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Recommended workers
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              {recommendations.length}
            </span>
          </h2>
          <AssignWorkerScreen projectCode={project.projectId} recommendations={recommendations} />
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}
