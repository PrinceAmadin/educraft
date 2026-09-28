/**
 * Where a report's pipeline pauses for the client's data. Pure, and free of
 * anything that runs only on the server, so the chapter orchestrator's rules
 * (and the screens that show them) can read it. Modes 2 and 4 pause after
 * Chapter 3 for the results; Mode 3 pauses after Chapter 2 for the build
 * specification and after Chapter 3 for the test results (founder, 27 Sept);
 * Modes 1 and 5 never pause.
 */

export type PauseKind = "SPECIFICATION" | "RESULTS";

const PAUSE_POINTS: Record<number, number[]> = { 1: [], 2: [3], 3: [2, 3], 4: [3], 5: [] };

/** The chapters after which a mode's pipeline waits for the client's data. */
export function pausePointsFor(mode: number): number[] {
  return PAUSE_POINTS[mode] ?? [];
}

export function pauseKind(mode: number, afterChapter: number): PauseKind {
  return mode === 3 && afterChapter === 2 ? "SPECIFICATION" : "RESULTS";
}

/** The pauses whose data a chapter needs (every pause before it): Chapter 4 in Mode 2 needs the pause after Chapter 3. */
export function pausesBeforeChapter(mode: number, chapter: number): number[] {
  return pausePointsFor(mode).filter((p) => p < chapter);
}
