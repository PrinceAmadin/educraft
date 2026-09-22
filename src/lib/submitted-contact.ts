/**
 * The personal and academic details typed on ONE order, kept on the project
 * (`additionalData.submittedContact`).
 *
 * Since Sept 2026 a person has one Client record (one ECC ID): a returning
 * client's new order joins it, and the public form never overwrites what is on
 * record. What they typed this time is kept here instead, so admins and the
 * worker still see the department, level or school the order is really for
 * (someone may order for a friend, or have moved up a level) and an admin can
 * correct the client record by hand.
 *
 * Pure: no database access.
 */
export interface SubmittedContact {
  fullName: string;
  phone: string;
  email: string | null;
  universityId: string;
  faculty: string;
  department: string;
  level: string;
}

/** The snapshot stored on a project, or null when there is none (or it is malformed). */
export function readSubmittedContact(additionalData: unknown): SubmittedContact | null {
  if (!additionalData || typeof additionalData !== "object" || Array.isArray(additionalData)) return null;
  const raw = (additionalData as Record<string, unknown>).submittedContact;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" ? x : "");
  if (!str(v.fullName) && !str(v.department)) return null;
  return {
    fullName: str(v.fullName),
    phone: str(v.phone),
    email: typeof v.email === "string" ? v.email : null,
    universityId: str(v.universityId),
    faculty: str(v.faculty),
    department: str(v.department),
    level: str(v.level),
  };
}

export interface ContactDifference {
  field: keyof SubmittedContact;
  label: string;
  onOrder: string;
  onRecord: string;
}

const LABELS: Record<Exclude<keyof SubmittedContact, "universityId">, string> = {
  fullName: "Name",
  phone: "Phone",
  email: "Email",
  faculty: "Faculty",
  department: "Department",
  level: "Level",
};

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * Where the order's details differ from the client record. University is
 * compared by id; pass both names so the row reads naturally.
 */
export function contactDifferences(
  onOrder: SubmittedContact,
  onRecord: Omit<SubmittedContact, "email"> & { email: string | null },
  universityNames: { onOrder: string; onRecord: string }
): ContactDifference[] {
  const diffs: ContactDifference[] = [];
  for (const field of Object.keys(LABELS) as (keyof typeof LABELS)[]) {
    if (!onOrder[field] || same(onOrder[field], onRecord[field])) continue;
    diffs.push({ field, label: LABELS[field], onOrder: onOrder[field] ?? "", onRecord: onRecord[field] ?? "" });
  }
  if (onOrder.universityId && onOrder.universityId !== onRecord.universityId) {
    diffs.push({ field: "universityId", label: "University", onOrder: universityNames.onOrder, onRecord: universityNames.onRecord });
  }
  return diffs;
}
