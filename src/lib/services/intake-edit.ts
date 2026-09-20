import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { FIELD_LABELS } from "@/lib/intake-fields";
import { notifyUsers } from "@/lib/services/notifications";
import { ClientEmailError, updateClientEmail } from "@/lib/services/clients";
import type { IntakeEditInput } from "@/lib/validations/intake-edit";

export class IntakeEditError extends Error {}

type Json = Record<string, unknown>;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Blank strings, empty lists and nulls all mean "nothing there". */
function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

/** Drop rows the admin left completely blank in a CV list. */
function cleanRows(rows: Record<string, string | undefined>[]): Record<string, string | undefined>[] {
  return rows.filter((r) => Object.values(r).some((v) => v && v.trim() !== ""));
}

/**
 * Admin correction of what the client typed on the intake form. Applies only
 * what changed, writes it to the timeline (who, and which fields), and tells
 * an assigned worker so they don't keep working from the old brief. Clients
 * have no route to this; it is admin-only at the API.
 */
export async function updateProjectIntake(
  idOrCode: string,
  input: IntakeEditInput,
  changedById: string
): Promise<{ projectId: string; changed: string[] }> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    include: {
      client: true,
      worker: { select: { userId: true } },
    },
  });
  if (!project) throw new IntakeEditError("Project not found");

  const changed: string[] = [];
  const mark = (key: string) => changed.push(FIELD_LABELS[key] ?? key);

  // ── Client ──
  const clientData: Prisma.ClientUncheckedUpdateInput = {};
  const c = input.client;
  let emailChange: string | null = null;
  if (c.fullName !== undefined && c.fullName !== project.client.fullName) {
    clientData.fullName = c.fullName;
    mark("fullName");
  }
  if (c.phone !== undefined && c.phone !== project.client.phone) {
    clientData.phone = c.phone;
    mark("phone");
  }
  if (c.email !== undefined && c.email !== (project.client.email ?? "")) {
    if (c.email === "") throw new IntakeEditError("A client needs an email, their sign-in code goes there");
    emailChange = c.email;
    mark("email");
  }
  if (c.universityId !== undefined && c.universityId !== project.client.universityId) {
    const uni = await db.university.findUnique({ where: { id: c.universityId }, select: { id: true } });
    if (!uni) throw new IntakeEditError("That university does not exist");
    clientData.universityId = c.universityId;
    mark("universityId");
  }
  if (c.faculty !== undefined && c.faculty !== project.client.faculty) {
    clientData.faculty = c.faculty;
    mark("faculty");
  }
  if (c.department !== undefined && c.department !== project.client.department) {
    clientData.department = c.department;
    mark("department");
  }
  if (c.level !== undefined && c.level !== project.client.level) {
    clientData.level = c.level;
    mark("level");
  }

  // ── Project columns ──
  const projectData: Prisma.ProjectUncheckedUpdateInput = {};
  const p = input.project;

  const setText = (
    key:
      | "projectTitle"
      | "matricNumber"
      | "supervisorName"
      | "otherSupervisors"
      | "hodName"
      | "projectPartners"
      | "minimumPages"
      | "departmentOutline"
      | "specialInstructions"
  ) => {
    const next = p[key];
    if (next === undefined) return;
    const current = project[key] ?? "";
    if (next === current) return;
    projectData[key] = next === "" ? null : next;
    mark(key);
  };
  (
    [
      "projectTitle",
      "matricNumber",
      "supervisorName",
      "otherSupervisors",
      "hodName",
      "projectPartners",
      "minimumPages",
      "departmentOutline",
      "specialInstructions",
    ] as const
  ).forEach(setText);

  if (p.projectType !== undefined) {
    const next = p.projectType === "" ? "NOT_APPLICABLE" : p.projectType;
    if (next !== project.projectType) {
      projectData.projectType = next;
      mark("projectType");
    }
  }
  if (p.referencingStyle !== undefined) {
    const next = p.referencingStyle === "" ? null : p.referencingStyle;
    if (next !== project.referencingStyle) {
      projectData.referencingStyle = next;
      mark("referencingStyle");
    }
  }
  if (p.dataRequirements !== undefined) {
    const next = p.dataRequirements === "" ? null : p.dataRequirements;
    if (next !== project.dataRequirements) {
      projectData.dataRequirements = next;
      mark("dataRequirements");
    }
  }
  if (p.chapterCount !== undefined && p.chapterCount !== project.chapterCount) {
    projectData.chapterCount = p.chapterCount;
    mark("chapterCount");
  }

  if (p.clientDeadline !== undefined) {
    const next = p.clientDeadline === "" ? null : new Date(p.clientDeadline);
    const currentDay = project.clientDeadline?.toISOString().slice(0, 10) ?? "";
    if (p.clientDeadline !== currentDay) {
      projectData.clientDeadline = next;
      // The working deadline follows the client's, keeping any time already
      // paused while waiting on them.
      if (next) {
        projectData.internalDeadline = new Date(next.getTime() + project.deadlinePausedDays * 86_400_000);
      }
      mark("clientDeadline");
    }
  }

  // Dedication and acknowledgement live in JSON columns.
  if (p.dedicationType !== undefined || p.dedicationDetails !== undefined) {
    const current = (project.dedicationDetails ?? {}) as { type?: string | null; details?: string | null };
    const type = p.dedicationType ?? project.dedicationType ?? "";
    const details = p.dedicationDetails ?? current.details ?? "";
    if (p.dedicationType !== undefined && p.dedicationType !== (project.dedicationType ?? "")) {
      projectData.dedicationType = p.dedicationType === "" ? null : p.dedicationType;
      mark("dedicationType");
    }
    if (p.dedicationDetails !== undefined && p.dedicationDetails !== (current.details ?? "")) {
      mark("dedicationDetails");
    }
    if (changed.includes(FIELD_LABELS.dedicationType) || changed.includes(FIELD_LABELS.dedicationDetails)) {
      projectData.dedicationDetails =
        type || details ? { type: type || null, details: details || null } : Prisma.JsonNull;
    }
  }
  if (p.acknowledgmentDetails !== undefined) {
    const current = ((project.acknowledgmentDetails ?? {}) as { details?: string | null }).details ?? "";
    if (p.acknowledgmentDetails !== current) {
      projectData.acknowledgmentDetails = p.acknowledgmentDetails
        ? { details: p.acknowledgmentDetails }
        : Prisma.JsonNull;
      mark("acknowledgmentDetails");
    }
  }

  // ── additionalData (service-specific answers) ──
  const additional: Json = { ...((project.additionalData ?? {}) as Json) };
  let additionalTouched = false;
  for (const [key, raw] of Object.entries(input.additional)) {
    let value: unknown = raw;
    if (key === "education" || key === "experience") {
      value = cleanRows(raw as Record<string, string | undefined>[]);
    }
    const before = additional[key];
    if (isEmpty(value)) {
      if (!isEmpty(before)) {
        delete additional[key];
        additionalTouched = true;
        mark(key);
      }
    } else if (!same(before, value)) {
      additional[key] = value;
      additionalTouched = true;
      mark(key);
    }
  }
  if (additionalTouched) {
    projectData.additionalData =
      Object.keys(additional).length > 0 ? (additional as Prisma.InputJsonValue) : Prisma.JsonNull;
  }

  if (changed.length === 0) return { projectId: project.projectId, changed };

  // The email goes through its own guarded routine (it refuses a team
  // account's address and unlinks the old sign-in), so run it first: if it
  // refuses, nothing else has been written.
  if (emailChange) {
    try {
      await updateClientEmail(project.client.id, emailChange);
    } catch (error) {
      if (error instanceof ClientEmailError) throw new IntakeEditError(error.message);
      throw error;
    }
  }

  await db.$transaction([
    ...(Object.keys(clientData).length > 0
      ? [db.client.update({ where: { id: project.client.id }, data: clientData })]
      : []),
    ...(Object.keys(projectData).length > 0
      ? [db.project.update({ where: { id: project.id }, data: projectData })]
      : []),
    db.projectStatusLog.create({
      data: {
        projectId: project.id,
        fromStatus: project.status,
        toStatus: project.status,
        changedById,
        notes: `Intake details edited by admin: ${changed.join(", ")}`,
      },
    }),
  ]);

  // Someone already working from the old brief needs to know it moved.
  const inFlight = ["ASSIGNED", "IN_PROGRESS", "AWAITING_CLIENT_INPUT", "REVISION_NEEDED", "SUBMITTED"];
  if (project.worker?.userId && inFlight.includes(project.status)) {
    await notifyUsers([project.worker.userId], {
      title: "Project details updated",
      message: `${project.projectId}: the client's details changed (${changed.join(", ")}). Check the brief.`,
      type: "warning",
      link: "/worker/projects",
    });
  }

  return { projectId: project.projectId, changed };
}
