/**
 * D3c — the data request at a report pipeline pause.
 *
 * Modes 2 and 4 pause after Chapter 3 for the analysed results; Mode 3 pauses
 * after Chapter 2 for the build specification and after Chapter 3 for the test
 * results (founder, 27 Sept). At each pause one Claude call reads the project
 * and the chapter the pause follows and drafts a request written for THIS
 * project (the instrument, items, variables, sample and place), never a
 * generic "upload your file". The request is saved on the PipelinePause row;
 * the worker answers it on their project page; formatWorkerData turns the
 * answers into the text the later chapter prompts get.
 *
 * Every sentence sent to Claude is in DATA_FORM_TEXT for the founder to review.
 */

import { callClaudeForJson } from "@/lib/anthropic";
import type { AiUsageContext } from "@/lib/ai-usage-log";
import { MODE_NAMES, type ResearchModeNumber } from "@/lib/generation/department-map";
import { listFrom } from "@/lib/research/source-policy";

export type PauseKind = "SPECIFICATION" | "RESULTS";

// ─── Where the pipeline pauses ───────────────────────────────────────────────

const PAUSE_POINTS: Record<number, number[]> = { 1: [], 2: [3], 3: [2, 3], 4: [3], 5: [] };

/** The chapters after which a mode's pipeline waits for the worker's data. */
export function pausePointsFor(mode: number): number[] {
  return PAUSE_POINTS[mode] ?? [];
}

export function pauseKind(mode: number, afterChapter: number): PauseKind {
  return mode === 3 && afterChapter === 2 ? "SPECIFICATION" : "RESULTS";
}

/** The pauses whose data a chapter needs (every pause before it): Chapter 4 in Mode 2 needs the pause after Chapter 3. */
export function pausesBeforeChapter(mode: number, chapter: number): number[] {
  return pausePointsFor(mode).filter((p) => p < chapter);
}

// ─── The form ────────────────────────────────────────────────────────────────

export const FIELD_TYPES = ["text", "number", "textarea", "select", "date"] as const;
export type DataFieldType = (typeof FIELD_TYPES)[number];

/** What each mode's worker may send (Claude reads PDFs and images; we read Word, Excel and CSV). */
export const MODE_FORMATS: Record<number, readonly string[]> = {
  2: ["pdf", "xlsx", "csv", "docx"],
  3: ["pdf", "png", "jpg", "docx"],
  4: ["pdf", "xlsx", "csv", "docx", "png", "jpg"],
};

export interface DataFormFile {
  key: string;
  label: string;
  description: string;
  formats: string[];
  required: boolean;
}

export interface DataFormField {
  key: string;
  label: string;
  type: DataFieldType;
  required: boolean;
  help: string | null;
  options: string[];
}

export interface DataFormSpec {
  title: string;
  description: string;
  files: DataFormFile[];
  fields: DataFormField[];
  checklist: string[];
}

export const FORM_LIMITS = {
  title: 80,
  description: 500,
  minDescription: 80,
  files: 3,
  fieldsMin: 2,
  fieldsMax: 8,
  checklistMin: 3,
  checklistMax: 10,
} as const;

export const DATA_FORM_TEXT = {
  system: (formats: readonly string[]) =>
    "You write the data request EduCraft's worker sees when a student's final year report pauses for real data. The worker has carried out the study described below and must now upload what the next chapters will be written from. " +
    "Write the request for THIS project: name the actual instrument, items or variables, sample, place, and the objectives or hypotheses from the chapter. Never write generic wording such as \"upload your file\" or \"upload your data\". " +
    `Rules: the title is at most ${FORM_LIMITS.title} characters and says what is being asked for (for example "Your survey analysis for the UNILAG library study"), never a chapter number. The description is 1 to 3 sentences addressed to the worker (beginning "Please upload"), at most ${FORM_LIMITS.description} characters, saying exactly which files and what they must contain. ` +
    `Give 1 to ${FORM_LIMITS.files} upload slots, each saying what it must contain, with formats chosen only from: ${formats.join(", ")}. At least one slot is required. ` +
    "Everything one program exports goes in ONE slot (for example the whole SPSS output, with its frequency, reliability and regression tables, as one PDF); add a slot only for a genuinely separate file, such as the coded data sheet, screenshots or laboratory record sheets, and make it optional unless the chapters cannot be written without it. " +
    `Give ${FORM_LIMITS.fieldsMin} to ${FORM_LIMITS.fieldsMax} short fields for facts the chapters need that a file may not show (for example how many questionnaires were distributed and returned, the software and version used, the sample actually reached, the equipment used, anything that changed from the plan), each typed as text, number, textarea, select (with options) or date (a date field holds one date: ask for a period as text). ` +
    `Give ${FORM_LIMITS.checklistMin} to ${FORM_LIMITS.checklistMax} checklist lines, each one table, result or item the upload must show, tied to the objectives or hypotheses. ` +
    "Ask for SPSS output exported to PDF (SPSS's own .sav and .spv files cannot be read), Excel sheets as .xlsx or CSV, and screenshots as PNG or JPG.",
  purpose: {
    RESULTS:
      "The pause comes after Chapter 3 (the methodology below). What the worker uploads is what Chapter 4 (the results) and Chapter 5 are written from: Chapter 4 reports every objective from it, and writes [DATA NOT PROVIDED — COO TO REVIEW] for anything missing.",
    SPECIFICATION:
      "The pause comes after Chapter 2, before Chapter 3 describes the system. What the worker uploads is the specification of what was actually built: the architecture, the tools and languages, the modules and what each does, the database design, and screenshots of the working system.",
  } satisfies Record<PauseKind, string>,
  checklistIntro: "The Chapter 4 instructions check for these inputs before writing (ask for each one this project needs):",
  tool: "Record the data request for this project.",
  retry: (problems: string[]) => `Your request broke these rules: ${problems.join(" ")} Write it again.`,
} as const;

export interface DataFormContext {
  topic: string;
  department: string;
  mode: ResearchModeNumber;
  kind: PauseKind;
  afterChapter: number;
  objectives: string[];
  /** The chapter the pause follows (and, for the build specification, Chapter 1 before it). */
  chapters: { number: number; text: string }[];
  /** The Chapter 4 prompt file's data checklist for this mode (RESULTS pauses). */
  checklist: string[];
}

const CHAPTER_CHARS = 40_000;

export function dataFormUserPrompt(ctx: DataFormContext): string {
  const lines = [
    `Project topic: ${ctx.topic}`,
    `Department: ${ctx.department}`,
    `Research mode: Mode ${ctx.mode} (${MODE_NAMES[ctx.mode]})`,
    "Objectives:",
    ...ctx.objectives.map((o, i) => `${i + 1}. ${o}`),
    "",
    DATA_FORM_TEXT.purpose[ctx.kind],
  ];
  if (ctx.kind === "RESULTS" && ctx.checklist.length) lines.push("", DATA_FORM_TEXT.checklistIntro, ...ctx.checklist.map((c) => `- ${c}`));
  const perChapter = Math.floor(CHAPTER_CHARS / Math.max(1, ctx.chapters.length));
  for (const ch of ctx.chapters) {
    const text = ch.text.trim();
    const cut = text.length > perChapter ? `${text.slice(0, perChapter)}\n[… the rest of Chapter ${ch.number} is not shown]` : text;
    lines.push("", `Chapter ${ch.number} as written:`, cut);
  }
  return lines.join("\n");
}

const STOPWORDS = new Set(
  "the a an of and or in on at to for with by from into among between within about as its their this that these those is are was were be been being study studies effect effects impact role analysis assessment evaluation case design implementation using use based towards toward nigeria nigerian state students student university".split(
    " ",
  ),
);

/** The words that make a project's topic its own ("library", "unilag"), for the specificity guard. */
export function distinctiveWords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)];
}

const GENERIC = /^please upload (your|the) (file|files|data|document|documents)\.?$/i;

/** Tidied text, cut at a word end (with "…") when over `max`, so nothing shows half a word. */
function str(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const text = v.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const end = cut.lastIndexOf(" ");
  return `${(end > max * 0.6 ? cut.slice(0, end) : cut).replace(/[\s,;:.–-]+$/, "")}…`;
}

function slug(v: unknown, fallback: string): string {
  const s = (typeof v === "string" ? v : "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return s || fallback;
}

export type DataFormCheck = { ok: true; form: DataFormSpec } | { ok: false; problems: string[] };

/**
 * The rules a drafted request must meet: 1–3 file slots (one required) in the
 * mode's formats, 2–8 fields, 3–10 checklist lines, unique keys, and a
 * description that names the project (at least two distinctive words of the
 * topic, or all of them when it has fewer). Pure.
 */
export function validateDataForm(raw: unknown, opts: { mode: number; topic: string }): DataFormCheck {
  const r = (raw ?? {}) as Record<string, unknown>;
  const problems: string[] = [];
  const allowed = MODE_FORMATS[opts.mode] ?? [];
  const title = str(r.title, FORM_LIMITS.title);
  const description = str(r.description, FORM_LIMITS.description + 200);

  if (!title) problems.push("Give a title.");
  if (description.length < FORM_LIMITS.minDescription) problems.push(`The description must be at least ${FORM_LIMITS.minDescription} characters.`);
  if (description.length > FORM_LIMITS.description) problems.push(`The description must be at most ${FORM_LIMITS.description} characters.`);
  if (GENERIC.test(description)) problems.push("The description is generic: name the project's own instrument, items and place.");
  const topicWords = distinctiveWords(opts.topic);
  const need = Math.min(2, topicWords.length);
  const lower = description.toLowerCase();
  const named = topicWords.filter((w) => lower.includes(w)).length;
  if (named < need) problems.push("The description does not name this project: use the topic's own subject, instrument and place.");

  const used = new Set<string>();
  const unique = (base: string) => {
    let k = base;
    for (let i = 2; used.has(k); i++) k = `${base}_${i}`;
    used.add(k);
    return k;
  };

  const files: DataFormFile[] = [];
  for (const [i, item] of listFrom(r.files, "files").entries()) {
    const f = (item ?? {}) as Record<string, unknown>;
    const label = str(f.label, 80);
    if (!label) continue;
    const formats = [...new Set(listFrom(f.formats, "formats").map((x) => String(x).toLowerCase().replace(/^\./, "")).map((x) => (x === "jpeg" ? "jpg" : x)))].filter((x) =>
      allowed.includes(x),
    );
    if (formats.length === 0) {
      problems.push(`Upload slot "${label}" has no format this mode accepts (${allowed.join(", ")}).`);
      continue;
    }
    files.push({ key: unique(slug(f.key, `file_${i + 1}`)), label, description: str(f.description, 300), formats, required: f.required === true });
    if (files.length >= FORM_LIMITS.files) break;
  }
  if (files.length === 0) problems.push("Give at least one upload slot.");
  else if (!files.some((f) => f.required)) files[0].required = true;

  const fields: DataFormField[] = [];
  for (const [i, item] of listFrom(r.fields, "fields").entries()) {
    const f = (item ?? {}) as Record<string, unknown>;
    const label = str(f.label, 100);
    if (!label) continue;
    const type = (FIELD_TYPES as readonly string[]).includes(String(f.type)) ? (String(f.type) as DataFieldType) : "text";
    const options = type === "select" ? listFrom(f.options, "options").map((o) => str(o, 80)).filter(Boolean).slice(0, 12) : [];
    fields.push({
      key: unique(slug(f.key, `field_${i + 1}`)),
      label,
      type: type === "select" && options.length < 2 ? "text" : type,
      required: f.required === true,
      help: str(f.help, 200) || null,
      options: type === "select" && options.length >= 2 ? options : [],
    });
    if (fields.length >= FORM_LIMITS.fieldsMax) break;
  }
  if (fields.length < FORM_LIMITS.fieldsMin) problems.push(`Give ${FORM_LIMITS.fieldsMin} to ${FORM_LIMITS.fieldsMax} fields.`);

  const checklist = listFrom(r.checklist, "checklist")
    .map((c) => str(c, 200))
    .filter(Boolean)
    .slice(0, FORM_LIMITS.checklistMax);
  if (checklist.length < FORM_LIMITS.checklistMin) problems.push(`Give ${FORM_LIMITS.checklistMin} to ${FORM_LIMITS.checklistMax} checklist lines.`);

  return problems.length ? { ok: false, problems } : { ok: true, form: { title, description, files, fields, checklist } };
}

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string", description: "1 to 3 sentences beginning \"Please upload\", naming this project's instrument, items and place." },
    files: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          description: { type: "string", description: "Exactly what this file must contain, in at most 250 characters." },
          formats: { type: "array", items: { type: "string" } },
          required: { type: "boolean" },
        },
        required: ["key", "label", "description", "formats", "required"],
      },
    },
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          type: { type: "string", enum: [...FIELD_TYPES] },
          required: { type: "boolean" },
          help: { type: "string" },
          options: { type: "array", items: { type: "string" } },
        },
        required: ["key", "label", "type", "required"],
      },
    },
    checklist: { type: "array", items: { type: "string" } },
  },
  required: ["title", "description", "files", "fields", "checklist"],
} as const;

export class DataFormError extends Error {}

/** One Claude call (one retry when the reply breaks the rules). Never a generic fallback. */
export async function generateDataForm(ctx: DataFormContext, usage: AiUsageContext): Promise<DataFormSpec> {
  const formats = MODE_FORMATS[ctx.mode] ?? [];
  let user = dataFormUserPrompt(ctx);
  let last: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const reply = await callClaudeForJson<unknown>({
      system: DATA_FORM_TEXT.system(formats),
      user,
      toolName: "record_data_form",
      toolDescription: DATA_FORM_TEXT.tool,
      inputSchema: SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 3000,
      usage: { ...usage, step: attempt === 1 ? usage.step : `${usage.step}_retry` },
    });
    const check = validateDataForm(reply, { mode: ctx.mode, topic: ctx.topic });
    if (check.ok) return check.form;
    console.warn(`[data form] draft ${attempt} broke the rules:`, check.problems.join(" "));
    last = check.problems;
    user = `${dataFormUserPrompt(ctx)}\n\n${DATA_FORM_TEXT.retry(check.problems)}`;
  }
  throw new DataFormError(`The data request broke the rules twice: ${last.join(" ")}`);
}

/** Reads a stored form back (the JSON column), or null when it is not a valid form. */
export function readFormSpec(json: unknown): DataFormSpec | null {
  const r = (json ?? null) as DataFormSpec | null;
  if (!r || typeof r.description !== "string" || !Array.isArray(r.files) || !Array.isArray(r.fields) || !Array.isArray(r.checklist)) return null;
  return r;
}

// ─── What the worker sends ──────────────────────────────────────────────────

export type Answers = Record<string, string>;

/**
 * Checks a submission against its form: every required field answered (numbers
 * are numbers, a select is one of its options, a date is a date), every
 * required slot filled, no unknown slot, at most one file per slot. Pure.
 */
export function validateSubmission(form: DataFormSpec, answers: Record<string, unknown>, slots: string[]): { ok: true; answers: Answers } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const clean: Answers = {};
  for (const f of form.fields) {
    const raw = answers[f.key];
    const value = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim().slice(0, f.type === "textarea" ? 2000 : 300) : "";
    if (!value) {
      if (f.required) problems.push(`Fill in "${f.label}".`);
      continue;
    }
    if (f.type === "number" && !/^-?\d+(\.\d+)?$/.test(value.replace(/,/g, ""))) problems.push(`"${f.label}" must be a number.`);
    if (f.type === "select" && !f.options.includes(value)) problems.push(`Pick one of the choices for "${f.label}".`);
    if (f.type === "date" && Number.isNaN(Date.parse(value))) problems.push(`"${f.label}" must be a date.`);
    clean[f.key] = value;
  }
  const keys = new Set(form.files.map((f) => f.key));
  for (const s of slots) if (!keys.has(s)) problems.push("A file was sent for an upload slot this request does not have.");
  if (new Set(slots).size !== slots.length) problems.push("Send one file per upload slot.");
  for (const f of form.files) if (f.required && !slots.includes(f.key)) problems.push(`Upload "${f.label}".`);
  return problems.length ? { ok: false, problems } : { ok: true, answers: clean };
}

// ─── Into the chapter prompts ───────────────────────────────────────────────

export interface WorkerDataFile {
  /** The ProjectFile row (never shown in the prompt; used to attach PDFs and images to the call). */
  fileId?: string;
  name: string;
  slot: string;
  /** "text": its text is below; "document"/"image": attached to the message as it is. */
  kind: "text" | "document" | "image";
  text: string | null;
}

export interface WorkerData {
  afterChapter: number;
  kind: PauseKind;
  title: string;
  description: string;
  checklist: string[];
  answers: { label: string; value: string }[];
  files: WorkerDataFile[];
}

export const WORKER_DATA_TEXT = {
  intro: (kind: PauseKind) =>
    kind === "RESULTS"
      ? "This is the data EduCraft's worker collected and analysed for this project, sent in answer to the request below. Write every result from it: never invent, round beyond it or estimate a figure, a percentage or a test value. Where a result the chapter needs is not in it, write [DATA NOT PROVIDED — COO TO REVIEW] instead."
      : "This is the specification of the system EduCraft's worker actually built for this project, sent in answer to the request below. Describe the system only as it states; where a detail the chapter needs is not in it, write [DATA NOT PROVIDED — COO TO REVIEW] instead.",
  attached: (name: string, slot: string) => `${name} (${slot}) is attached to this message: read it directly.`,
  maxTotal: 80_000,
} as const;

/** The text block the later chapters get, one section per pause. Pure; capped in total. */
export function formatWorkerData(data: WorkerData[]): string {
  let budget: number = WORKER_DATA_TEXT.maxTotal;
  const sections: string[] = [];
  for (const d of data) {
    const lines = [
      `Data sent after Chapter ${d.afterChapter}: ${d.title}`,
      WORKER_DATA_TEXT.intro(d.kind),
      `What was asked for: ${d.description}`,
    ];
    if (d.checklist.length) lines.push("It should show:", ...d.checklist.map((c) => `- ${c}`));
    if (d.answers.length) lines.push("The worker's answers:", ...d.answers.map((a) => `- ${a.label}: ${a.value}`));
    for (const f of d.files) {
      if (f.kind === "text" && f.text) {
        const text = f.text.length > budget ? `${f.text.slice(0, Math.max(0, budget))}\n[… cut to keep the prompt within its limit]` : f.text;
        budget = Math.max(0, budget - text.length);
        lines.push(`File ${f.name} (${f.slot}), as text:`, text);
      } else {
        lines.push(WORKER_DATA_TEXT.attached(f.name, f.slot));
      }
    }
    sections.push(lines.join("\n"));
  }
  return sections.join("\n\n");
}
