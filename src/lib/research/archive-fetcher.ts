/**
 * Finding archival sources for a History project (D3b).
 *
 * 1. planArchivePoints: one Claude call turns the objectives into at most 8
 *    historical questions, each with two catalogue queries aimed at named,
 *    switched-on sources (source-policy.ts).
 * 2. runArchiveQuery: one query to one source = one search against the
 *    project's 16. Attempt 2 runs only for a point attempt 1 left empty.
 * 3. judgeArchiveResults: one Claude call per round picks 0–3 records per
 *    point that really bear on it, with a line on why.
 *
 * Only catalogue records are read (title, date, holder, reference, link); no
 * document is downloaded or copied. Every sentence sent to Claude is in
 * ARCHIVE_TEXT for the founder to review.
 */

import { callClaudeForJson } from "@/lib/anthropic";
import type { AiUsageContext } from "@/lib/ai-usage-log";
import {
  ATTEMPTS_PER_POINT,
  MAX_POINTS,
  MAX_SOURCES_PER_POINT,
  enabledArchiveSources,
  isEnabledArchiveSource,
  listFrom,
  type ArchiveRecord,
  type ArchiveSourceKey,
} from "@/lib/research/source-policy";
import { searchDspace } from "@/lib/research/sources/dspace";
import { searchHansard } from "@/lib/research/sources/hansard";
import { searchInternetArchive } from "@/lib/research/sources/internet-archive";
import { searchNationalArchives } from "@/lib/research/sources/national-archives";
import { searchWellcome } from "@/lib/research/sources/wellcome";
import type { SourceContext } from "@/lib/research/legal-source-fetcher";

export interface ArchiveAttempt {
  source: ArchiveSourceKey;
  query: string;
  fromYear: number | null;
  toYear: number | null;
}

export interface ArchivePoint {
  text: string;
  attempts: ArchiveAttempt[];
}

export const ARCHIVE_TEXT = {
  planSystem: () =>
    "You plan the archival research for a Nigerian university student's history project. From the project's topic and objectives, list the historical questions on which the project needs a primary record: an official file, a parliamentary debate, a colonial report or gazette, a manuscript, or a Nigerian thesis that studies the question. " +
    `Rules: at most ${MAX_POINTS} questions, the most important first, each one sentence of at most 200 characters. ` +
    `For each question give ${ATTEMPTS_PER_POINT} catalogue searches, each to a different collection where you can, the better one first. These catalogues only return records that contain EVERY word searched, so a search is 1 to 3 distinctive keywords (a place and one subject word, such as "Benin Province" or "Nigeria taxation"; never a sentence, no quotation marks), sent to ONE of these collections, chosen for what it holds:\n` +
    enabledArchiveSources()
      .map((s) => `- ${s.key}: ${s.label}. Holds ${s.holds}.`)
      .join("\n") +
    "\nHANSARD searches debate titles only: give it at most two broad words, such as \"Nigeria taxation\". Use WELLCOME only for questions about medicine or public health. Give a year range (fromYear, toYear) when the question concerns a period; otherwise leave them empty. Do not name any document.",
  planTool: "Record the historical questions and the two catalogue searches for each.",
  judgeSystem:
    "You check catalogue records found for a Nigerian history project. For each question you are given the records a catalogue search returned. " +
    `Keep at most ${MAX_SOURCES_PER_POINT} records per question: only records that are evidence on that question (a record about something else, or only loosely related, is not kept). ` +
    "For each record kept, write one sentence on what it can show for the question, based only on its title, date and description; do not claim anything they do not state. If no record bears on a question, keep none.",
  judgeTool: "Record, for each question, the records that bear on it and why.",
} as const;

const PLAN_SCHEMA = () => ({
  type: "object",
  properties: {
    points: {
      type: "array",
      maxItems: MAX_POINTS,
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "The historical question, at most 200 characters." },
          attempts: {
            type: "array",
            maxItems: ATTEMPTS_PER_POINT,
            items: {
              type: "object",
              properties: {
                source: { type: "string", enum: enabledArchiveSources().map((s) => s.key) },
                query: { type: "string", description: "1 to 3 distinctive catalogue keywords." },
                fromYear: { type: ["integer", "null"] },
                toYear: { type: ["integer", "null"] },
              },
              required: ["source", "query"],
            },
          },
        },
        required: ["text", "attempts"],
      },
    },
  },
  required: ["points"],
});

const year = (v: unknown): number | null => (typeof v === "number" && v >= 1400 && v <= 2100 ? Math.trunc(v) : null);

/** Keeps a planner's answer usable: switched-on sources only, short keyword queries, at most 8 points × 2 attempts. Pure. */
export function cleanArchivePlan(raw: unknown): ArchivePoint[] {
  const list = listFrom(raw, "points");
  const out: ArchivePoint[] = [];
  for (const p of list) {
    const item = (p ?? {}) as { text?: unknown; attempts?: unknown };
    const text = typeof item.text === "string" ? item.text.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    if (text.length < 12 || out.some((o) => o.text.toLowerCase() === text.toLowerCase())) continue;
    const attempts: ArchiveAttempt[] = [];
    for (const a of listFrom(item.attempts, "attempts")) {
      const att = (a ?? {}) as { source?: unknown; query?: unknown; fromYear?: unknown; toYear?: unknown };
      const source = typeof att.source === "string" ? att.source : "";
      const query = typeof att.query === "string" ? att.query.replace(/["“”]/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 4).join(" ") : ""; // catalogues match every word: long queries find nothing
      if (!isEnabledArchiveSource(source) || query.length < 3) continue;
      let fromYear = year(att.fromYear);
      let toYear = year(att.toYear);
      if (fromYear && toYear && fromYear > toYear) [fromYear, toYear] = [toYear, fromYear];
      attempts.push({ source, query, fromYear, toYear });
      if (attempts.length >= ATTEMPTS_PER_POINT) break;
    }
    if (attempts.length === 0) continue;
    out.push({ text, attempts });
    if (out.length >= MAX_POINTS) break;
  }
  return out;
}

export async function planArchivePoints(ctx: SourceContext, usage: AiUsageContext): Promise<ArchivePoint[]> {
  const reply = await callClaudeForJson<unknown>({
    system: ARCHIVE_TEXT.planSystem(),
    user: [`Project topic: ${ctx.topic}`, `Department: ${ctx.department}`, "Objectives:", ...ctx.objectives.map((o, i) => `${i + 1}. ${o}`)].join("\n"),
    toolName: "record_archive_plan",
    toolDescription: ARCHIVE_TEXT.planTool,
    inputSchema: PLAN_SCHEMA(),
    maxTokens: 2500,
    usage,
  });
  return cleanArchivePlan(reply);
}

/** One catalogue query = one search against the project's 16. */
export async function runArchiveQuery(attempt: ArchiveAttempt): Promise<ArchiveRecord[]> {
  switch (attempt.source) {
    case "HANSARD":
      return searchHansard(attempt.query, attempt.fromYear, attempt.toYear);
    case "INTERNET_ARCHIVE":
      return searchInternetArchive(attempt.query, attempt.fromYear, attempt.toYear);
    case "WELLCOME":
      return searchWellcome(attempt.query);
    case "NATIONAL_ARCHIVES":
      return searchNationalArchives(attempt.query);
    case "UNILAG":
    case "ABU":
    case "NATIONAL_LIBRARY":
    case "IBADAN":
      return searchDspace(attempt.source, attempt.query);
  }
}

export interface JudgeInput {
  pointIndex: number;
  point: string;
  records: ArchiveRecord[];
}

export interface KeptRecord {
  pointIndex: number;
  record: ArchiveRecord;
  relevance: string;
}

export function judgeUserPrompt(items: JudgeInput[]): string {
  const lines: string[] = [];
  for (const item of items) {
    lines.push(`Question ${item.pointIndex + 1}: ${item.point}`);
    if (item.records.length === 0) lines.push("  (no records)");
    item.records.forEach((r, i) => {
      const parts = [r.title, r.date, r.holder, r.reference, r.recordType === "Thesis" ? "thesis" : null].filter(Boolean).join(" | ");
      lines.push(`  [${i + 1}] ${parts}${r.description ? `\n      ${r.description}` : ""}`);
    });
    lines.push("");
  }
  return lines.join("\n");
}

/** Maps the judge's answer back to records: only indexes that exist, at most 3 per point, no repeats. Pure. */
export function readJudgement(raw: unknown, items: JudgeInput[]): KeptRecord[] {
  const answers = listFrom(raw, "points");
  const kept: KeptRecord[] = [];
  for (const a of answers) {
    const ans = (a ?? {}) as { question?: unknown; keep?: unknown };
    const item = items.find((i) => i.pointIndex + 1 === ans.question);
    if (!item) continue;
    const used = new Set<number>();
    for (const k of listFrom(ans.keep, "keep")) {
      const keep = (k ?? {}) as { record?: unknown; relevance?: unknown };
      const n = typeof keep.record === "number" ? Math.trunc(keep.record) : NaN;
      if (!(n >= 1 && n <= item.records.length) || used.has(n)) continue;
      used.add(n);
      const relevance = typeof keep.relevance === "string" ? keep.relevance.replace(/\s+/g, " ").trim().slice(0, 400) : "";
      kept.push({ pointIndex: item.pointIndex, record: item.records[n - 1], relevance });
      if (used.size >= MAX_SOURCES_PER_POINT) break;
    }
  }
  return kept;
}

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    points: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "integer", description: "The question number" },
          keep: {
            type: "array",
            maxItems: MAX_SOURCES_PER_POINT,
            items: {
              type: "object",
              properties: {
                record: { type: "integer", description: "The record number within that question" },
                relevance: { type: "string", description: "One sentence: what it can show for the question" },
              },
              required: ["record", "relevance"],
            },
          },
        },
        required: ["question", "keep"],
      },
    },
  },
  required: ["points"],
} as const;

export async function judgeArchiveResults(ctx: SourceContext, items: JudgeInput[], usage: AiUsageContext): Promise<KeptRecord[]> {
  const withRecords = items.filter((i) => i.records.length > 0);
  if (withRecords.length === 0) return [];
  const reply = await callClaudeForJson<unknown>({
    system: ARCHIVE_TEXT.judgeSystem,
    user: `Project topic: ${ctx.topic}\n\n${judgeUserPrompt(withRecords)}`,
    toolName: "record_kept_records",
    toolDescription: ARCHIVE_TEXT.judgeTool,
    inputSchema: JUDGE_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 3000,
    usage,
  });
  return readJudgement(reply, withRecords);
}
