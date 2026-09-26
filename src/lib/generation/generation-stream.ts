import { usdToNairaRate } from "@/lib/ai-usage-log";
import { chapterOutputStats, listGenerationSnapshots } from "./generate-chapter";
import { eventForSnapshot, formatSse, isActive, isStalled, snapshotKey, type GenerationEvent } from "./generation-events";
import { scheduleGenerationStep } from "./generation-runner";

/** How often the stream reads the database. */
const POLL_MS = 2000;
/** A comment line this often keeps proxies from closing a quiet stream. */
const KEEPALIVE_MS = 15_000;
/** The stream closes itself before the function limit; EventSource reconnects after `retry`. */
const STREAM_MAX_MS = 240_000;
const RECONNECT_MS = 3000;
/** At most one restart of a stalled run per stream per minute (the lease makes extra ones harmless anyway). */
const RESUME_EVERY_MS = 60_000;

/**
 * Server-sent events for a project's chapter runs, read from the database
 * (the runner that writes them may be in another invocation entirely). An
 * event is sent when a run's state changes, and the current state of every
 * run on connect. Doubles as the watchdog: a run that has stalled (its chain
 * broke, or it reached Vercel's request-chain limit) is restarted.
 */
export function generationEventStream(opts: { projectId: string; chapter?: number; signal: AbortSignal; resumeStalled: boolean }): Response {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };
      opts.signal.addEventListener("abort", close);

      const started = Date.now();
      const lastKey = new Map<string, string>();
      const lastResume = new Map<string, number>();
      let lastWrite = Date.now();
      let idleSent = false;
      let errors = 0;
      const rate = usdToNairaRate();
      send(`retry: ${RECONNECT_MS}\n\n`);

      while (!closed && Date.now() - started < STREAM_MAX_MS) {
        try {
          const rows = await listGenerationSnapshots(opts.projectId, opts.chapter);
          errors = 0;
          const now = Date.now();
          for (const row of rows) {
            const key = snapshotKey(row);
            if (lastKey.get(row.id) !== key) {
              lastKey.set(row.id, key);
              const output = row.status === "COMPLETED" ? await chapterOutputStats(row.id) : null;
              const event: GenerationEvent = eventForSnapshot(row, { nairaRate: rate, output });
              send(formatSse(event));
              lastWrite = now;
            }
            if (opts.resumeStalled && isStalled(row, now) && now - (lastResume.get(row.id) ?? 0) > RESUME_EVERY_MS) {
              lastResume.set(row.id, now);
              scheduleGenerationStep(row.id).catch((error) => console.error("[generation stream] could not restart a stalled run", row.id, error));
            }
          }
          const anyActive = rows.some(isActive);
          if (!anyActive && !idleSent) {
            idleSent = true;
            send(formatSse({ event: "generation_idle", data: { chapters: rows.map((r) => r.chapterNumber) } }));
            lastWrite = now;
          } else if (anyActive) {
            idleSent = false;
          }
        } catch (error) {
          errors += 1;
          console.error("[generation stream] read failed", opts.projectId, error);
          if (errors >= 5) break;
        }
        if (Date.now() - lastWrite > KEEPALIVE_MS) {
          send(": keep-alive\n\n");
          lastWrite = Date.now();
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      close();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
