import { getUsdToNairaRate } from "@/lib/ai-usage-log";
import { generationContext, listPauseSnapshots, projectPhase } from "@/lib/services/generation-dashboard";
import { queueStateFor } from "@/lib/services/generation-queue";
import { chapterOutputStatsMany, listGenerationSnapshots } from "./generate-chapter";
import { eventForSnapshot, formatSse, isActive, isStalled, snapshotKey, type EventAudience, type GenerationEvent } from "./generation-events";
import { isPauseActive, pauseKey, pausedEvent, queueEvent, queueKey, resumedEvent, runStateEvent, runViewKey } from "./progress-events";
import { getRunView, runViewForWorker } from "./orchestrator-view";
import { scheduleGenerationStep } from "./generation-runner";

/** How often the stream reads the database. */
const POLL_MS = 2000;
/** The queue moves slowly: read it every third tick (6 s). */
const QUEUE_EVERY_TICKS = 3;
/** A comment line this often keeps proxies from closing a quiet stream. */
const KEEPALIVE_MS = 15_000;
/** The stream closes itself before the function limit; EventSource reconnects after `retry`. */
const STREAM_MAX_MS = 240_000;
const RECONNECT_MS = 3000;
/** At most one restart of a stalled run per stream per minute (the lease makes extra ones harmless anyway). */
const RESUME_EVERY_MS = 60_000;

export interface GenerationStreamOptions {
  projectId: string;
  chapter?: number;
  signal: AbortSignal;
  resumeStalled: boolean;
  /** D6: also send pipeline_paused / pipeline_resumed for the project's data pauses. */
  pauses?: boolean;
  /** D6: also send queue_position. */
  queue?: boolean;
  /** "legacy" keeps D2's /events payloads; "worker" leaves out Claude costs. */
  audience?: EventAudience;
}

/**
 * Server-sent events for a project's chapter runs (and, for the D6 progress
 * dashboard, its data pauses and its place in the generation queue), read
 * from the database every 2 s through the shared connection pool: nothing is
 * held open per client. An event is sent when what it shows changes, and the
 * current state on every connect. Doubles as the watchdog: a run that has
 * stalled (its chain broke, or it reached Vercel's request-chain limit) is
 * restarted.
 */
export function generationEventStream(opts: GenerationStreamOptions): Response {
  const encoder = new TextEncoder();
  const audience = opts.audience ?? "legacy";
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
      /** pause id -> the key last sent, or "ended" once pipeline_resumed went out. */
      const lastPause = new Map<string, string>();
      let lastQueue: string | null = null;
      let lastRun: string | null = null;
      let lastWrite = Date.now();
      let idleSent = false;
      let errors = 0;
      let tick = 0;
      const rate = await getUsdToNairaRate();
      send(`retry: ${RECONNECT_MS}\n\n`);
      // Read alongside the first tick rather than before it: every round trip counts on a slow link.
      const contextRead = opts.queue ? generationContext(opts.projectId).catch(() => null) : Promise.resolve(null);

      while (!closed && Date.now() - started < STREAM_MAX_MS) {
        try {
          const [rows, pauses] = await Promise.all([
            listGenerationSnapshots(opts.projectId, opts.chapter),
            opts.pauses || opts.queue ? listPauseSnapshots(opts.projectId) : Promise.resolve([]),
          ]);
          errors = 0;
          const now = Date.now();
          const changed = rows.filter((row) => lastKey.get(row.id) !== snapshotKey(row));
          // One query for every chapter that has just finished (on connect, that is all of them).
          const outputs = await chapterOutputStatsMany(changed.filter((row) => row.status === "COMPLETED").map((row) => row.id));
          for (const row of changed) {
            lastKey.set(row.id, snapshotKey(row));
            const event: GenerationEvent = eventForSnapshot(row, { nairaRate: rate, output: outputs.get(row.id) ?? null, audience });
            send(formatSse(event));
            lastWrite = now;
          }
          for (const row of rows) {
            if (opts.resumeStalled && isStalled(row, now) && now - (lastResume.get(row.id) ?? 0) > RESUME_EVERY_MS) {
              lastResume.set(row.id, now);
              scheduleGenerationStep(row.id).catch((error) => console.error("[generation stream] could not restart a stalled run", row.id, error));
            }
          }

          if (opts.pauses) {
            for (const p of pauses) {
              if (isPauseActive(p)) {
                const key = pauseKey(p);
                if (lastPause.get(p.id) !== key) {
                  lastPause.set(p.id, key);
                  send(formatSse(pausedEvent(p)));
                  lastWrite = now;
                }
              } else if (lastPause.has(p.id) && lastPause.get(p.id) !== "ended") {
                // Only a pause this stream saw open is announced as over; on connect, finished ones are simply not shown.
                lastPause.set(p.id, "ended");
                send(formatSse(resumedEvent(p)));
                lastWrite = now;
              }
            }
          }

          const context = await contextRead;
          if (opts.queue && context && tick % QUEUE_EVERY_TICKS === 0) {
            const phase = projectPhase({ approved: context.approved, runs: rows, activePause: pauses.some(isPauseActive), chapterCount: context.chapterCount, chapters: context.chapters });
            const state = await queueStateFor(opts.projectId, phase, new Date(now));
            const key = queueKey(state);
            if (key !== lastQueue) {
              lastQueue = key;
              send(formatSse(queueEvent(state)));
              lastWrite = now;
            }
            // D9: the report's run (a specialist sees its state, not the founder's and the COO's buttons).
            const view = await getRunView(opts.projectId);
            if (view) {
              const shown = audience === "worker" ? runViewForWorker(view) : view;
              const runKey = runViewKey(shown);
              if (runKey !== lastRun) {
                lastRun = runKey;
                send(formatSse(runStateEvent(shown)));
                lastWrite = now;
              }
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
        tick += 1;
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
