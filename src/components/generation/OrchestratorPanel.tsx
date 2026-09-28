"use client";

import * as React from "react";
import {
  LuCircleCheck,
  LuCirclePause,
  LuCircleStop,
  LuDatabase,
  LuListOrdered,
  LuLoaderCircle,
  LuPlay,
  LuShieldAlert,
  LuShieldCheck,
  LuTriangleAlert,
  LuWorkflow,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import { Button } from "@/components/ui/button";
import { ACTION_TEXT, ORCHESTRATOR_TEXT, START_TEXT, type AttentionAction, type RunView } from "@/lib/generation/orchestrator-rules";
import { cn } from "@/lib/utils";

const LOOK: Record<RunView["status"], { icon: IconType; tone: string; surface: string; spin?: boolean }> = {
  NOT_STARTED: { icon: LuPlay, tone: "text-muted-foreground", surface: "bg-zone" },
  QUEUED: { icon: LuListOrdered, tone: "text-primary", surface: "bg-card shadow-soft" },
  GENERATING: { icon: LuLoaderCircle, tone: "text-primary", surface: "bg-card shadow-soft", spin: true },
  WAITING_FOR_DATA: { icon: LuCirclePause, tone: "text-gold", surface: "bg-gold/10" },
  FETCHING_DATA: { icon: LuDatabase, tone: "text-primary", surface: "bg-card shadow-soft" },
  QUALITY_CHECK: { icon: LuShieldCheck, tone: "text-primary", surface: "bg-card shadow-soft" },
  QUALITY_FAILED: { icon: LuShieldAlert, tone: "text-danger", surface: "bg-danger/10" },
  HELD: { icon: LuCirclePause, tone: "text-gold", surface: "bg-gold/10" },
  NEEDS_ATTENTION: { icon: LuTriangleAlert, tone: "text-danger", surface: "bg-danger/10" },
  COMPLETE: { icon: LuCircleCheck, tone: "text-success", surface: "bg-success/10" },
  STOPPED: { icon: LuCircleStop, tone: "text-muted-foreground", surface: "bg-zone" },
};

export interface OrchestratorEndpoints {
  /** /api/admin/projects/<code>/generation */
  generation: string;
  /** /api/admin/projects/<code>/data-pause */
  dataPause: string;
}

type Pending = { kind: "start" } | { kind: "stop" } | { kind: "action"; action: AttentionAction };

/**
 * Phase D9: where the report's run stands, and the founder's and the COO's
 * buttons: Start, Stop, and what gets a report moving again when it needs a
 * person. Anything that spends credits or changes what the client sees asks
 * first. A specialist sees the same state without the buttons (no
 * `endpoints`).
 */
export function OrchestratorPanel({
  run,
  chapters,
  endpoints,
  onChanged,
}: {
  run: RunView;
  /** How many chapters the report has. */
  chapters: number;
  endpoints?: OrchestratorEndpoints;
  /** The run as the server returned it after an action (the stream keeps it current afterwards). */
  onChanged: (run: RunView) => void;
}) {
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const look = LOOK[run.status];
  const Icon = look.icon;
  const chapter = run.currentChapter;

  // A state that has moved on takes its question with it.
  React.useEffect(() => {
    setPending(null);
    setError(null);
  }, [run.status, run.reason, run.currentChapter]);

  async function post(url: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const json = (await res.json().catch(() => null)) as { error?: string; refusals?: string[]; run?: RunView } | null;
      if (!res.ok) {
        setError(json?.refusals?.length ? json.refusals.join(" ") : (json?.error ?? "That didn't work. Try again."));
        return false;
      }
      if (json?.run) onChanged(json.run);
      return true;
    } catch {
      setError("Could not reach EduCraft. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!pending || !endpoints) return;
    let ok = false;
    if (pending.kind === "start") ok = await post(`${endpoints.generation}/start`, { confirmNoReferences: Boolean(run.start?.needsConfirmation) });
    else if (pending.kind === "stop") ok = await post(`${endpoints.generation}/stop`);
    else ok = await act(pending.action);
    if (ok) setPending(null);
  }

  async function act(action: AttentionAction): Promise<boolean> {
    if (!endpoints) return false;
    switch (action) {
      case "RETRY_CHAPTER":
        return chapter ? post(`${endpoints.generation}/retry`, { chapter }) : false;
      case "REOPEN_PAUSE":
        return run.cancelledPauseId ? post(endpoints.dataPause, { action: "reopen", pauseId: run.cancelledPauseId }) : false;
      case "REWRITE_CHAPTER_ONE":
        return post(`${endpoints.generation}/continue`, { choice: "rewrite_chapter_one" });
      case "ACCEPT_NO_STATEMENTS":
        return post(`${endpoints.generation}/continue`, { choice: "accept_no_statements" });
      case "CONFIRM_NO_REFERENCES":
        return post(`${endpoints.generation}/continue`, { choice: "confirm_no_references" });
      case "CONTINUE":
      case "RUN_GATE":
        return post(`${endpoints.generation}/continue`, { choice: "continue" });
    }
  }

  function ask(next: Pending) {
    setError(null);
    const needsQuestion = next.kind !== "action" || ACTION_TEXT[next.action].confirm !== null;
    if (needsQuestion) setPending(next);
    else void act(next.action);
  }

  const labelFor = (a: AttentionAction) => (a === "RETRY_CHAPTER" && run.reason === "CHAPTER_STALLED" ? START_TEXT.restartStalled(chapter) : ACTION_TEXT[a].label(chapter));
  const question =
    pending?.kind === "start"
      ? START_TEXT.confirm(chapters)
      : pending?.kind === "stop"
        ? START_TEXT.stopConfirm
        : pending?.kind === "action"
          ? (ACTION_TEXT[pending.action].confirm?.(chapter) ?? null)
          : null;
  const confirmLabel = pending?.kind === "start" ? (run.status === "STOPPED" ? START_TEXT.startAgain : START_TEXT.start) : pending?.kind === "stop" ? START_TEXT.stop : pending?.kind === "action" ? labelFor(pending.action) : "";
  const refusals = run.start?.refusals ?? [];
  const warnings = run.start?.warnings ?? [];
  const showStart = Boolean(endpoints) && (run.status === "NOT_STARTED" || run.status === "STOPPED");
  // Before Start the same sentence is among the refusals; on a report that is under way it stands alone.
  const schedulerNotice = Boolean(endpoints) && run.schedulerQuiet && !showStart && run.status !== "COMPLETE";

  return (
    <section className={cn("space-y-4 rounded-2xl p-4 sm:p-5", look.surface)} aria-labelledby="run-heading" data-run-status={run.status} data-run-reason={run.reason ?? ""}>
      <div className="space-y-1.5">
        <p className="eyebrow flex items-center gap-2 text-muted-foreground">
          <LuWorkflow className="size-4" aria-hidden />
          Report writing
        </p>
        <h3 id="run-heading" className={cn("flex items-center gap-2 text-[15px] font-semibold", look.tone)}>
          <Icon className={cn("size-4 shrink-0", look.spin && "animate-spin motion-reduce:animate-none")} aria-hidden />
          {run.label}
        </h3>
        <p className="max-w-prose text-sm text-foreground" role="status" aria-live="polite">
          {run.line}
        </p>
        {run.detail ? <p className="max-w-prose whitespace-pre-wrap break-words text-sm text-muted-foreground">{run.detail}</p> : null}
        {run.startedByName && run.status !== "NOT_STARTED" ? <p className="text-xs text-muted-foreground">Started by {run.startedByName}.</p> : null}
      </div>

      {schedulerNotice ? (
        <p className="flex max-w-prose items-start gap-2 text-sm text-foreground" data-run-scheduler-quiet>
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
          {ORCHESTRATOR_TEXT.schedulerQuiet}
        </p>
      ) : null}
      {showStart && refusals.length ? (
        <ul className="space-y-1 text-sm text-muted-foreground" aria-label="Before this report can start">
          {refusals.map((r) => (
            <li key={r} className="flex items-start gap-2">
              <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
              {r}
            </li>
          ))}
        </ul>
      ) : null}
      {showStart && !refusals.length && warnings.length ? (
        <ul className="space-y-1 text-sm text-foreground" aria-label="Before you start">
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-2">
              <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {endpoints && pending ? (
        <div className="space-y-3" role="group" aria-label="Confirm">
          {question ? <p className="max-w-prose text-sm text-foreground">{question}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={() => void confirm()} disabled={busy} variant={pending.kind === "stop" ? "outline" : "default"} className="h-12 w-full sm:h-10 sm:w-auto" data-run-confirm>
              {busy ? <LuLoaderCircle className="animate-spin" aria-hidden /> : null}
              {confirmLabel}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPending(null)} disabled={busy} className="h-12 w-full sm:h-10 sm:w-auto">
              Not now
            </Button>
          </div>
        </div>
      ) : null}

      {endpoints && !pending ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {showStart ? (
            <Button type="button" onClick={() => ask({ kind: "start" })} disabled={busy || !run.canStart} className="h-12 w-full sm:h-10 sm:w-auto" data-run-start>
              <LuPlay aria-hidden />
              {run.status === "STOPPED" ? START_TEXT.startAgain : START_TEXT.start}
            </Button>
          ) : null}
          {run.actions.map((a) => (
            <Button
              key={a}
              type="button"
              variant={a === "ACCEPT_NO_STATEMENTS" ? "outline" : "default"}
              onClick={() => ask({ kind: "action", action: a })}
              disabled={busy || (a === "REOPEN_PAUSE" && !run.cancelledPauseId) || (a === "RETRY_CHAPTER" && !chapter)}
              className="h-12 w-full sm:h-10 sm:w-auto"
              data-run-action={a}
            >
              {busy ? <LuLoaderCircle className="animate-spin" aria-hidden /> : null}
              {labelFor(a)}
            </Button>
          ))}
          {run.canStop ? (
            <Button type="button" variant="outline" onClick={() => ask({ kind: "stop" })} disabled={busy} className="h-12 w-full sm:h-10 sm:w-auto" data-run-stop>
              <LuCircleStop aria-hidden />
              {START_TEXT.stop}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
