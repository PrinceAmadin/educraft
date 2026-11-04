/**
 * The optional Claude voice rubric for the rewrite test. OFF by default
 * (`screening_rewrite_claude`); when on, it runs after a submission in the
 * background and stores one advisory line for the COO — it never changes the
 * automatic phrase-scan score or the outcome, and a failure is swallowed.
 *
 * Kept apart from the pure `rewrite.ts` so the scorer carries no Claude import.
 */

import { callClaudeForJson } from "@/lib/anthropic";

const SYSTEM = [
  "You are a careful editor for EduCraft, a Nigerian academic-writing service.",
  "A job applicant was given one AI-sounding paragraph and asked to rewrite it in a plain, specific, human academic voice — keeping the meaning, dropping stock phrases, hype, filler transitions, meta-commentary and first person.",
  "Judge their rewrite on two things: does it read as written by a careful person (not AI), and does it keep the original's meaning without inventing facts.",
  "Score 0 to 100 (0 = still plainly AI or meaning lost; 100 = natural, faithful and clean). Be fair but not generous. Then write one short sentence the reviewer can read at a glance.",
] as const;

const TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    score: { type: "integer", description: "0 to 100." },
    note: { type: "string", description: "One short sentence on the rewrite's voice and faithfulness." },
  },
  required: ["score", "note"],
};

/** Returns the advisory line (e.g. "Voice rubric: 82/100 — reads human; keeps the meaning."), or null on any failure. */
export async function runRewriteRubric(original: string, rewrite: string): Promise<string | null> {
  try {
    const reply = await callClaudeForJson<{ score?: number; note?: string }>({
      system: SYSTEM.join("\n"),
      user: `ORIGINAL (AI-sounding):\n${original}\n\nTHE APPLICANT'S REWRITE:\n${rewrite}`,
      toolName: "record_rewrite_review",
      toolDescription: "Record the voice-and-faithfulness verdict on one rewrite.",
      inputSchema: TOOL_SCHEMA,
      maxTokens: 800,
      timeoutMs: 60_000,
      usage: { subsystem: "screening", step: "rewrite_rubric" },
    });
    const score = Number(reply.score);
    const note = typeof reply.note === "string" ? reply.note.trim() : "";
    if (!Number.isFinite(score)) return null;
    const clamped = Math.max(0, Math.min(100, Math.round(score)));
    return `Voice rubric: ${clamped}/100${note ? ` — ${note}` : ""}`;
  } catch (error) {
    console.error("[screening] rewrite rubric failed:", error);
    return null;
  }
}
