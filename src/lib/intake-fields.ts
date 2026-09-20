import type { IntakeTemplate } from "@/lib/intake-templates";
import { ACADEMIC_LEVELS, PROJECT_TYPES, REFERENCING_STYLES } from "@/lib/constants";

/**
 * What a client tells us on the intake form, described once, so the admin's
 * "edit intake details" screen and the read-only requirements view agree on
 * what exists, what it is called and where it is stored.
 *
 * Deliberately absent: anything sensitive or not the client's to describe.
 * The intake collects no passwords or ID numbers, and a client's sign-in
 * password lives on their User row, never here. Price, express delivery,
 * referral code and payment state are money, not intake, and have their own
 * controls.
 */

export type FieldTarget = "client" | "project" | "additional";
export type FieldKind = "text" | "textarea" | "number" | "select" | "date" | "tags" | "university";

export interface IntakeFieldDef {
  key: string;
  label: string;
  target: FieldTarget;
  kind: FieldKind;
  options?: { value: string; label: string }[];
  /** Templates that collect this field. Omitted = every template. */
  templates?: IntakeTemplate[];
  hint?: string;
}

const FYP: IntakeTemplate[] = ["academic_fyp"];

const DATA_OPTIONS = [
  { value: "PRIMARY", label: "Primary (client collects data)" },
  { value: "SECONDARY", label: "Secondary (existing data or literature)" },
  { value: "BOTH", label: "Both" },
  { value: "NONE", label: "None" },
  { value: "NOT_SURE", label: "Not sure yet" },
];

export const INTAKE_FIELDS: IntakeFieldDef[] = [
  // ── Client ──
  { key: "fullName", label: "Full name", target: "client", kind: "text" },
  { key: "phone", label: "Phone", target: "client", kind: "text" },
  {
    key: "email",
    label: "Email",
    target: "client",
    kind: "text",
    hint: "Sign-in codes are sent here. Changing it unlinks the client's current sign-in.",
  },
  { key: "universityId", label: "University", target: "client", kind: "university" },
  { key: "faculty", label: "Faculty", target: "client", kind: "text" },
  { key: "department", label: "Department", target: "client", kind: "text" },
  {
    key: "level",
    label: "Level",
    target: "client",
    kind: "select",
    options: ACADEMIC_LEVELS.map((l) => ({ value: l, label: l })),
  },

  // ── Project ──
  { key: "projectTitle", label: "Topic or title", target: "project", kind: "text" },
  { key: "matricNumber", label: "Matric number", target: "project", kind: "text" },
  { key: "supervisorName", label: "Supervisor", target: "project", kind: "text", templates: ["academic_fyp", "academic_seminar"] },
  { key: "otherSupervisors", label: "Other supervisors", target: "project", kind: "text", templates: FYP },
  { key: "hodName", label: "Head of department", target: "project", kind: "text", templates: FYP },
  { key: "projectPartners", label: "Project partners", target: "project", kind: "text", templates: FYP },
  {
    key: "projectType",
    label: "Project type",
    target: "project",
    kind: "select",
    options: PROJECT_TYPES.map((p) => ({ value: p.value, label: p.label })),
    templates: FYP,
  },
  { key: "chapterCount", label: "Chapters", target: "project", kind: "number", templates: FYP },
  {
    key: "referencingStyle",
    label: "Referencing style",
    target: "project",
    kind: "select",
    options: REFERENCING_STYLES.map((r) => ({ value: r.value, label: r.label })),
    templates: ["academic_fyp", "academic_termpaper", "academic_seminar", "editing"],
  },
  {
    key: "dataRequirements",
    label: "Data requirements",
    target: "project",
    kind: "select",
    options: DATA_OPTIONS,
    templates: FYP,
  },
  { key: "minimumPages", label: "Minimum pages", target: "project", kind: "text", templates: FYP },
  { key: "clientDeadline", label: "Needed by", target: "project", kind: "date" },
  { key: "departmentOutline", label: "Department outline", target: "project", kind: "textarea", templates: ["academic_fyp", "academic_seminar"] },
  { key: "specialInstructions", label: "Special instructions", target: "project", kind: "textarea" },
  {
    key: "dedicationType",
    label: "Dedication",
    target: "project",
    kind: "select",
    options: ["God", "Family", "Both", "Custom"].map((v) => ({ value: v, label: v })),
    templates: FYP,
  },
  { key: "dedicationDetails", label: "Dedication wording", target: "project", kind: "textarea", templates: FYP },
  { key: "acknowledgmentDetails", label: "Acknowledgement details", target: "project", kind: "textarea", templates: FYP },

  // ── Service-specific (stored in additionalData) ──
  { key: "proposalNotes", label: "Proposal notes", target: "additional", kind: "textarea", templates: FYP },
  { key: "courseTitle", label: "Course title", target: "additional", kind: "text", templates: ["academic_termpaper"] },
  { key: "courseCode", label: "Course code", target: "additional", kind: "text", templates: ["academic_termpaper"] },
  { key: "wordCount", label: "Word count", target: "additional", kind: "number", templates: ["academic_termpaper"] },
  { key: "lecturerInstructions", label: "Lecturer's instructions", target: "additional", kind: "textarea", templates: ["academic_termpaper"] },

  { key: "companyName", label: "Company or organisation", target: "additional", kind: "text", templates: ["academic_it"] },
  { key: "companyAddress", label: "Company address", target: "additional", kind: "text", templates: ["academic_it"] },
  { key: "itDuration", label: "IT duration", target: "additional", kind: "text", templates: ["academic_it"] },
  { key: "companyDepartment", label: "Department at company", target: "additional", kind: "text", templates: ["academic_it"] },
  { key: "companySupervisor", label: "Company supervisor", target: "additional", kind: "text", templates: ["academic_it"] },

  { key: "linkedin", label: "LinkedIn", target: "additional", kind: "text", templates: ["career_cv"] },
  { key: "address", label: "Address", target: "additional", kind: "text", templates: ["career_cv"] },
  { key: "skills", label: "Skills", target: "additional", kind: "tags", templates: ["career_cv"] },
  { key: "certifications", label: "Certifications", target: "additional", kind: "tags", templates: ["career_cv"] },
  {
    key: "stylePreference",
    label: "CV style",
    target: "additional",
    kind: "select",
    options: ["Modern", "Classic", "Creative"].map((v) => ({ value: v, label: v })),
    templates: ["career_cv"],
  },

  { key: "purpose", label: "Purpose", target: "additional", kind: "text", templates: ["design_presentation"] },
  { key: "audience", label: "Audience", target: "additional", kind: "text", templates: ["design_presentation"] },
  { key: "slideCount", label: "Slides", target: "additional", kind: "number", templates: ["design_presentation"] },
  { key: "contentSource", label: "Content source", target: "additional", kind: "textarea", templates: ["design_presentation"] },
  { key: "colorScheme", label: "Colour scheme", target: "additional", kind: "text", templates: ["design_presentation"] },
  { key: "designStyle", label: "Design style", target: "additional", kind: "text", templates: ["design_presentation"] },

  {
    key: "editingType",
    label: "Editing or formatting",
    target: "additional",
    kind: "select",
    options: ["Editing", "Formatting", "Both"].map((v) => ({ value: v, label: v })),
    templates: ["editing"],
  },
  { key: "pageCount", label: "Pages", target: "additional", kind: "number", templates: ["editing"] },
];

/** Fields the client's form collected for this template (or the basics when unknown). */
export function fieldsForTemplate(template: IntakeTemplate | null): IntakeFieldDef[] {
  return INTAKE_FIELDS.filter((f) => {
    if (!f.templates) return true;
    if (!template) return false;
    return f.templates.includes(template);
  });
}

export const FIELD_LABELS: Record<string, string> = {
  ...Object.fromEntries(INTAKE_FIELDS.map((f) => [f.key, f.label])),
  education: "Education",
  experience: "Experience",
};
