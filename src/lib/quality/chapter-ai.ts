/**
 * The quality gate's two AI checks for ONE chapter: the voice review and the
 * citation-support batch. Shared by the report gate (src/lib/quality-gate.ts)
 * and the chapter gate (src/lib/services/chapter-gate.ts), so both send the
 * same prompts and key their results the same way: a chapter the chapter gate
 * already checked costs the report gate nothing (30 Sept 2026).
 */

import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { callClaudeForJson } from "@/lib/anthropic";
import { ABSTRACT_CHARS, noAbstract, readSupportVerdicts, supportPairs, SUPPORT_TOOL, type CitationMatch, type GateReference, type SupportPair, type SupportResult } from "./citation-check";
import type { ProseParagraph } from "./prose";
import { QUALITY_TEXT } from "./text";
import { validateAiVoiceFindings, VOICE_TOOL, type VoiceFinding } from "./voice-scan";

/** Bump when an AI prompt or tool changes, so cached AI results are not reused across the change. */
export const AI_CACHE_VERSION = "d8-1";
/** The AI usage log's subsystem for both gates. */
export const QUALITY_SUBSYSTEM = "quality_gate";
/** The chapter gate's AI calls (kept out of the report run's own cost). */
export const CHAPTER_CHECK_STEPS = { voice: "chapter_voice", support: "chapter_support" } as const;

export const sha32 = (s: string) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 32);

export interface StoredVoice {
  hash: string;
  findings: VoiceFinding[];
  readsHuman: boolean | null;
  note: string | null;
  dropped: number;
}

export interface StoredSupport {
  index: number;
  chapter: number;
  paragraph: number | null;
  sentence: string;
  refId: string;
  verdict: SupportResult["verdict"];
  reason: string;
}

export interface StoredSupportSet {
  hash: string;
  results: StoredSupport[];
  checked: number;
  total: number;
}

/** The AI results of a set of chapters, keyed by chapter number (as the report gate stores them). */
export interface AiByChapter {
  voice: Record<string, StoredVoice>;
  support: Record<string, StoredSupportSet>;
  errors: string[];
}

export const voiceHashFor = (text: string) => sha32(`${AI_CACHE_VERSION}|voice|${text}`);
export const supportHashFor = (text: string, pairs: SupportPair[]) => sha32(`${AI_CACHE_VERSION}|support|${text}|${pairs.map((p) => `${p.ref.id}:${p.ref.abstract?.length ?? 0}`).join(",")}`);

let rulesText: Promise<string> | null = null;
/** The two rule files the generator was given, read once per process (prompts/shared, traced into the function bundle). */
export function voiceRules(): Promise<string> {
  rulesText ??= Promise.all(
    ["anti_ai_rules.md", "voice_rules.md"].map((f) => readFile(path.join(process.cwd(), "prompts", "shared", f), "utf8").then((t) => t.replace(/\r\n/g, "\n").trim())),
  ).then(([anti, voice]) => `=== ANTI-AI RULES (prompts/shared/anti_ai_rules.md) ===\n${anti}\n\n=== VOICE RULES (prompts/shared/voice_rules.md) ===\n${voice}`);
  rulesText.catch(() => (rulesText = null));
  return rulesText;
}

/** "[2.1 Background of the Study]\n¶1 …" for the voice review. */
export function formatParagraphs(paras: { index: number; section: string | null; text: string }[]): string {
  const lines: string[] = [];
  let section: string | null | undefined;
  for (const p of paras) {
    if (p.section !== section) {
      section = p.section;
      if (section) lines.push("", `[${section}]`);
    }
    lines.push(`¶${p.index} ${p.text}`);
  }
  return lines.join("\n").trim();
}

/** Runs `tasks` at most `limit` at a time. */
export async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      out[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}

/**
 * The calls one chapter still needs, as tasks that write into `out`. A result
 * with the same hash (from the report's last run, or from the chapter gate) is
 * reused without a call; a failed call writes nothing and is tried again next time.
 */
export function chapterAiTasks(a: {
  projectDbId: string;
  projectCode: string;
  title: string;
  department: string;
  chapter: { number: number; text: string };
  paragraphs: ProseParagraph[];
  scan: VoiceFinding[];
  match: CitationMatch;
  reuseVoice: (hash: string) => StoredVoice | null;
  reuseSupport: (hash: string) => StoredSupportSet | null;
  out: AiByChapter;
  usage: { subsystem: string; voiceStep: string; supportStep: string };
}): (() => Promise<void>)[] {
  const { chapter: ch, out } = a;
  const key = String(ch.number);
  const tasks: (() => Promise<void>)[] = [];
  const usage = (step: string) => ({ projectId: a.projectDbId, subsystem: a.usage.subsystem, step, chapterNumber: ch.number });

  const voiceHash = voiceHashFor(ch.text);
  const cachedVoice = a.reuseVoice(voiceHash);
  if (cachedVoice) out.voice[key] = cachedVoice;
  else {
    tasks.push(async () => {
      const chapterParas = a.paragraphs.filter((p) => p.chapter === ch.number);
      if (!chapterParas.length) return;
      try {
        const raw = await callClaudeForJson<unknown>({
          system: `${QUALITY_TEXT.voiceSystem}\n\n${await voiceRules()}`,
          cacheSystem: true,
          user: QUALITY_TEXT.voiceUser({
            title: a.title,
            department: a.department,
            chapter: ch.number,
            paragraphs: formatParagraphs(chapterParas),
            flagged: a.scan.filter((f) => f.chapter === ch.number).map((f) => `- ¶${f.paragraph} "${f.quote}" (${f.rule})`).join("\n"),
          }),
          toolName: VOICE_TOOL.name,
          toolDescription: VOICE_TOOL.description,
          inputSchema: VOICE_TOOL.input_schema as unknown as Record<string, unknown>,
          maxTokens: 4096,
          usage: usage(a.usage.voiceStep),
        });
        const v = validateAiVoiceFindings(raw, ch.number, a.paragraphs);
        if (v.dropped) console.warn(`[quality] ${a.projectCode} ch${ch.number}: ${v.dropped} voice finding(s) dropped (quote not in the paragraph)`);
        out.voice[key] = { hash: voiceHash, ...v };
      } catch (error) {
        out.errors.push(`Voice review of Chapter ${ch.number} failed: ${(error as Error).message}`);
      }
    });
  }

  const { pairs, total } = supportPairs(a.match, ch.number);
  const supportHash = supportHashFor(ch.text, pairs);
  const cachedSupport = a.reuseSupport(supportHash);
  if (cachedSupport) out.support[key] = cachedSupport;
  else if (pairs.length) {
    tasks.push(async () => {
      const toAsk = pairs.filter((p) => !noAbstract(p));
      const results: SupportResult[] = pairs.filter(noAbstract).map((p) => ({ ...p, verdict: "CANNOT_DETERMINE", reason: "No abstract on record." }));
      try {
        if (toAsk.length) {
          const raw = await callClaudeForJson<unknown>({
            system: QUALITY_TEXT.supportSystem,
            user: QUALITY_TEXT.supportUser({
              title: a.title,
              chapter: ch.number,
              items: toAsk
                .map((p) =>
                  QUALITY_TEXT.supportItem({
                    index: p.index,
                    sentence: p.sentence,
                    ref: `${p.ref.authors ?? "Unknown"} (${p.ref.year ?? "n.d."}). ${p.ref.title ?? p.ref.proposedTitle}.${p.ref.journal ? ` ${p.ref.journal}.` : ""}`,
                    abstract: (p.ref.abstract ?? "").replace(/\s+/g, " ").slice(0, ABSTRACT_CHARS),
                  }),
                )
                .join("\n\n"),
            }),
            toolName: SUPPORT_TOOL.name,
            toolDescription: SUPPORT_TOOL.description,
            inputSchema: SUPPORT_TOOL.input_schema as unknown as Record<string, unknown>,
            maxTokens: 4096,
            usage: usage(a.usage.supportStep),
          });
          results.push(...readSupportVerdicts(raw, toAsk));
        }
        out.support[key] = {
          hash: supportHash,
          checked: pairs.length,
          total,
          results: results.sort((x, y) => x.index - y.index).map((r) => ({ index: r.index, chapter: r.chapter, paragraph: r.paragraph, sentence: r.sentence, refId: r.ref.id, verdict: r.verdict, reason: r.reason })),
        };
      } catch (error) {
        out.errors.push(`Citation support check of Chapter ${ch.number} failed: ${(error as Error).message}`);
      }
    });
  }
  return tasks;
}

/** The stored AI results as finishReport takes them. */
export function aiResultsFrom(ai: AiByChapter, references: GateReference[]) {
  const byId = new Map(references.map((r) => [r.id, r]));
  const supportResults: SupportResult[] = Object.values(ai.support).flatMap((s) =>
    s.results.flatMap((r) => {
      const ref = byId.get(r.refId);
      return ref ? [{ index: r.index, chapter: r.chapter, paragraph: r.paragraph, sentence: r.sentence, ref, verdict: r.verdict, reason: r.reason }] : [];
    }),
  );
  return {
    voice: Object.values(ai.voice).flatMap((v) => v.findings),
    voiceNotes: Object.entries(ai.voice).map(([k, v]) => ({ chapter: Number(k), readsHuman: v.readsHuman, note: v.note })),
    support: {
      results: supportResults,
      checked: Object.values(ai.support).reduce((n, s) => n + s.checked, 0),
      total: Object.values(ai.support).reduce((n, s) => n + s.total, 0),
    },
  };
}
