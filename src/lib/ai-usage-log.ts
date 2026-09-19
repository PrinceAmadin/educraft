import { db } from "@/lib/db";

/**
 * USD per million tokens. Update when Anthropic's pricing changes or a new
 * model is used — an unknown model falls back to the Sonnet rate.
 */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 3, output: 15 },
};
const FALLBACK_PRICE = { input: 3, output: 15 };

/** ₦ per US$. Override with USD_NGN_RATE in the environment. */
export function usdToNairaRate(): number {
  const n = Number(process.env.USD_NGN_RATE);
  return Number.isFinite(n) && n > 0 ? n : 1500;
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICE_PER_MTOK[model] ?? FALLBACK_PRICE;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

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
  durationMs: number;
  status: "success" | "error";
}

/** Best-effort: a logging failure must never break the Claude call it describes. */
export async function logAiUsage(rec: AiUsageRecord): Promise<void> {
  try {
    const usd = costUsd(rec.model, rec.inputTokens, rec.outputTokens);
    const project = rec.projectId
      ? await db.project.findUnique({ where: { id: rec.projectId }, select: { workerId: true } })
      : null;
    await db.aiUsageLog.create({
      data: {
        projectId: rec.projectId ?? null,
        workerId: project?.workerId ?? null,
        subsystem: rec.subsystem,
        step: rec.step,
        chapterNumber: rec.chapterNumber ?? null,
        model: rec.model,
        inputTokens: rec.inputTokens,
        outputTokens: rec.outputTokens,
        costUsd: usd,
        costNaira: usd * usdToNairaRate(),
        durationMs: rec.durationMs,
        status: rec.status,
      },
    });
  } catch (error) {
    console.error("[ai-usage] failed to log call", error);
  }
}
