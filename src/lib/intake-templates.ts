/**
 * Intake form templates. `intakeFormTemplate` on the Service row picks one.
 * Anything `resolveTemplate` can't map falls back to a "finish on WhatsApp"
 * panel.
 */

export const SUPPORTED_TEMPLATES = [
  "academic_fyp",
  "academic_termpaper",
  "academic_seminar",
  "academic_it",
  "career_cv",
  "design_presentation",
  "editing",
] as const;

export type IntakeTemplate = (typeof SUPPORTED_TEMPLATES)[number];

/** Which concrete form a service's template string maps to. */
export function resolveTemplate(raw: string): IntakeTemplate | null {
  if (raw.startsWith("academic_fyp")) return "academic_fyp";
  if (raw === "academic_termpaper") return "academic_termpaper";
  if (raw === "academic_seminar") return "academic_seminar";
  if (raw === "academic_it") return "academic_it";
  if (raw === "career_cv") return "career_cv";
  if (raw === "design_presentation") return "design_presentation";
  if (raw === "editing" || raw === "formatting") return "editing";
  return null;
}

export interface StepDef {
  id: string;
  label: string;
}

export const TEMPLATE_STEPS: Record<IntakeTemplate, StepDef[]> = {
  academic_fyp: [
    { id: "personal", label: "Your details" },
    { id: "project", label: "Project" },
    { id: "requirements", label: "Requirements" },
    { id: "prelims", label: "Preliminary pages" },
    { id: "review", label: "Review" },
  ],
  academic_termpaper: [
    { id: "personal", label: "Your details" },
    { id: "details", label: "Details" },
    { id: "files", label: "Instructions" },
    { id: "review", label: "Review" },
  ],
  academic_seminar: [
    { id: "personal", label: "Your details" },
    { id: "seminar", label: "Seminar" },
    { id: "requirements", label: "Requirements" },
    { id: "review", label: "Review" },
  ],
  academic_it: [
    { id: "personal", label: "Your details" },
    { id: "it", label: "IT details" },
    { id: "files", label: "Documents" },
    { id: "review", label: "Review" },
  ],
  career_cv: [
    { id: "contact", label: "Contact" },
    { id: "education", label: "Education" },
    { id: "experience", label: "Experience" },
    { id: "skills", label: "Skills" },
    { id: "style", label: "Style" },
    { id: "review", label: "Review" },
  ],
  design_presentation: [
    { id: "personal", label: "Your details" },
    { id: "presentation", label: "Presentation" },
    { id: "design", label: "Design" },
    { id: "files", label: "Content" },
    { id: "review", label: "Review" },
  ],
  editing: [
    { id: "personal", label: "Your details" },
    { id: "editing", label: "Editing" },
    { id: "files", label: "Document" },
    { id: "review", label: "Review" },
  ],
};

// ── Service category display ─────────────────────────────────

export const CATEGORY_LABELS: Record<string, string> = {
  ACADEMIC: "Academic Writing",
  DESIGN: "Presentations & Design",
  CAREER: "Career & Professional",
  LEARNING: "Learning Support",
  DIGITAL: "Digital Services",
};

/** Order categories appear in on the selection page. */
export const CATEGORY_ORDER = ["ACADEMIC", "DESIGN", "CAREER", "LEARNING", "DIGITAL"];

export const COMBO_GROUP = {
  key: "COMBO",
  label: "Combos — save more",
};

/** A combo is an ACADEMIC service whose code starts with COMBO. */
export function isCombo(serviceCode: string): boolean {
  return serviceCode.toUpperCase().startsWith("COMBO");
}
