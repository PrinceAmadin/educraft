import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssignmentContext } from "@/lib/services/workers";
import { AssignWorkerScreen } from "@/components/projects/AssignWorkerScreen";
import { PageHeader } from "@/components/shared/PageHeader";
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
    <div className="space-y-8">
      <PageHeader
        back={{ href: `/admin/projects/${project.projectId}`, label: `Back to ${project.projectId}` }}
        title="Assign worker"
        description={<span className="font-mono">{project.projectId}</span>}
      />

      {wrongStatus ? (
        <div className="rounded-2xl bg-gold/10 p-5 text-sm">
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

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        {/* Left: project summary, as a quiet zone */}
        <aside className="space-y-4 rounded-2xl bg-zone p-5 lg:sticky lg:top-20 lg:self-start">
          <h2 className="text-[15px] font-semibold text-foreground">Project summary</h2>
          <dl className="space-y-3 text-sm">
            <Row label="Topic" value={project.projectTitle ?? "Untitled"} />
            <Row label="Service" value={project.serviceName} />
            <Row label="Department" value={project.department} />
            <Row label="Type" value={PROJECT_TYPE_LABELS[project.projectType] ?? project.projectType} />
            {project.chapterCount != null ? <Row label="Chapters" value={String(project.chapterCount)} /> : null}
            <Row
              label="Deadline"
              value={
                deadline ? `${formatDate(deadline)}${info.daysLeft != null ? ` · ${info.label}` : ""}` : "Not set"
              }
            />
          </dl>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Workers whose specialty matches the department are shown first, then by lightest load,
            rating, and on-time rate.
          </p>
        </aside>

        {/* Right: recommendations */}
        <section>
          <h2 className="mb-4 text-[15px] font-semibold text-foreground">
            Recommended workers
            <span className="ml-2 font-mono text-xs text-muted-foreground">{recommendations.length}</span>
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
      <dt className="meta-label">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}
