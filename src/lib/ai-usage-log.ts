import { waitUntil } from "@vercel/functions";
import { db } from "@/lib/db";
import { rollUpAiExpense } from "@/lib/services/expenses";
import { costUsd, usdToNairaRate } from "@/lib/ai-pricing";

export { costUsd, usdToNairaRate } from "@/lib/ai-pricing";

export interface AiUsageContext {
  /** Project.id (not the EC-XXXXX code). */
  projectId?: string;
  subsystem: string;
  step: string;
  chapterNumber?: number;
}

export interface AiUsageRecord extends AiUsageContext {
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** usage.server_tool_use.web_search_requests: each search is billed on top of the tokens. */
  webSearchRequests?: number;
  /** usage.cache_creation_input_tokens / cache_read_input_tokens (not included in inputTokens). */
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  durationMs: number;
  status: "success" | "error";
}

/**
 * Best-effort: a logging failure must never break the Claude call it
 * describes. Every logged call also keeps the day's Operations Reserve
 * expense for that project/subsystem in step (Phase 2: Claude costs flow
 * into Expenses automatically as API cost).
 */
export async function logAiUsage(rec: AiUsageRecord): Promise<void> {
  try {
    const usd = costUsd(rec.model, rec.inputTokens, rec.outputTokens, rec.webSearchRequests ?? 0, {
      writeTokens: rec.cacheWriteTokens,
      readTokens: rec.cacheReadTokens,
    });
    const project = rec.projectId
      ? await db.project.findUnique({ where: { id: rec.projectId }, select: { workerId: true } })
      : null;
    const log = await db.aiUsageLog.create({
      data: {
        projectId: rec.projectId ?? null,
        workerId: project?.workerId ?? null,
        subsystem: rec.subsystem,
        step: rec.step,
        chapterNumber: rec.chapterNumber ?? null,
        model: rec.model,
        inputTokens: rec.inputTokens,
        outputTokens: rec.outputTokens,
        cacheWriteTokens: rec.cacheWriteTokens ?? 0,
        cacheReadTokens: rec.cacheReadTokens ?? 0,
        webSearchRequests: rec.webSearchRequests ?? 0,
        costUsd: usd,
        costNaira: usd * usdToNairaRate(),
        durationMs: rec.durationMs,
        status: rec.status,
      },
      select: { createdAt: true },
    });
    await rollUpAiExpense({ day: log.createdAt, subsystem: rec.subsystem, projectId: rec.projectId ?? null });
    // D10: fires at most once per calendar month per threshold; a read-only check when the threshold is
    // not set, so the call is cheap. Sent in waitUntil so the Claude call it describes never waits on Gmail.
    waitUntil(
      (async () => {
        try {
          const { checkMonthlyThreshold } = await import("@/lib/services/ai-usage-alerts");
          await checkMonthlyThreshold();
        } catch (error) {
          console.error("[ai-usage] threshold check threw", error);
        }
      })(),
    );
  } catch (error) {
    console.error("[ai-usage] failed to log call", error);
  }
}
