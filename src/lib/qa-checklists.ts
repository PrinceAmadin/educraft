import { resolveTemplate } from "@/lib/intake-templates";

/**
 * QA checklists keyed by resolved intake template. Item ids are stable — the
 * saved `qaChecklist` JSON maps id -> boolean.
 */
export interface QaItem {
  id: string;
  label: string;
}

export interface QaChecklistDef {
  title: string;
  items: QaItem[];
}

const FYP: QaChecklistDef = {
  title: "Final year project checklist",
  items: [
    { id: "chapters", label: "All required chapters present" },
    { id: "title-page", label: "Title page formatted correctly" },
    { id: "toc", label: "Table of contents matches actual content" },
    { id: "abstract", label: "Abstract present and coherent" },
    { id: "references", label: "References properly formatted" },
    { id: "citations", label: "In-text citations match reference list" },
    { id: "page-numbers", label: "Page numbering correct (Roman prelims, Arabic body)" },
    { id: "figures-labelled", label: "Figures and tables labelled and referenced" },
    { id: "page-count", label: "Meets minimum page count" },
    { id: "grammar", label: "Grammar and spelling acceptable" },
    { id: "file-format", label: "File format correct (.docx)" },
    { id: "prelims", label: "Preliminary pages complete" },
    { id: "no-placeholders", label: "No placeholder text remains" },
    { id: "equations", label: "All equations in borderless two-column tables" },
    { id: "etal", label: "All et al. italicised" },
    { id: "tables-breaks", label: "Tables don't break across pages unnecessarily" },
    { id: "sources-cited", label: "All figures/tables cited with sources" },
  ],
};

const TERM_PAPER: QaChecklistDef = {
  title: "Term paper checklist",
  items: [
    { id: "brief-met", label: "Addresses the assignment brief in full" },
    { id: "structure", label: "Clear introduction, body, and conclusion" },
    { id: "word-count", label: "Meets the required word count" },
    { id: "references", label: "References formatted in the requested style" },
    { id: "citations", label: "In-text citations match the reference list" },
    { id: "grammar", label: "Grammar and spelling acceptable" },
    { id: "originality", label: "No obvious plagiarism / properly paraphrased" },
    { id: "file-format", label: "File format correct" },
  ],
};

const SEMINAR: QaChecklistDef = {
  title: "Seminar report checklist",
  items: [
    { id: "structure", label: "Follows the department's expected structure" },
    { id: "topic-covered", label: "Topic is covered thoroughly" },
    { id: "references", label: "References properly formatted" },
    { id: "citations", label: "In-text citations match the reference list" },
    { id: "page-numbers", label: "Page numbering correct" },
    { id: "grammar", label: "Grammar and spelling acceptable" },
    { id: "prelims", label: "Preliminary pages present where required" },
    { id: "file-format", label: "File format correct" },
  ],
};

const IT_REPORT: QaChecklistDef = {
  title: "IT report checklist",
  items: [
    { id: "structure", label: "Follows the IT report structure (intro, company, weekly log, conclusion)" },
    { id: "company-details", label: "Company details and duration accurate" },
    { id: "activities", label: "Activities / experience clearly described" },
    { id: "logbook", label: "Logbook / weekly breakdown present" },
    { id: "references", label: "References properly formatted" },
    { id: "grammar", label: "Grammar and spelling acceptable" },
    { id: "file-format", label: "File format correct" },
  ],
};

const CV: QaChecklistDef = {
  title: "CV / resume checklist",
  items: [
    { id: "contact", label: "Contact details complete and correct" },
    { id: "education", label: "Education section accurate and ordered" },
    { id: "experience", label: "Experience bullet points are action-led and specific" },
    { id: "skills", label: "Skills and certifications included" },
    { id: "one-page", label: "Length appropriate (1–2 pages)" },
    { id: "consistency", label: "Consistent formatting, fonts, and spacing" },
    { id: "grammar", label: "No spelling or grammar errors" },
  ],
};

const PRESENTATION: QaChecklistDef = {
  title: "Presentation checklist",
  items: [
    { id: "covers-topic", label: "Slides cover the topic and purpose" },
    { id: "slide-count", label: "Slide count matches the request" },
    { id: "readable", label: "Text is readable, not overcrowded" },
    { id: "visuals", label: "Visuals / charts support the content" },
    { id: "consistent", label: "Consistent theme and colour scheme" },
    { id: "speaker-notes", label: "Speaker notes included where relevant" },
    { id: "file-format", label: "File format correct (.pptx)" },
  ],
};

const EDITING: QaChecklistDef = {
  title: "Editing checklist",
  items: [
    { id: "grammar", label: "Grammar, spelling, and punctuation corrected" },
    { id: "clarity", label: "Sentences clearer, meaning preserved" },
    { id: "consistency", label: "Consistent tense, tone, and terminology" },
    { id: "formatting", label: "Formatting applied as requested" },
    { id: "tracked", label: "Changes tracked / summary of edits provided" },
    { id: "file-format", label: "File returned in the correct format" },
  ],
};

const GENERIC: QaChecklistDef = {
  title: "Quality checklist",
  items: [
    { id: "brief-met", label: "Meets the client's requirements" },
    { id: "complete", label: "Deliverable is complete" },
    { id: "grammar", label: "Grammar and spelling acceptable" },
    { id: "formatting", label: "Formatting is clean and consistent" },
    { id: "file-format", label: "File format correct" },
  ],
};

export function checklistForTemplate(intakeFormTemplate: string): QaChecklistDef {
  const resolved = resolveTemplate(intakeFormTemplate);
  switch (resolved) {
    case "academic_fyp":
      return FYP;
    case "academic_termpaper":
      return TERM_PAPER;
    case "academic_seminar":
      return SEMINAR;
    case "academic_it":
      return IT_REPORT;
    case "career_cv":
      return CV;
    case "design_presentation":
      return PRESENTATION;
    case "editing":
      return EDITING;
    default:
      return GENERIC;
  }
}
