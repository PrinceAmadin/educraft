/**
 * The values a chapter written before its data pause leaves for the client's
 * data (LOADER_TEXT.countsBeforePause: Modes 2 and 4 Chapter 3, Mode 3
 * Chapters 2 and 3). When the specialist verifies the pause they fill each one
 * in, pre-filled from the client's answers where a question plainly asks for
 * it, and the values are written into the chapter text, so the report never
 * reaches QA with [N_DISTRIBUTED] and the like still in it (ST16).
 *
 * Pure: no database. Every sentence the specialist reads is in COUNT_VALUE_TEXT.
 */

export const NAMED_COUNT_PLACEHOLDERS = ["N_DISTRIBUTED", "N_RETURNED", "N_USABLE", "RESPONSE_RATE", "POPULATION_SIZE", "SAMPLE_SIZE", "FIELDWORK_PERIOD"] as const;
export type NamedCountPlaceholder = (typeof NAMED_COUNT_PLACEHOLDERS)[number];
/** Stands for a different value at each place it is written, so each occurrence is its own slot. */
export const SPECIFIC_VALUE_TOKEN = "SPECIFIC VALUE TO BE SUPPLIED";

export const COUNT_VALUE_TEXT = {
  heading: (chapters: number[]) => `Values ${chapterList(chapters)} left for the client's data`,
  explain: (chapters: number[]) =>
    `${chapterList(chapters)} ${chapters.length > 1 ? "were" : "was"} written before the client's data arrived, so ${chapters.length > 1 ? "they" : "it"} left these values blank. Fill in each one from the files; it is written into the chapter when you verify.`,
  labels: {
    N_DISTRIBUTED: "Number distributed (questionnaires, forms or samples)",
    N_RETURNED: "Number returned or recovered",
    N_USABLE: "Number usable after cleaning",
    RESPONSE_RATE: "Response rate",
    POPULATION_SIZE: "Population the study samples from",
    SAMPLE_SIZE: "Sample size achieved",
    FIELDWORK_PERIOD: "Fieldwork period (dates)",
  } satisfies Record<NamedCountPlaceholder, string>,
  specificLabel: (chapter: number, n: number) => `Other value ${n} in Chapter ${chapter}`,
  missing: (chapters: number[]) => `Fill in every value ${chapterList(chapters)} left for the client's data before verifying.`,
  missingOne: (label: string) => `Missing: ${label}.`,
  changed: (chapter: number) => `Chapter ${chapter} changed while you were checking. Refresh the page.`,
} as const;

function chapterList(chapters: number[]): string {
  const c = [...new Set(chapters)].sort((a, b) => a - b);
  if (c.length <= 1) return `Chapter ${c[0] ?? ""}`.trim();
  return `Chapters ${c.slice(0, -1).join(", ")} and ${c[c.length - 1]}`;
}

const TOKEN_RE = /\[(N_DISTRIBUTED|N_RETURNED|N_USABLE|RESPONSE_RATE|POPULATION_SIZE|SAMPLE_SIZE|FIELDWORK_PERIOD|SPECIFIC VALUE TO BE SUPPLIED)\]/g;
const MAX_VALUE = 200;
const CONTEXT = 110;

export interface ChapterText {
  number: number;
  text: string;
}

export interface ValueSlot {
  /** The named placeholder, or "SPECIFIC:{chapter}:{n}" for the nth other value in a chapter. */
  key: string;
  token: string;
  label: string;
  chapters: number[];
  occurrences: number;
  /** The sentence around its first place, with the blank shown as ____. */
  context: string;
  /** From the client's answers; empty when no question plainly asks for it. */
  prefill: string;
}

function specificKey(chapter: number, n: number): string {
  return `SPECIFIC:${chapter}:${n}`;
}

function contextAt(text: string, index: number, length: number): string {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const lineEnd = text.indexOf("\n", index + length);
  const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
  const at = index - lineStart;
  const from = Math.max(0, at - CONTEXT);
  const to = Math.min(line.length, at + length + CONTEXT);
  const before = line.slice(from, at).replace(/\[H[123]\]\s*/g, "");
  const after = line.slice(at + length, to);
  return `${from > 0 ? "…" : ""}${before}____${after}${to < line.length ? "…" : ""}`.trim();
}

/** Every blank the chapters left, named ones merged across chapters, in the order they first appear. */
export function findValueSlots(chapters: ChapterText[]): ValueSlot[] {
  const slots = new Map<string, ValueSlot>();
  for (const ch of [...chapters].sort((a, b) => a.number - b.number)) {
    let specific = 0;
    for (const m of ch.text.matchAll(TOKEN_RE)) {
      const token = m[1];
      const named = token !== SPECIFIC_VALUE_TOKEN;
      const key = named ? token : specificKey(ch.number, ++specific);
      const slot = slots.get(key);
      if (slot) {
        slot.occurrences += 1;
        if (!slot.chapters.includes(ch.number)) slot.chapters.push(ch.number);
        continue;
      }
      slots.set(key, {
        key,
        token,
        label: named ? COUNT_VALUE_TEXT.labels[token as NamedCountPlaceholder] : COUNT_VALUE_TEXT.specificLabel(ch.number, specific),
        chapters: [ch.number],
        occurrences: 1,
        context: contextAt(ch.text, m.index ?? 0, m[0].length),
        prefill: "",
      });
    }
  }
  return [...slots.values()];
}

/** A value as it may go into a chapter: one line, no brackets (so it can never be, or make, a placeholder or a marker). */
export function cleanValue(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/[[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_VALUE);
}

/** Writes the values in. Returns each chapter's new text and the slots still without a value (nothing is written for those). */
export function fillValueSlots(chapters: ChapterText[], values: Record<string, unknown>): { chapters: (ChapterText & { changed: boolean })[]; missing: string[] } {
  const clean = new Map(Object.entries(values).map(([k, v]) => [k, cleanValue(v)] as const));
  const missing = new Set<string>();
  const out = chapters.map((ch) => {
    let specific = 0;
    const text = ch.text.replace(TOKEN_RE, (whole, token: string) => {
      const key = token === SPECIFIC_VALUE_TOKEN ? specificKey(ch.number, ++specific) : token;
      const value = clean.get(key);
      if (!value) {
        missing.add(key);
        return whole;
      }
      return value;
    });
    return { number: ch.number, text, changed: text !== ch.text };
  });
  return { chapters: out, missing: [...missing] };
}

// ─── Pre-filling from the client's answers ──────────────────────────────────

interface FieldLike {
  key: string;
  label: string;
  type: string;
}

const NUMERIC = /^\d[\d,]*(\.\d+)?%?$/;
const FIELD_RULES: { slot: NamedCountPlaceholder; test: RegExp; numeric: boolean }[] = [
  { slot: "N_DISTRIBUTED", test: /distribut|administer|issued|sent out|given out/, numeric: true },
  { slot: "N_RETURNED", test: /returned|retriev|recovered|received back/, numeric: true },
  { slot: "N_USABLE", test: /usable|valid|analysable|analyzable|after cleaning/, numeric: true },
  { slot: "RESPONSE_RATE", test: /response rate/, numeric: true },
  { slot: "POPULATION_SIZE", test: /population/, numeric: true },
  { slot: "SAMPLE_SIZE", test: /sample size|number of respondents|respondents/, numeric: true },
  { slot: "FIELDWORK_PERIOD", test: /fieldwork|data collection period|collection period|period of data|when .*collected|dates? of/, numeric: false },
];

function asNumber(value: string): number | null {
  const n = Number(value.replace(/[,%]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Fills each named slot whose meaning a question plainly asks for; the response rate is worked out when both counts are known. */
export function prefillValues(slots: ValueSlot[], fields: FieldLike[], answers: Record<string, unknown>): ValueSlot[] {
  const found = new Map<NamedCountPlaceholder, string>();
  for (const rule of FIELD_RULES) {
    for (const f of fields) {
      const answer = cleanValue(answers[f.key]);
      if (!answer) continue;
      const about = `${f.key.replace(/_/g, " ")} ${f.label}`.toLowerCase();
      if (!rule.test.test(about)) continue;
      if (rule.numeric && !NUMERIC.test(answer)) continue;
      // A question about the population frame never fills a count of what was sent, returned or sampled.
      if (rule.slot !== "POPULATION_SIZE" && /population/.test(about)) continue;
      found.set(rule.slot, answer);
      break;
    }
  }
  if (!found.has("RESPONSE_RATE")) {
    const sent = asNumber(found.get("N_DISTRIBUTED") ?? "");
    const back = asNumber(found.get("N_RETURNED") ?? "");
    if (sent && back !== null && back <= sent) found.set("RESPONSE_RATE", `${((back / sent) * 100).toFixed(1)}%`);
  }
  return slots.map((s) => ({ ...s, prefill: s.prefill || (found.get(s.key as NamedCountPlaceholder) ?? "") }));
}
