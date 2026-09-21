import Link from "next/link";
import { LuFileText, LuPencil } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { INTAKE_FIELDS } from "@/lib/intake-fields";
import { EmptyState } from "@/components/shared/EmptyState";
import { FileList } from "@/components/projects/tabs/FileList";
import { formatDate } from "@/lib/utils";
import type { ProjectDetail } from "@/lib/services/projects";

const REFERENCING_LABELS: Record<string, string> = {
  APA_7TH: "APA 7th",
  APA_6TH: "APA 6th",
  HARVARD: "Harvard",
  IEEE: "IEEE",
  CHICAGO: "Chicago",
  MLA: "MLA",
  CUSTOM: "Custom",
};

const PROJECT_TYPE_LABELS: Record<string, string> = {
  THEORETICAL: "Theoretical",
  PRACTICAL: "Practical",
  DESIGN_BASED: "Design-based",
  SURVEY_BASED: "Survey-based",
  NOT_APPLICABLE: "Not applicable",
};

const DATA_LABELS: Record<string, string> = {
  PRIMARY: "Primary data",
  SECONDARY: "Secondary data",
  BOTH: "Both",
  NONE: "None",
  NOT_SURE: "Not sure",
};

export function RequirementsTab({ project }: { project: ProjectDetail }) {
  const rows: { label: string; value: string | null }[] = [
    { label: "Project title", value: project.projectTitle },
    { label: "Matric number", value: project.matricNumber },
    { label: "Supervisor", value: project.supervisorName },
    { label: "Other supervisors", value: project.otherSupervisors },
    { label: "HOD", value: project.hodName },
    {
      label: "Referencing style",
      value: project.referencingStyle ? REFERENCING_LABELS[project.referencingStyle] ?? project.referencingStyle : null,
    },
    { label: "Minimum pages", value: project.minimumPages },
    { label: "Chapter count", value: project.chapterCount != null ? String(project.chapterCount) : null },
    {
      label: "Project type",
      value: project.projectType ? PROJECT_TYPE_LABELS[project.projectType] ?? project.projectType : null,
    },
    {
      label: "Data requirements",
      value: project.dataRequirements ? DATA_LABELS[project.dataRequirements] ?? project.dataRequirements : null,
    },
    { label: "Project partners", value: project.projectPartners },
    { label: "Client deadline", value: project.clientDeadline ? formatDate(project.clientDeadline) : null },
  ];

  const present = rows.filter((r) => r.value && r.value.trim().length > 0);

  // Client details and the service-specific answers the intake form collected.
  const clientRows: { label: string; value: string | null }[] = [
    { label: "Name", value: project.client.fullName },
    { label: "Phone", value: project.client.phone },
    { label: "Email", value: project.client.email },
    { label: "University", value: project.client.university?.name ?? null },
    { label: "Faculty", value: project.client.faculty },
    { label: "Department", value: project.client.department },
    { label: "Level", value: project.client.level },
  ].filter((r) => r.value && r.value.trim().length > 0);

  const extra = (project.additionalData ?? {}) as Record<string, unknown>;
  const serviceRows: { label: string; value: string }[] = [];
  for (const f of INTAKE_FIELDS.filter((f) => f.target === "additional")) {
    const v = extra[f.key];
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    serviceRows.push({ label: f.label, value: Array.isArray(v) ? v.join(", ") : String(v) });
  }
  const educationCount = Array.isArray(extra.education) ? extra.education.length : 0;
  const experienceCount = Array.isArray(extra.experience) ? extra.experience.length : 0;
  if (educationCount) serviceRows.push({ label: "Education entries", value: String(educationCount) });
  if (experienceCount) serviceRows.push({ label: "Experience entries", value: String(experienceCount) });
  const clientFiles = project.files.filter((f) => f.category === "from_client" || f.category === "department_outline");

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          What the client submitted. Only admins can change it.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href={`/admin/projects/${project.projectId}/edit-intake`}>
            <LuPencil className="size-4" aria-hidden />
            Edit intake details
          </Link>
        </Button>
      </div>

      <section>
        <h3 className="text-[15px] font-semibold text-foreground">Client</h3>
        <dl className="mt-4 grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
          {clientRows.map((row) => (
            <div key={row.label}>
              <dt className="meta-label">{row.label}</dt>
              <dd className="mt-1 break-words text-[15px] text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3 className="text-[15px] font-semibold text-foreground">Project details</h3>
        {present.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No requirement details captured yet.</p>
        ) : (
          <dl className="mt-4 grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
            {present.map((row) => (
              <div key={row.label}>
                <dt className="meta-label">{row.label}</dt>
                <dd className="mt-1 text-[15px] text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {serviceRows.length > 0 ? (
        <section>
          <h3 className="text-[15px] font-semibold text-foreground">Service details</h3>
          <dl className="mt-4 grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
            {serviceRows.map((row) => (
              <div key={row.label}>
                <dt className="meta-label">{row.label}</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-[15px] text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {project.specialInstructions ? (
        <section>
          <h3 className="text-[15px] font-semibold text-foreground">Special instructions</h3>
          <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-zone p-4 text-sm leading-relaxed text-foreground">
            {project.specialInstructions}
          </p>
        </section>
      ) : null}

      <section>
        <h3 className="text-[15px] font-semibold text-foreground">Files from client</h3>
        <div className="mt-3">
          {clientFiles.length === 0 ? (
            <EmptyState
              icon={LuFileText}
              title="No client files"
              description="Documents the client uploads with their brief appear here."
              className="py-8"
            />
          ) : (
            <FileList files={clientFiles} />
          )}
        </div>
      </section>
    </div>
  );
}
