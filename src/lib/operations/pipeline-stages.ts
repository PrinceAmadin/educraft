import type { ProjectStatus } from "@prisma/client";

/**
 * The COO's view of the pipeline: eight stages, each a group of the
 * eighteen statuses, plus how long a project is expected to sit in each
 * status before it needs a look. Pure — the pipeline bar, the "days in
 * status" column and the Action required panel all read from here, and the
 * settings screen edits the expected hours.
 */

export type StageKey =
  | "new"
  | "confirmed"
  | "assigned"
  | "in_progress"
  | "qa"
  | "approved"
  | "delivered"
  | "corrections";

export interface PipelineStage {
  key: StageKey;
  label: string;
  /** Fits a segment on a 375px screen. */
  short: string;
  statuses: readonly ProjectStatus[];
  /** What the sub-count under the stage means ("urgent: 1", "overdue: 2"). */
  alertLabel: string;
}

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  { key: "new", label: "New requirements", short: "New", statuses: ["NEW", "DOWNPAYMENT_VERIFIED"], alertLabel: "waiting" },
  { key: "confirmed", label: "Confirmed", short: "Confirmed", statuses: ["REQUIREMENTS_CONFIRMED"], alertLabel: "unassigned" },
  { key: "assigned", label: "Assigned", short: "Assigned", statuses: ["ASSIGNED"], alertLabel: "not started" },
  {
    key: "in_progress",
    label: "In progress",
    short: "Progress",
    statuses: ["IN_PROGRESS", "AWAITING_CLIENT_INPUT", "REVISION_NEEDED"],
    alertLabel: "overdue",
  },
  { key: "qa", label: "QA review", short: "QA", statuses: ["SUBMITTED", "IN_QA_REVIEW"], alertLabel: "over 24h" },
  { key: "approved", label: "Approved", short: "Approved", statuses: ["APPROVED", "BALANCE_VERIFIED"], alertLabel: "waiting" },
  { key: "delivered", label: "Delivered", short: "Delivered", statuses: ["DELIVERED"], alertLabel: "past 7 days" },
  { key: "corrections", label: "Corrections", short: "Corrections", statuses: ["SUPERVISOR_CORRECTIONS"], alertLabel: "round 3" },
];

export const STAGE_KEYS: readonly StageKey[] = PIPELINE_STAGES.map((s) => s.key);

export function stageFor(status: ProjectStatus): PipelineStage | null {
  return PIPELINE_STAGES.find((s) => s.statuses.includes(status)) ?? null;
}

export function stageByKey(key: string | undefined | null): PipelineStage | null {
  return PIPELINE_STAGES.find((s) => s.key === key) ?? null;
}

/** Every status that sits somewhere on the board (nothing closed or held). */
export const BOARD_STATUSES: readonly ProjectStatus[] = PIPELINE_STAGES.flatMap((s) => [...s.statuses]);

// ── Expected time per status ────────────────────────────────

/**
 * How many hours a project should spend in each status before it is
 * late. Null means the clock is the deadline, not the status (IN_PROGRESS)
 * or nothing is expected (closed, on hold). The founder can change the
 * numbers in Settings (stored as Setting rows, see EXPECTATION_SETTING_KEY).
 */
export const DEFAULT_EXPECTED_HOURS: Record<ProjectStatus, number | null> = {
  NEW: 48,
  DOWNPAYMENT_VERIFIED: 48,
  REQUIREMENTS_CONFIRMED: 24,
  ASSIGNED: 48,
  IN_PROGRESS: null,
  AWAITING_CLIENT_INPUT: null,
  SUBMITTED: 24,
  IN_QA_REVIEW: 24,
  REVISION_NEEDED: 72,
  APPROVED: 24,
  BALANCE_VERIFIED: 24,
  DELIVERED: 168,
  SUPERVISOR_CORRECTIONS: 168,
  COMPLETED: null,
  ON_HOLD: null,
  CANCELLED: null,
  REFUNDED: null,
  DISPUTED: null,
};

/** The statuses whose expected time can be edited in Settings, in pipeline order. */
export const EDITABLE_EXPECTATIONS: readonly { status: ProjectStatus; label: string; hint: string }[] = [
  { status: "NEW", label: "New → downpayment verified", hint: "Finance confirms the downpayment" },
  { status: "DOWNPAYMENT_VERIFIED", label: "Downpayment verified → confirmed", hint: "The COO confirms the requirements" },
  { status: "REQUIREMENTS_CONFIRMED", label: "Confirmed → assigned", hint: "The COO assigns a worker" },
  { status: "ASSIGNED", label: "Assigned → in progress", hint: "The worker accepts and starts" },
  { status: "SUBMITTED", label: "Submitted → QA review", hint: "A reviewer picks it up" },
  { status: "IN_QA_REVIEW", label: "QA review → approved", hint: "The human QA review" },
  { status: "REVISION_NEEDED", label: "Revision → resubmitted", hint: "The worker fixes and resubmits" },
  { status: "APPROVED", label: "Approved → balance verified", hint: "The client pays the balance" },
  { status: "BALANCE_VERIFIED", label: "Balance verified → delivered", hint: "The complete document is released" },
  { status: "DELIVERED", label: "Delivered → completed", hint: "No corrections come back" },
  { status: "SUPERVISOR_CORRECTIONS", label: "Corrections → re-delivered", hint: "One round of supervisor corrections" },
];

export const EXPECTATION_SETTING_PREFIX = "ops_expected_hours_";

export function expectationSettingKey(status: ProjectStatus): string {
  return `${EXPECTATION_SETTING_PREFIX}${status}`;
}

export type ExpectedHours = Record<ProjectStatus, number | null>;

/** Defaults with any Setting overrides (raw string values) applied. */
export function resolveExpectedHours(overrides: Partial<Record<string, string | null>>): ExpectedHours {
  const out: ExpectedHours = { ...DEFAULT_EXPECTED_HOURS };
  for (const status of Object.keys(out) as ProjectStatus[]) {
    const raw = overrides[expectationSettingKey(status)];
    if (raw == null || raw === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) out[status] = n;
  }
  return out;
}

// ── Time in status ──────────────────────────────────────────

export type AgeTone = "normal" | "amber" | "red";

/** Amber once a project has sat 1.5× the expected time in a status, red at 2×. */
export const AMBER_FACTOR = 1.5;
export const RED_FACTOR = 2;

export function hoursBetween(since: Date | string, now: Date): number {
  const s = since instanceof Date ? since : new Date(since);
  return Math.max(0, (now.getTime() - s.getTime()) / 3_600_000);
}

export function ageTone(hoursInStatus: number, expectedHours: number | null): AgeTone {
  if (expectedHours == null || expectedHours <= 0) return "normal";
  if (hoursInStatus >= expectedHours * RED_FACTOR) return "red";
  if (hoursInStatus >= expectedHours * AMBER_FACTOR) return "amber";
  return "normal";
}

/** "<1d", "3d", "14d" — whole days, the way the COO reads the column. */
export function daysLabel(hours: number): string {
  const days = Math.floor(hours / 24);
  return days < 1 ? "<1d" : `${days}d`;
}

export interface StatusAge {
  hours: number;
  days: number;
  label: string;
  tone: AgeTone;
  expectedHours: number | null;
}

export function statusAge(since: Date | string, status: ProjectStatus, expected: ExpectedHours, now: Date = new Date()): StatusAge {
  const hours = hoursBetween(since, now);
  const expectedHours = expected[status];
  return { hours, days: Math.floor(hours / 24), label: daysLabel(hours), tone: ageTone(hours, expectedHours), expectedHours };
}
