import { LuFileText } from "react-icons/lu";
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
  const clientFiles = project.files.filter((f) => f.category === "from_client");

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-foreground">Project details</h3>
        {present.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No requirement details captured yet.
          </p>
        ) : (
          <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {present.map((row) => (
              <div key={row.label} className="border-b border-border pb-2">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {row.label}
                </dt>
                <dd className="mt-0.5 text-sm text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {project.specialInstructions ? (
        <section>
          <h3 className="text-sm font-semibold text-foreground">Special instructions</h3>
          <p className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-elevated p-3 text-sm text-foreground">
            {project.specialInstructions}
          </p>
        </section>
      ) : null}

      <section>
        <h3 className="text-sm font-semibold text-foreground">Files from client</h3>
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
