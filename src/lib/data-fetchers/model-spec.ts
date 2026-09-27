/**
 * Reads a Mode 5 project's model from its written Chapter 3 (Phase D5): the
 * dependent and independent variables, the equation, the period and the
 * frequency. One Claude call through src/lib/anthropic.ts (a forced tool, so
 * the answer is structured) matches each variable to the indicator catalogue
 * or marks it unmatched; everything after that is checked in code here:
 * symbols must be in the chapter, the stated period is read by regex as well,
 * years are kept to complete ones.
 */

import { callClaudeForJson } from "@/lib/anthropic";
import type { AiUsageContext } from "@/lib/ai-usage-log";
import { listFrom } from "@/lib/research/source-policy";
import { CATALOGUE_KEYS, INDICATOR_CATALOGUE } from "./indicator-catalogue";

export const EARLIEST_YEAR = 1960;
const MAX_VARIABLES = 12;

export type SpecFrequency = "annual" | "quarterly" | "monthly" | "not stated";

export interface SpecVariable {
  symbol: string;
  name: string;
  measure: string;
  role: "dependent" | "independent";
  /** A key of the indicator catalogue, or null when the variable is not one we can fetch. */
  catalogueKey: string | null;
}

export interface ModelSpec {
  variables: SpecVariable[];
  equation: string;
  period: { start: number; end: number };
  frequency: SpecFrequency;
  technique: string;
  sourcesNamed: string[];
  /** Plain notes for the COO about anything the checks changed. */
  notes: string[];
}

export class ModelSpecError extends Error {}

/** Wording sent to Claude, for the founder to review. */
export const MODEL_SPEC_TEXT = {
  system:
    "You read the methodology chapter of a Nigerian final year economics (secondary data) project and record its econometric model exactly as the chapter states it. You never add a variable, change a symbol or guess a period the chapter does not state.",
  instruction: (catalogue: string) =>
    [
      "Record the model this Chapter Three specifies, using the record_model_spec tool.",
      "- dependent: the one dependent (explained) variable. independents: every explanatory variable in the model equation, in the order the equation gives them. Leave out the constant, the coefficients and the error term.",
      "- symbol: the symbol exactly as the chapter writes it in the equation (for example GDP, INF, EXR). If the chapter takes the log of a variable (lnGDP, LOG(EXR)), give the symbol without the log (GDP, EXR): the dataset holds levels.",
      "- name and measure: the variable's name and its measure or proxy, as the chapter defines it (unit, currency, current or constant prices).",
      "- catalogueKey: the one entry below that measures the same thing in the same way (for example current US dollars and constant naira are different entries). Use \"none\" when no entry matches: never pick a near miss.",
      "- periodStart and periodEnd: the first and last year of the data period the chapter states. frequency: as stated (annual, quarterly or monthly), or \"not stated\".",
      "- equation: the model equation as written. technique: the estimation technique named (OLS, ARDL, VAR, VECM, GMM, ...). sourcesNamed: every data source the chapter names.",
      "",
      "The entries (key: what it measures):",
      catalogue,
    ].join("\n"),
} as const;

export function catalogueForPrompt(): string {
  return INDICATOR_CATALOGUE.map((i) => `${i.key}: ${i.name}, ${i.unit} (${i.hint})`).join("\n");
}

// ─── Pure pieces ─────────────────────────────────────────────────────────────

const HEADING = /^\s*\[(H[23])\]\s*(.+)$/;
const RELEVANT = /data|source|variable|model|specification|estimation|method of analysis|technique/i;

/**
 * The parts of Chapter 3 that describe the data and the model: every [H2]/[H3]
 * section whose heading matches, with its sub-sections. The whole chapter when
 * no heading matches (or the chapter has none).
 */
export function relevantSections(chapter: string): string {
  const lines = chapter.split(/\r?\n/);
  const kept: string[] = [];
  let keepLevel: string | null = null;
  for (const line of lines) {
    const h = HEADING.exec(line);
    if (h) {
      const level = h[1];
      if (RELEVANT.test(h[2])) keepLevel = keepLevel && keepLevel === "H2" && level === "H3" ? keepLevel : level;
      else if (!(keepLevel === "H2" && level === "H3")) keepLevel = null;
    }
    if (keepLevel) kept.push(line);
  }
  const text = kept.join("\n").trim();
  return text.length >= 200 ? text : chapter;
}

const YEAR = "(19[5-9]\\d|20\\d\\d)";
const RANGE = new RegExp(`(?:between\\s+|from\\s+)?${YEAR}\\s*(?:–|—|-|to|and|through)\\s*${YEAR}`, "gi");

/** Every distinct plausible year range the chapter states (5 to 70 years long). */
export function statedPeriods(text: string): { start: number; end: number }[] {
  const seen = new Map<string, { start: number; end: number }>();
  for (const m of text.matchAll(RANGE)) {
    const start = Number(m[1]);
    const end = Number(m[2]);
    if (end - start >= 5 && end - start <= 70) seen.set(`${start}-${end}`, { start, end });
  }
  return [...seen.values()];
}

/** The last year whose data is complete: last calendar year. */
export function lastCompleteYear(now: Date): number {
  return now.getUTCFullYear() - 1;
}

const cleanSymbol = (s: unknown) =>
  String(s ?? "")
    .replace(/^\s*(?:ln|log)\s*\(?\s*/i, "")
    .replace(/\)\s*$/, "")
    .replace(/[^A-Za-z0-9_]/g, "")
    .slice(0, 20);
const cleanText = (s: unknown, max = 200) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function mentioned(chapter: string, needle: string): boolean {
  if (!needle) return false;
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_])${esc}([^A-Za-z0-9_]|$)`, "i").test(chapter);
}

interface RawVariable {
  symbol?: unknown;
  name?: unknown;
  measure?: unknown;
  catalogueKey?: unknown;
}

export interface RawSpec {
  dependent?: RawVariable | string;
  independents?: unknown;
  equation?: unknown;
  periodStart?: unknown;
  periodEnd?: unknown;
  frequency?: unknown;
  technique?: unknown;
  sourcesNamed?: unknown;
}

/**
 * Pure: turns Claude's answer into a checked spec. Throws ModelSpecError when
 * the chapter gives no usable model (no dependent variable, no explanatory
 * variable, or no period).
 */
export function validateSpec(raw: RawSpec, chapter: string, now: Date): ModelSpec {
  const notes: string[] = [];
  const dependentRaw = (typeof raw.dependent === "string" ? safeJson(raw.dependent) : raw.dependent) as RawVariable | null;
  const independentsRaw = listFrom(raw.independents, "independents") as RawVariable[];

  const variables: SpecVariable[] = [];
  const seen = new Set<string>();
  const add = (v: RawVariable | null | undefined, role: SpecVariable["role"]) => {
    if (!v || typeof v !== "object") return;
    const symbol = cleanSymbol(v.symbol);
    const name = cleanText(v.name, 120);
    if (!symbol || symbol.toLowerCase() === "year") return;
    if (seen.has(symbol.toLowerCase())) {
      notes.push(`${symbol} was listed twice; kept once.`);
      return;
    }
    // A variable the chapter never mentions (by symbol or by name) was invented: dropped.
    if (!mentioned(chapter, symbol) && !(name && chapter.toLowerCase().includes(name.toLowerCase()))) {
      notes.push(`${symbol}${name ? ` (${name})` : ""} is not in Chapter 3, so it was left out.`);
      return;
    }
    const key = typeof v.catalogueKey === "string" && CATALOGUE_KEYS.includes(v.catalogueKey) ? v.catalogueKey : null;
    seen.add(symbol.toLowerCase());
    variables.push({ symbol, name: name || symbol, measure: cleanText(v.measure, 200), role, catalogueKey: key });
  };
  add(dependentRaw, "dependent");
  if (!variables.some((v) => v.role === "dependent")) throw new ModelSpecError("Chapter 3 does not state a dependent variable that could be read.");
  for (const v of independentsRaw.slice(0, MAX_VARIABLES)) add(v, "independent");
  if (independentsRaw.length > MAX_VARIABLES) notes.push(`Only the first ${MAX_VARIABLES} explanatory variables were kept.`);
  if (!variables.some((v) => v.role === "independent")) throw new ModelSpecError("Chapter 3 does not state any explanatory variable that could be read.");

  // The period: Claude's reading, checked against what the chapter literally says.
  let start = Number(raw.periodStart);
  let end = Number(raw.periodEnd);
  const stated = statedPeriods(chapter);
  if (stated.length === 1 && (stated[0].start !== start || stated[0].end !== end)) {
    if (Number.isInteger(start) && Number.isInteger(end)) notes.push(`The period was read as ${start}–${end}, but Chapter 3 states ${stated[0].start}–${stated[0].end}; the chapter's period is used.`);
    ({ start, end } = stated[0]);
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start >= end) throw new ModelSpecError("Chapter 3 does not state the period of the data (for example 2000–2023).");
  const last = lastCompleteYear(now);
  if (end > last) {
    notes.push(`Chapter 3 runs to ${end}, but ${last} is the last complete year; the data stops at ${last}.`);
    end = last;
  }
  if (start < EARLIEST_YEAR) {
    notes.push(`The sources start in ${EARLIEST_YEAR}; the data starts there.`);
    start = EARLIEST_YEAR;
  }
  if (start >= end) throw new ModelSpecError("The period Chapter 3 states has no complete years of data yet.");

  const frequencyRaw = cleanText(raw.frequency, 20).toLowerCase();
  const frequency: SpecFrequency = frequencyRaw === "annual" || frequencyRaw === "quarterly" || frequencyRaw === "monthly" ? frequencyRaw : "not stated";
  if (frequency === "quarterly" || frequency === "monthly") {
    notes.push(`Chapter 3 states ${frequency} data, but the dataset is annual (the World Bank publishes yearly figures). The specialist converts it, or the COO corrects Chapter 3.`);
  }

  return {
    variables,
    equation: cleanText(raw.equation, 400),
    period: { start, end },
    frequency,
    technique: cleanText(raw.technique, 120),
    sourcesNamed: (listFrom(raw.sourcesNamed, "sourcesNamed") as unknown[]).map((s) => cleanText(s, 120)).filter(Boolean).slice(0, 12),
    notes,
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ─── The Claude call ─────────────────────────────────────────────────────────

const VARIABLE_SCHEMA = {
  type: "object",
  properties: {
    symbol: { type: "string" },
    name: { type: "string" },
    measure: { type: "string" },
    catalogueKey: { type: "string", enum: [...CATALOGUE_KEYS, "none"] },
  },
  required: ["symbol", "name", "measure", "catalogueKey"],
} as const;

export const MODEL_SPEC_TOOL = {
  name: "record_model_spec",
  description: "Record the econometric model Chapter Three specifies: its variables (each matched to a catalogue entry or none), equation, data period, frequency, technique and named sources.",
  inputSchema: {
    type: "object",
    properties: {
      dependent: VARIABLE_SCHEMA,
      independents: { type: "array", items: VARIABLE_SCHEMA, maxItems: MAX_VARIABLES + 4 },
      equation: { type: "string" },
      periodStart: { type: "integer" },
      periodEnd: { type: "integer" },
      frequency: { type: "string", enum: ["annual", "quarterly", "monthly", "not stated"] },
      technique: { type: "string" },
      sourcesNamed: { type: "array", items: { type: "string" } },
    },
    required: ["dependent", "independents", "equation", "periodStart", "periodEnd", "frequency", "technique", "sourcesNamed"],
  },
} as const;

/** One Claude call (about ₦15–40), then the checks above. */
export async function extractModelSpec(chapterThree: string, opts: { usage?: AiUsageContext; now?: Date } = {}): Promise<ModelSpec> {
  const text = chapterThree.trim();
  if (text.length < 200) throw new ModelSpecError("Chapter 3 is too short to read a model from.");
  const excerpt = relevantSections(text);
  const raw = await callClaudeForJson<RawSpec>({
    system: MODEL_SPEC_TEXT.system,
    user: `${MODEL_SPEC_TEXT.instruction(catalogueForPrompt())}\n\n═══ CHAPTER THREE (the data and model sections) ═══\n\n${excerpt}`,
    toolName: MODEL_SPEC_TOOL.name,
    toolDescription: MODEL_SPEC_TOOL.description,
    inputSchema: MODEL_SPEC_TOOL.inputSchema as unknown as Record<string, unknown>,
    maxTokens: 4096,
    usage: opts.usage,
  });
  return validateSpec(raw, text, opts.now ?? new Date());
}
