import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getProjectDetail } from "@/lib/services/projects";
import { PageHeader } from "@/components/shared/PageHeader";
import { IntakeEditForm, type IntakeEditValues } from "@/components/projects/IntakeEditForm";
import { fieldsForTemplate } from "@/lib/intake-fields";
import { resolveTemplate } from "@/lib/intake-templates";

export const metadata: Metadata = { title: "Edit intake details" };
export const dynamic = "force-dynamic";

const s = (v: unknown) => (v == null ? "" : String(v));

export default async function EditIntakePage({ params }: { params: { id: string } }) {
  const project = await getProjectDetail(params.id);
  if (!project) notFound();

  const template = resolveTemplate(project.service.intakeFormTemplate);
  const fields = fieldsForTemplate(template);
  const extra = (project.additionalData ?? {}) as Record<string, unknown>;
  const ded = (project.dedicationDetails ?? {}) as { details?: string | null };
  const ack = (project.acknowledgmentDetails ?? {}) as { details?: string | null };

  const clientValues: Record<string, string> = {
    fullName: project.client.fullName,
    phone: project.client.phone,
    email: project.client.email ?? "",
    universityId: project.client.universityId,
    faculty: project.client.faculty,
    department: project.client.department,
    level: project.client.level,
  };

  const projectValues: Record<string, string> = {
    projectTitle: s(project.projectTitle),
    matricNumber: s(project.matricNumber),
    supervisorName: s(project.supervisorName),
    otherSupervisors: s(project.otherSupervisors),
    hodName: s(project.hodName),
    projectPartners: s(project.projectPartners),
    projectType: project.projectType === "NOT_APPLICABLE" ? "" : s(project.projectType),
    chapterCount: s(project.chapterCount),
    referencingStyle: s(project.referencingStyle),
    dataRequirements: s(project.dataRequirements),
    minimumPages: s(project.minimumPages),
    clientDeadline: project.clientDeadline ? project.clientDeadline.toISOString().slice(0, 10) : "",
    departmentOutline: s(project.departmentOutline),
    specialInstructions: s(project.specialInstructions),
    dedicationType: s(project.dedicationType),
    dedicationDetails: s(ded.details),
    acknowledgmentDetails: s(ack.details),
  };

  const additionalValues: Record<string, string | string[]> = {};
  for (const f of fields.filter((f) => f.target === "additional")) {
    const v = extra[f.key];
    additionalValues[f.key] = f.kind === "tags" ? (Array.isArray(v) ? v.map(String) : []) : s(v);
  }

  const rows = (key: string, cols: string[]) =>
    (Array.isArray(extra[key]) ? (extra[key] as Record<string, unknown>[]) : []).map((r) =>
      Object.fromEntries(cols.map((c) => [c, s(r?.[c])]))
    );

  const initial: IntakeEditValues = {
    client: clientValues,
    project: projectValues,
    additional: additionalValues,
    education: rows("education", ["degree", "school", "year", "cgpa"]),
    experience: rows("experience", ["title", "company", "dates", "description"]),
  };

  const [universities, otherProjects] = await Promise.all([
    db.university.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, abbreviation: true } }),
    db.project.count({ where: { clientId: project.clientId, NOT: { id: project.id } } }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        back={{ href: `/admin/projects/${project.projectId}?tab=requirements`, label: project.projectId }}
        title="Edit intake details"
        description="Correct what the client typed on the form. Every change is logged on the timeline, and an assigned worker is told. Passwords and payment details are not editable here."
      />
      <IntakeEditForm
        projectCode={project.projectId}
        fields={fields}
        hasCvLists={template === "career_cv"}
        initial={initial}
        universities={universities}
        sharedClientProjects={otherProjects}
      />
    </div>
  );
}
