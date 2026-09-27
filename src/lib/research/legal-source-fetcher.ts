/**
 * Finding Nigerian court cases for a Law project (D3b).
 *
 * 1. planLegalPoints: one Claude call turns the approved-to-be objectives into
 *    at most 8 legal points that need judicial authority.
 * 2. searchCasesForPoint: one Claude call per point with Anthropic web search
 *    (at most two searches; judy.legal, vLex and NigeriaLII are blocked). The
 *    model records at most 3 cases, each with the result page that names it; a
 *    case whose page the search did not return is dropped, so no case comes
 *    from memory.
 * 3. The caller confirms each case against the Supreme Court's own record
 *    (sources/supreme-court.ts) and stores the judgment PDF.
 *
 * Every sentence sent to Claude is in LEGAL_TEXT for the founder to review.
 */

import { callClaudeForJson, callClaudeWithWebSearch } from "@/lib/anthropic";
import type { AiUsageContext } from "@/lib/ai-usage-log";
import {
  LEGAL_BLOCKED_DOMAINS,
  MAX_POINTS,
  MAX_SOURCES_PER_POINT,
  isBlockedDomain,
  listFrom,
  partyTokens,
  urlInResults,
} from "@/lib/research/source-policy";

export interface SourceContext {
  topic: string;
  department: string;
  objectives: string[];
  universityName?: string | null;
}

export interface FoundCase {
  caseName: string;
  court: string | null;
  year: number | null;
  citation: string | null;
  suitNumber: string | null;
  sourceUrl: string;
  sourceTitle: string | null;
  supports: string;
}

export interface CaseSearchOutcome {
  cases: FoundCase[];
  /** Cases the model recorded that were dropped, and why (kept in the search log). */
  dropped: { caseName: string; reason: string }[];
  searchesUsed: number;
  incomplete: boolean;
  queries: string[];
  resultCount: number;
}

export const LEGAL_TEXT = {
  planSystem:
    "You plan the case-law research for a Nigerian law student's final year project. From the project's topic and objectives, list the legal points on which the project will need to cite a decision of a Nigerian court. " +
    `Rules: at most ${MAX_POINTS} points, the most important first. Each point is one sentence of at most 200 characters, written as a legal question or proposition that a search for Nigerian case law could answer (for example: "Whether a Nigerian court is bound by a plea agreement reached between the prosecution and the defendant"). ` +
    "List only points that need a court decision: a point answered by a statute or the Constitution alone needs no search, because statutes and the Constitution are cited by name. Do not name any case.",
  planTool: "Record the legal points that need judicial authority, most important first.",
  searchSystem: (maxUses: number) =>
    "You find Nigerian court decisions for a law student's research project. You are given one legal point. " +
    `Search the web (at most ${maxUses} ${maxUses === 1 ? "search" : "searches"}) for decisions of Nigerian courts that decide or directly support that point. ` +
    "Rules: record only a case that a search result you received names, and give the URL of that result page exactly as the search returned it. Never record a case from memory, even a well-known one. " +
    "Prefer the Supreme Court of Nigeria, then the Court of Appeal, then the Federal High Court, State High Courts and the National Industrial Court. " +
    "Give the case name as the page gives it (the parties, joined by \"v.\"), the court, the year, and the law report citation or suit number only when the page states them; leave a field empty rather than guess. " +
    `Record at most ${MAX_SOURCES_PER_POINT} cases, the ones that decide the point most directly, each with one sentence on how it supports the point. If the results name no Nigerian case on this point, record an empty list. ` +
    "When you have finished searching, call record_cases once, on its own.",
  searchUser: (ctx: SourceContext, point: string) =>
    [
      `Project topic: ${ctx.topic}`,
      `Department: ${ctx.department}`,
      `Legal point: ${point}`,
      "Search as a Nigerian law researcher would, for example the point's key terms with \"Supreme Court\" or \"Court of Appeal\" and \"Nigeria\".",
    ].join("\n"),
  recordTool: "Record the Nigerian court cases found on the pages your searches returned, with the URL of the page that names each one.",
} as const;

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    points: {
      type: "array",
      maxItems: MAX_POINTS,
      items: { type: "string", description: "One legal point, at most 200 characters." },
    },
  },
  required: ["points"],
} as const;

const RECORD_SCHEMA = {
  type: "object",
  properties: {
    cases: {
      type: "array",
      maxItems: MAX_SOURCES_PER_POINT,
      items: {
        type: "object",
        properties: {
          caseName: { type: "string", description: "The parties as the page gives them, joined by \"v.\"" },
          court: { type: ["string", "null"], description: "The court that decided it, e.g. Supreme Court of Nigeria" },
          year: { type: ["integer", "null"], description: "The year of the decision, if the page states it" },
          citation: { type: ["string", "null"], description: "The law report citation, if the page states it" },
          suitNumber: { type: ["string", "null"], description: "The suit or appeal number, if the page states it" },
          sourceUrl: { type: "string", description: "The URL of the search result page that names this case" },
          supports: { type: "string", description: "One sentence: how this case decides or supports the point" },
        },
        required: ["caseName", "sourceUrl", "supports"],
      },
    },
  },
  required: ["cases"],
} as const;

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

/** Keeps a planner's points usable: trimmed, distinct, at most 200 characters, at most MAX_POINTS. */
export function cleanPoints(raw: unknown): string[] {
  const out: string[] = [];
  for (const p of listFrom(raw, "points")) {
    const t = text(p, 200);
    if (t && t.length >= 12 && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= MAX_POINTS) break;
  }
  return out;
}

export async function planLegalPoints(ctx: SourceContext, usage: AiUsageContext): Promise<string[]> {
  const result = await callClaudeForJson<{ points?: unknown }>({
    system: LEGAL_TEXT.planSystem,
    user: [
      `Project topic: ${ctx.topic}`,
      `Department: ${ctx.department}`,
      "Objectives:",
      ...ctx.objectives.map((o, i) => `${i + 1}. ${o}`),
    ].join("\n"),
    toolName: "record_legal_points",
    toolDescription: LEGAL_TEXT.planTool,
    inputSchema: PLAN_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1500,
    usage,
  });
  return cleanPoints(result.points);
}

/**
 * Keeps only honest records: a name with a distinctive party, a URL the search
 * really returned, never a blocked site; at most MAX_SOURCES_PER_POINT; one row
 * per case. Pure, so check:sources proves it.
 */
export function vetRecordedCases(
  raw: unknown,
  results: { url: string; title: string }[],
): { cases: FoundCase[]; dropped: { caseName: string; reason: string }[] } {
  const list = listFrom(raw, "cases");
  const urls = results.map((r) => r.url);
  const cases: FoundCase[] = [];
  const dropped: { caseName: string; reason: string }[] = [];
  // One row per case: names whose party words are all contained in another name are the same case ("Igbinedion v. FRN").
  const seen: string[][] = [];
  const sameCase = (a: string[], b: string[]) => a.every((t) => b.includes(t)) || b.every((t) => a.includes(t));
  for (const item of list) {
    const c = (item ?? {}) as Record<string, unknown>;
    const caseName = text(c.caseName, 300);
    const sourceUrl = text(c.sourceUrl, 1000);
    if (!caseName) continue;
    if (!sourceUrl || !urlInResults(sourceUrl, urls)) {
      dropped.push({ caseName, reason: "its page was not among the search results" });
      continue;
    }
    if (isBlockedDomain(sourceUrl)) {
      dropped.push({ caseName, reason: "found on a site whose terms forbid automated collection" });
      continue;
    }
    const tokens = partyTokens(caseName);
    if (tokens.length === 0) {
      dropped.push({ caseName, reason: "the name has no distinctive party" });
      continue;
    }
    if (seen.some((t) => sameCase(t, tokens))) continue;
    seen.push(tokens);
    const year = typeof c.year === "number" && c.year >= 1900 && c.year <= 2100 ? Math.trunc(c.year) : null;
    cases.push({
      caseName,
      court: text(c.court, 120),
      year,
      citation: text(c.citation, 160),
      suitNumber: text(c.suitNumber, 80),
      sourceUrl,
      sourceTitle: results.find((r) => urlInResults(sourceUrl, [r.url]))?.title ?? null,
      supports: text(c.supports, 400) ?? "",
    });
    if (cases.length >= MAX_SOURCES_PER_POINT) break;
  }
  return { cases, dropped };
}

/** One point, one Claude call, at most `maxUses` web searches (the caller enforces the project's 16). */
export async function searchCasesForPoint(ctx: SourceContext, point: string, maxUses: number, usage: AiUsageContext): Promise<CaseSearchOutcome> {
  if (maxUses < 1) return { cases: [], dropped: [], searchesUsed: 0, incomplete: false, queries: [], resultCount: 0 };
  const call = await callClaudeWithWebSearch<{ cases?: unknown }>({
    system: LEGAL_TEXT.searchSystem(maxUses),
    user: LEGAL_TEXT.searchUser(ctx, point),
    toolName: "record_cases",
    toolDescription: LEGAL_TEXT.recordTool,
    inputSchema: RECORD_SCHEMA as unknown as Record<string, unknown>,
    // No user_location: the API refuses Nigeria ("Country code NG is not supported"); the queries name Nigeria instead.
    webSearch: { maxUses, blockedDomains: [...LEGAL_BLOCKED_DOMAINS] },
    usage,
  });
  const { cases, dropped } = vetRecordedCases(call.record, call.results);
  return {
    cases,
    dropped,
    searchesUsed: call.searchesUsed,
    incomplete: call.incomplete,
    queries: call.queries,
    resultCount: call.results.length,
  };
}
