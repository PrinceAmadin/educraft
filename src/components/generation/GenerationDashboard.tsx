"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuFileText } from "react-icons/lu";
import type { QueueState } from "@/lib/generation/generation-queue";
import type { RunView } from "@/lib/generation/orchestrator-rules";
import { CHAPTER_WAIT_TEXT, overallPercent, type ChapterCardView, type PauseView } from "@/lib/generation/progress-events";
import type { GenerationDashboardState } from "@/lib/services/generation-dashboard";
import { cn } from "@/lib/utils";
import { ChapterStatusCard } from "./ChapterStatusCard";
import { OrchestratorPanel } from "./OrchestratorPanel";
import { PauseBanner } from "./PauseBanner";
import { ProgressBar } from "./ProgressBar";
import { QueueCard } from "./QueueCard";
import { ReportDownload } from "./ReportDownload";

type Connection = "connecting" | "live" | "reconnecting" | "offline";

const CONNECTION_TEXT: Record<Connection, string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
  offline: "Offline: updates resume when you're back online",
};

function parse(e: MessageEvent): Record<string, unknown> | null {
  try {
    return JSON.parse(e.data as string) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/**
 * Phase D6: the report's live progress. The first state comes from the server
 * (no empty flash on a slow network); then the progress stream keeps it
 * current: chapter cards and bars, the pause banner, the queue card. Events
 * describe state, so applying one twice changes nothing. When a pause changes,
 * the page is refreshed so the review card below shows the new files.
 *
 * D9: the report's run sits on top (Start, the queue, a pause, the quality
 * check), kept current by run_state. `controls` gives the founder and the COO
 * their buttons; a specialist's dashboard has none.
 */
export function GenerationDashboard({
  initial,
  renderedAt,
  streamUrl,
  uploadEndpoint,
  actionEndpoint,
  downloadUrl,
  controls,
}: {
  initial: GenerationDashboardState;
  /** The server's clock when it rendered: the first render uses it on both sides, so the times match. */
  renderedAt: string;
  streamUrl: string;
  uploadEndpoint: string;
  actionEndpoint: string;
  /** D7: the assembled report (.docx); the button is live once every chapter is written. */
  downloadUrl?: string;
  /** D9, founder and COO only: where Start, Stop, Continue and a chapter's restart are posted. */
  controls?: { generation: string; dataPause: string };
}) {
  const router = useRouter();
  const [chapters, setChapters] = React.useState<ChapterCardView[]>(initial.chapters);
  const [pause, setPause] = React.useState<PauseView | null>(initial.pause);
  const pauseRef = React.useRef<PauseView | null>(initial.pause);
  const [queue, setQueue] = React.useState<QueueState>(initial.queue);
  const [run, setRun] = React.useState<RunView | null>(initial.run);
  const runRef = React.useRef<RunView | null>(initial.run);
  const [connection, setConnection] = React.useState<Connection>("connecting");
  const [now, setNow] = React.useState(() => new Date(renderedAt));
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshSoon = React.useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 400);
  }, [router]);

  React.useEffect(() => {
    setNow(new Date());
    const clock = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(clock);
  }, []);

  React.useEffect(() => {
    const es = new EventSource(streamUrl);
    const patch = (n: number, fn: (c: ChapterCardView) => ChapterCardView) => setChapters((cs) => cs.map((c) => (c.chapterNum === n ? fn(c) : c)));

    es.onopen = () => setConnection("live");
    es.onerror = () => setConnection(es.readyState === EventSource.CLOSED ? "offline" : navigator.onLine === false ? "offline" : "reconnecting");

    es.addEventListener("chapter_progress", (e) => {
      const d = parse(e as MessageEvent);
      if (!d) return;
      const status = d.status === "pending" ? "pending" : "generating";
      const retrying = d.retrying as { attempt?: number } | undefined;
      patch(num(d.chapterNum), (c) => ({
        ...c,
        status,
        stage: d.status === "outlining" ? "outlining" : d.status === "writing" ? "writing" : null,
        progressPercent: num(d.progressPercent),
        part: num(d.part),
        partCount: num(d.partCount),
        retryingAttempt: retrying?.attempt ?? null,
        error: null,
        waitingFor: status === "pending" ? "Starting" : null,
      }));
    });
    es.addEventListener("chapter_complete", (e) => {
      const d = parse(e as MessageEvent);
      if (!d) return;
      patch(num(d.chapterNum), (c) => ({ ...c, status: "complete", stage: null, progressPercent: 100, words: num(d.words) || c.words, durationSeconds: typeof d.durationSeconds === "number" ? d.durationSeconds : c.durationSeconds, retryingAttempt: null, error: null, waitingFor: null }));
    });
    const stopped = (status: "failed" | "stalled") => (e: Event) => {
      const d = parse(e as MessageEvent);
      if (!d) return;
      patch(num(d.chapterNum), (c) => ({
        ...c,
        status,
        stage: null,
        progressPercent: typeof d.progressPercent === "number" ? d.progressPercent : c.progressPercent,
        error: typeof d.error === "string" ? d.error : "Generation stopped",
        retryingAttempt: null,
        waitingFor: null,
      }));
    };
    es.addEventListener("chapter_failed", stopped("failed"));
    es.addEventListener("chapter_stalled", stopped("stalled"));
    es.addEventListener("run_state", (e) => {
      const d = parse(e as MessageEvent) as unknown as RunView | null;
      if (!d) return;
      const before = runRef.current;
      runRef.current = d;
      setRun(d);
      // The cards below (the quality check, the research line, a data request) are drawn by the server: they follow the run.
      if (before && (before.status !== d.status || before.gateRanAt !== d.gateRanAt || before.generationStarted !== d.generationStarted || before.cancelledPauseId !== d.cancelledPauseId)) refreshSoon();
    });
    es.addEventListener("pipeline_paused", (e) => {
      const d = parse(e as MessageEvent) as unknown as PauseView | null;
      if (!d) return;
      const before = pauseRef.current;
      const changed = !before || before.pauseId !== d.pauseId || before.status !== d.status || before.clientFiles !== d.clientFiles || before.specialistFiles !== d.specialistFiles || before.round !== d.round;
      pauseRef.current = d;
      setPause(d);
      setChapters((cs) => cs.map((c) => (c.status === "pending" && c.chapterNum > d.afterChapter ? { ...c, waitingFor: CHAPTER_WAIT_TEXT.pause(d.afterChapter) } : c)));
      if (changed) refreshSoon();
    });
    es.addEventListener("pipeline_resumed", (e) => {
      const d = parse(e as MessageEvent);
      if (!d) return;
      if (pauseRef.current?.pauseId === d.pauseId) {
        pauseRef.current = null;
        setPause(null);
      }
      setChapters((cs) => cs.map((c) => (c.status === "pending" && c.waitingFor?.startsWith("Waiting for the data") ? { ...c, waitingFor: CHAPTER_WAIT_TEXT.notStarted } : c)));
      refreshSoon();
    });
    es.addEventListener("queue_position", (e) => {
      const d = parse(e as MessageEvent) as unknown as QueueState | null;
      if (d) setQueue(d);
    });

    const offline = () => setConnection("offline");
    const online = () => setConnection((c) => (c === "offline" ? "reconnecting" : c));
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      es.close();
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [streamUrl, refreshSoon]);

  const overall = overallPercent(chapters);
  const done = chapters.filter((c) => c.status === "complete").length;

  return (
    <section className="space-y-6" aria-labelledby="generation-heading" data-generation-dashboard>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div>
            <p className="eyebrow flex items-center gap-2 text-primary">
              <LuFileText className="size-4" aria-hidden />
              Report generation
            </p>
            <h2 id="generation-heading" className="text-lg font-semibold tracking-tight text-foreground">
              <span className="font-mono tabular-nums">{done}</span> of <span className="font-mono tabular-nums">{chapters.length}</span> chapters written
            </h2>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite" data-connection={connection}>
            <span
              aria-hidden
              className={cn(
                "size-2 rounded-full",
                connection === "live" ? "bg-success" : connection === "offline" ? "bg-danger" : "animate-pulse bg-gold motion-reduce:animate-none"
              )}
            />
            {CONNECTION_TEXT[connection]}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ProgressBar value={overall} label="Whole report progress" />
          <span className="w-10 shrink-0 text-right font-mono text-sm tabular-nums text-foreground">{overall}%</span>
        </div>
        {downloadUrl ? <ReportDownload href={downloadUrl} ready={chapters.length > 0 && done === chapters.length} total={chapters.length} /> : null}
      </div>

      {run ? (
        <OrchestratorPanel
          run={run}
          chapters={chapters.length}
          endpoints={controls}
          onChanged={(next) => {
            runRef.current = next;
            setRun(next);
            refreshSoon();
          }}
        />
      ) : null}

      {/* The queue card is for a report that is waiting its turn; once it is written, the run above says the rest. */}
      {!run || run.status === "QUEUED" || run.status === "NOT_STARTED" || run.status === "STOPPED" ? <QueueCard queue={queue} now={now} /> : null}

      {pause ? <PauseBanner key={pause.pauseId} pause={pause} uploadEndpoint={uploadEndpoint} actionEndpoint={actionEndpoint} onFilesAdded={refreshSoon} /> : null}

      <ol className="space-y-3" aria-label="Chapters">
        {chapters.map((c) => (
          <ChapterStatusCard
            key={c.chapterNum}
            card={c}
            retryEndpoint={controls ? `${controls.generation}/retry` : undefined}
            onRestarted={(n) => setChapters((cs) => cs.map((x) => (x.chapterNum === n ? { ...x, status: "generating", error: null, retryingAttempt: null } : x)))}
          />
        ))}
      </ol>
    </section>
  );
}
