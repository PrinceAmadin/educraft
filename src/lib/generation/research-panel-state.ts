/**
 * The four-state summary the Research tab uses to decide what to show below
 * "Research complete": nothing started yet (with the Start button), a chapter
 * being written, a mode pause the run is waiting on, or the whole report done.
 * Derived from `GenerationDashboardState` so the Research tab does not need
 * its own SSE — the Report tab still carries the live view.
 */
import type { GenerationDashboardState } from "@/lib/services/generation-dashboard";

export type ResearchPanelGenerationState =
  | { kind: "not_started" }
  | { kind: "in_progress"; chapterNum: number; title: string; progressPercent: number }
  | { kind: "paused"; message: string; statusLine: string }
  | { kind: "complete" };

export function deriveResearchPanelGenerationState(
  dashboard: GenerationDashboardState | null,
): ResearchPanelGenerationState | null {
  // Not a written report, or the mode is not approved yet: the Research tab
  // stays as it was — the "Approve the mode first" gate lives on the admin
  // Report tab, not here.
  if (!dashboard) return null;

  const run = dashboard.run;
  const chapters = dashboard.chapters;

  // Not started: no orchestrator run row for this project.
  if (!run || run.status === "NOT_STARTED") {
    return { kind: "not_started" };
  }

  // A pause the run is actually waiting on takes precedence over an
  // in-progress chapter (a paused run has no chapter generating).
  if (dashboard.pause) {
    return {
      kind: "paused",
      message: dashboard.pause.message,
      statusLine: dashboard.pause.statusLine,
    };
  }

  // Every chapter finished and the run is done.
  const allComplete = chapters.length > 0 && chapters.every((c) => c.status === "complete");
  if (allComplete || run.status === "COMPLETE") return { kind: "complete" };

  // In progress: prefer the chapter that is generating right now, else the
  // first one that has not finished (about to start).
  const generating = chapters.find((c) => c.status === "generating");
  const next = generating ?? chapters.find((c) => c.status !== "complete");
  if (next) {
    return { kind: "in_progress", chapterNum: next.chapterNum, title: next.title, progressPercent: next.progressPercent };
  }

  // Fallback: run row exists but no chapter yet — treat as in progress at 0%.
  return { kind: "in_progress", chapterNum: chapters[0]?.chapterNum ?? 1, title: chapters[0]?.title ?? "Chapter 1", progressPercent: 0 };
}
