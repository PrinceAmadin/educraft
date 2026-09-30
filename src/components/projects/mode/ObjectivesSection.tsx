"use client";

import { LuLoaderCircle, LuPlus, LuRefreshCw, LuSparkles, LuTriangleAlert, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormSection } from "@/components/forms/FormSection";
import { MAX_AIM_CHARS, MAX_OBJECTIVE_CHARS, MAX_OBJECTIVES, MIN_OBJECTIVES } from "@/lib/generation/objectives-rules";
import { objectivesModeMismatch, type BriefView } from "@/lib/research/source-stage-view";
import { ObjectivesCheckPanel } from "./ObjectivesCheckPanel";

export type BriefAction = "start" | "redraft_objectives" | "carry_on" | "draft_aim" | "suggest_aim" | "add_aim" | "check_objectives";

const rowsFor = (text: string) => Math.min(6, Math.max(2, Math.ceil(text.length / 32)));

/**
 * The report's aim and objectives on the COO's card (D3b; the aim since 30
 * Sept 2026: every report states one aim before its objectives). Drafted only
 * when the founder or the COO presses Draft (never on their own), edited here,
 * approved with the mode; Chapter 1 states them word for word. Draft again
 * re-drafts them whenever they choose. Under them sits the independent check
 * (a separate model scores them; it warns, never blocks). A report approved
 * without an aim can be given one here, once, without reopening the card.
 */
export function ObjectivesSection({
  brief,
  modeNumber,
  aim,
  onAimChange,
  lockedAim,
  onLockedAimChange,
  objectives,
  onChange,
  editable,
  busy,
  onAction,
  problems,
  checkKey,
}: {
  brief: BriefView;
  /** The mode chosen on the card now (0: none yet). The draft follows it. */
  modeNumber: number;
  aim: string;
  onAimChange: (next: string) => void;
  /** A report approved without an aim: the aim being written for it (starts as the suggestion). */
  lockedAim: string;
  onLockedAimChange: (next: string) => void;
  objectives: string[];
  onChange: (next: string[]) => void;
  editable: boolean;
  busy: string | null;
  onAction: (action: BriefAction) => void;
  problems: string[];
  /** The key of the aim and objectives on the card now, to tell a stale check. */
  checkKey: string;
}) {
  const searchWord = brief.sourceKind === "CASE" ? "cases" : brief.sourceKind === "ARCHIVE" ? "archival sources" : null;
  const edited =
    (brief.draftedObjectives.length > 0 && brief.draftedObjectives.join("\n") !== objectives.join("\n")) ||
    Boolean(brief.draftedAim && brief.aim === brief.draftedAim && aim.trim() !== brief.draftedAim);
  const mismatch = editable ? objectivesModeMismatch(brief, modeNumber || null) : null;
  const redraftLabel = busy === "redraft_objectives" ? "Asking…" : modeNumber ? `Draft again for Mode ${modeNumber}` : "Draft again";
  const showList = objectives.length > 0 && !brief.running;
  const aimMissingEditable = editable && brief.status === "READY" && !aim.trim();

  return (
    <FormSection
      title="Aim and objectives"
      description="Chapter 1 states the aim and the objectives word for word, and every chapter follows them in this order."
      action={
        brief.canRedraft && editable && !mismatch ? (
          <Button type="button" variant="outline" size="sm" disabled={busy !== null || !modeNumber} onClick={() => onAction("redraft_objectives")}>
            <LuRefreshCw aria-hidden />
            {redraftLabel}
          </Button>
        ) : null
      }
    >
      {brief.notStarted ? (
        <div className="space-y-3 rounded-2xl bg-zone p-4">
          <p className="text-sm text-foreground">
            No aim or objectives yet. Nothing is drafted until you press the button: they are drafted for the mode chosen above,
            from the topic and the department{searchWord ? `, together with a search for ${searchWord} (at most ${brief.searchLimit} searches)` : ""}.
          </p>
          {brief.canStart ? (
            <div className="space-y-2">
              <Button type="button" disabled={busy !== null || !modeNumber} onClick={() => onAction("start")}>
                <LuSparkles aria-hidden />
                {busy === "start"
                  ? "Starting…"
                  : `Draft aim and objectives${modeNumber ? ` for Mode ${modeNumber}` : ""}${searchWord ? ` and find ${searchWord}` : ""}`}
              </Button>
              {!modeNumber ? <p className="text-xs text-muted-foreground">Pick a mode first.</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {brief.running ? (
        <div className="flex items-start gap-3 rounded-2xl bg-zone p-4" role="status" aria-live="polite">
          <LuLoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-primary" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">{brief.progress ?? "Working…"}</p>
            <p className="text-xs text-muted-foreground">This runs on the server and the card updates by itself; you can leave the page.</p>
          </div>
        </div>
      ) : null}

      {brief.stopped ? (
        <div className="space-y-3 rounded-2xl bg-gold/10 p-4" role="alert">
          <p className="flex items-start gap-2 text-sm text-foreground">
            <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
            <span>It stopped{brief.error ? `: ${brief.error}` : "."} Everything found so far is kept.</span>
          </p>
          {brief.canCarryOn ? (
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => onAction("carry_on")}>
              {busy === "carry_on" ? "Resuming…" : "Carry on"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {brief.kindMismatch ? (
        <div className="space-y-3 rounded-2xl bg-gold/10 p-4">
          <p className="flex items-start gap-2 text-sm text-foreground">
            <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
            <span>
              {brief.kindMismatch.now
                ? `The saved department calls for ${brief.kindMismatch.now === "CASE" ? "cases" : "archival sources"}, but the search was for ${searchWord ?? "nothing"}.`
                : "The saved department needs no source search, but one was run."}{" "}
              Start again to replace the search (the aim and objectives stay).
            </span>
          </p>
          {brief.canStart ? (
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => onAction("start")}>
              {busy === "start" ? "Starting…" : "Start again"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {mismatch && brief.canRedraft ? (
        <div className="space-y-3 rounded-2xl bg-gold/10 p-4" role="status">
          <p className="flex items-start gap-2 text-sm text-foreground">
            <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
            <span>
              {mismatch.drafted
                ? `These objectives were drafted for Mode ${mismatch.drafted}; the mode is now Mode ${mismatch.now}.`
                : `These objectives were drafted before the mode was recorded; the mode is now Mode ${mismatch.now}.`}{" "}
              Draft them again before approving.
            </span>
          </p>
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => onAction("redraft_objectives")}>
            <LuRefreshCw aria-hidden />
            {redraftLabel}
          </Button>
        </div>
      ) : null}

      {brief.noPoints ? (
        <div className="space-y-3 rounded-2xl bg-gold/10 p-4">
          <p className="flex items-start gap-2 text-sm text-foreground">
            <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
            <span>The search for {searchWord} ended without any point to look for, so the chapters would cite none. Search again (the aim and objectives stay).</span>
          </p>
          {brief.canStart ? (
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => onAction("start")}>
              {busy === "start" ? "Starting…" : "Search again"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {aimMissingEditable && !mismatch ? (
        <div className="space-y-3 rounded-2xl bg-gold/10 p-4" role="status">
          <p className="flex items-start gap-2 text-sm text-foreground">
            <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
            <span>No aim yet. Every report states one aim before its objectives: draft one from the objectives below, or write it yourself.</span>
          </p>
          {brief.canDraftAim ? (
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => onAction("draft_aim")}>
              <LuSparkles aria-hidden />
              {busy === "draft_aim" ? "Drafting…" : "Draft the aim"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {brief.canAddAim ? (
        <div className="space-y-3 rounded-2xl bg-gold/10 p-4">
          <p className="flex items-start gap-2 text-sm text-foreground">
            <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
            <span>
              This report was approved without an aim. Add one here: the objectives, sources and mode stay locked, and the
              chapters already written are not re-generated (the specialist adds the aim to Chapter One).
            </span>
          </p>
          {brief.draftedAim || lockedAim.trim() ? (
            <div className="space-y-2">
              <label htmlFor="locked-aim" className="text-sm font-medium text-foreground">
                Aim
              </label>
              <Textarea
                id="locked-aim"
                rows={rowsFor(lockedAim)}
                className="resize-none [field-sizing:content]"
                value={lockedAim}
                maxLength={MAX_AIM_CHARS + 40}
                onChange={(e) => onLockedAimChange(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={busy !== null || !lockedAim.trim()} onClick={() => onAction("add_aim")}>
                  {busy === "add_aim" ? "Saving…" : "Save aim"}
                </Button>
                <Button type="button" variant="outline" disabled={busy !== null} onClick={() => onAction("suggest_aim")}>
                  <LuRefreshCw aria-hidden />
                  {busy === "suggest_aim" ? "Drafting…" : "Suggest another"}
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => onAction("suggest_aim")}>
              <LuSparkles aria-hidden />
              {busy === "suggest_aim" ? "Drafting…" : "Draft an aim"}
            </Button>
          )}
        </div>
      ) : null}

      {showList ? (
        <div className="space-y-5">
          {editable || aim.trim() ? (
            <div className="space-y-2">
              <label htmlFor="report-aim" className="text-sm font-medium text-foreground">
                Aim
              </label>
              <Textarea
                id="report-aim"
                rows={rowsFor(aim)}
                className="resize-none [field-sizing:content]"
                value={aim}
                placeholder="The aim of this study is to …"
                maxLength={MAX_AIM_CHARS + 40}
                disabled={!editable}
                onChange={(e) => onAimChange(e.target.value)}
              />
              {editable ? <p className="text-xs text-muted-foreground">One sentence starting &quot;The aim of this study is to&quot;.</p> : null}
            </div>
          ) : null}

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Objectives</p>
            <ol className="space-y-3">
              {objectives.map((o, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-3 w-5 shrink-0 font-mono text-sm tabular-nums text-muted-foreground" aria-hidden>
                    {i + 1}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`objective-${i}`} className="sr-only">
                      Objective {i + 1}
                    </label>
                    <Textarea
                      id={`objective-${i}`}
                      // Grows with its text (field-sizing where the browser has it; else rows from the length), so the whole objective shows on a phone.
                      rows={rowsFor(o)}
                      className="resize-none [field-sizing:content]"
                      value={o}
                      maxLength={MAX_OBJECTIVE_CHARS}
                      disabled={!editable}
                      onChange={(e) => onChange(objectives.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                  </div>
                  {editable && objectives.length > MIN_OBJECTIVES ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-1 size-12 shrink-0"
                      aria-label={`Remove objective ${i + 1}`}
                      onClick={() => onChange(objectives.filter((_, j) => j !== i))}
                    >
                      <LuX aria-hidden />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {editable && objectives.length < MAX_OBJECTIVES ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...objectives, "To "])}>
                  <LuPlus aria-hidden />
                  Add an objective
                </Button>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {brief.objectivesFromClient ? "Taken from the client's own brief. " : ""}
                {edited ? "Edited from the draft." : `${MIN_OBJECTIVES} to ${MAX_OBJECTIVES} objectives, each starting "To".`}
              </p>
            </div>
          </div>

          {editable && problems.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}

          <ObjectivesCheckPanel
            check={brief.objectivesCheck}
            running={brief.checkRunning}
            currentKey={checkKey}
            aim={aim || brief.aim || ""}
            objectives={objectives}
            canCheck={brief.canCheck}
            busy={busy !== null}
            onCheck={() => onAction("check_objectives")}
          />
        </div>
      ) : null}
    </FormSection>
  );
}
