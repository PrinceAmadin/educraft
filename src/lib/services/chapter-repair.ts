/**
 * Surgical chapter repair — the service side (3 Nov 2026). One Claude call
 * (~₦30–60, subsystem quality_gate, step chapter_repair) returns exact
 * find→replace pairs for a failed chapter check; they are applied only where
 * the anchor occurs verbatim and exactly once, the patched text is written
 * back compare-and-set on the text it repaired (the data-pause blank-filling
 * pattern), and the next orchestrator tick checks the new text. The rules —
 * which failures are repairable, when repair runs before rewrite — are pure
 * and live in src/lib/quality/chapter-gate.ts and chapter-repair.ts.
 */

import { callClaudeForJson, type ClaudeEffort } from "@/lib/anthropic";
import { db } from "@/lib/db";
import { allRepairable, MAX_GATE_REPAIRS, repairsSettingAllowed, REPAIRS_SETTING, failureLines } from "@/lib/quality/chapter-gate";
import { applyRepairs, parseRepairs, REPAIR_STEP, REPAIR_TEXT, REPAIRS_SCHEMA } from "@/lib/quality/chapter-repair";
import { chapterTextHash } from "@/lib/quality/chapter-hash";
import { QUALITY_SUBSYSTEM } from "@/lib/quality/chapter-ai";
import type { QualityItem } from "@/lib/quality/types";

const TAG = "[chapter repair]";

/** The repair call runs at low effort on purpose: it is an editor, not an author. */
const REPAIR_EFFORT: ClaudeEffort = "low";
const REPAIR_MAX_TOKENS = 6_000;

export class ChapterRepairError extends Error {
  constructor(
    message: string,
    readonly transient = false,
  ) {
    super(message);
  }
}

export async function maxRepairsSetting(): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: REPAIRS_SETTING }, select: { value: true } }).catch(() => null);
  return repairsSettingAllowed(row?.value);
}

export interface RepairOutcome {
  applied: number;
  refused: number;
  newHash: string;
}

/**
 * Repairs one chapter's AI text in place. Throws ChapterRepairError: transient
 * when the same call is worth trying again unchanged (a dropped connection, the
 * text changed under us), final when the attempt is spent (the attempt counter
 * is bumped either way, so a repair that fixes nothing cannot loop — after
 * MAX_GATE_REPAIRS the gate falls back to a rewrite or hands the draft over).
 */
export async function repairChapterText(projectDbId: string, chapter: number): Promise<RepairOutcome> {
  const [cp, project] = await Promise.all([
    db.generationCheckpoint.findUnique({
      where: { projectId_chapterNumber: { projectId: projectDbId, chapterNumber: chapter } },
      select: { id: true, status: true, fullOutput: true, outputHash: true, gateRepairNo: true },
    }),
    db.project.findUnique({ where: { id: projectDbId }, select: { projectTitle: true, projectId: true } }),
  ]);
  if (!cp || cp.status !== "COMPLETED" || !cp.fullOutput || !cp.outputHash) {
    throw new ChapterRepairError(`Chapter ${chapter} has no completed text to repair.`);
  }
  const maxRepairs = await maxRepairsSetting();
  if (cp.gateRepairNo >= maxRepairs) throw new ChapterRepairError(`Chapter ${chapter} has used its ${maxRepairs} repair(s).`);

  const check = await db.chapterCheck.findUnique({
    where: { projectId_chapterNumber_subject_textHash: { projectId: projectDbId, chapterNumber: chapter, subject: "AI_TEXT", textHash: cp.outputHash } },
    select: { status: true, failures: true },
  });
  if (check?.status !== "FAILED") throw new ChapterRepairError(`Chapter ${chapter}'s current text has no settled failed check.`);
  const failures = Array.isArray(check.failures) ? (check.failures as unknown as QualityItem[]) : [];
  if (!allRepairable(failures)) {
    throw new ChapterRepairError(`Chapter ${chapter}'s failures are not all repairable in place — the gate decides a rewrite instead.`);
  }

  // Only a REF failure needs the verified list: the model may swap an invented
  // citation for a listed work, or remove it — never invent one.
  const references = failures.some((f) => f.id === "REF")
    ? (
        await db.reference.findMany({
          where: { projectId: projectDbId, status: "KEPT" },
          select: { authors: true, year: true, title: true, journal: true },
          orderBy: { authors: "asc" },
        })
      ).map((r) => `${r.authors ?? "Unknown"} (${r.year ?? "n.d."}). ${r.title}${r.journal ? `. ${r.journal}` : ""}`)
    : null;

  // The attempt is counted BEFORE the call: the money is spent whatever comes
  // back, and an uncounted failure would retry for ever. Compare-and-set so two
  // ticks cannot both take the same attempt.
  const took = await db.generationCheckpoint.updateMany({
    where: { id: cp.id, outputHash: cp.outputHash, gateRepairNo: cp.gateRepairNo },
    data: { gateRepairNo: cp.gateRepairNo + 1 },
  });
  if (took.count === 0) throw new ChapterRepairError(`Chapter ${chapter}'s text moved on; the repair is decided again.`, true);

  let raw: unknown;
  try {
    raw = await callClaudeForJson<unknown>({
      system: REPAIR_TEXT.system,
      cacheSystem: true,
      user: REPAIR_TEXT.user({
        chapter,
        title: project?.projectTitle ?? "the report",
        lines: failureLines(failures),
        references,
        text: cp.fullOutput,
      }),
      toolName: REPAIR_TEXT.toolName,
      toolDescription: REPAIR_TEXT.toolDescription,
      inputSchema: REPAIRS_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: REPAIR_MAX_TOKENS,
      effort: REPAIR_EFFORT,
      usage: { projectId: projectDbId, subsystem: QUALITY_SUBSYSTEM, step: REPAIR_STEP, chapterNumber: chapter },
    });
  } catch (error) {
    // The attempt is spent (and logged); the gate's counters decide what is next.
    throw new ChapterRepairError(`The repair call failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const patches = parseRepairs(raw);
  const out = applyRepairs(cp.fullOutput, patches);
  for (const r of out.refused) console.warn(`${TAG} ${project?.projectId ?? projectDbId} Ch.${chapter}: refused a patch — ${r.reason}`);
  if (out.applied.length === 0) {
    throw new ChapterRepairError(`Chapter ${chapter}: none of the ${patches.length} patch(es) could be applied safely.`);
  }

  const newHash = chapterTextHash(out.text);
  // Compare-and-set on the text the patches were computed from, exactly like the
  // data pause's blank filling: a chapter re-generated meanwhile is never overwritten.
  const wrote = await db.generationCheckpoint.updateMany({
    where: { id: cp.id, status: "COMPLETED", outputHash: cp.outputHash },
    data: { fullOutput: out.text, partialOutput: out.text, outputHash: newHash },
  });
  if (wrote.count === 0) throw new ChapterRepairError(`Chapter ${chapter}'s text changed while it was being repaired; nothing was written.`, true);

  console.info(`${TAG} ${project?.projectId ?? projectDbId} Ch.${chapter}: ${out.applied.length} patch(es) applied, ${out.refused.length} refused; the new text is checked next.`);
  return { applied: out.applied.length, refused: out.refused.length, newHash };
}

export { MAX_GATE_REPAIRS };
