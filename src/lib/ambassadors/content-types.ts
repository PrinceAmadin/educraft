/**
 * The HOG's content rhythm and the pre-season campaign — the pure parts
 * (labels, weekdays, milestones), shared by the server and the browser.
 */

export const CONTENT_TYPES = ["MONDAY_FLIER", "WEDS_CHECKIN", "FRIDAY_SPOTLIGHT", "OTHER"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export type RhythmType = Exclude<ContentType, "OTHER">;

export const CONTENT_LABELS: Record<ContentType, string> = {
  MONDAY_FLIER: "Content drop",
  WEDS_CHECKIN: "Midweek check-in",
  FRIDAY_SPOTLIGHT: "Weekly spotlight",
  OTHER: "Other post",
};

/** The spec's names in the "Log content posted" picker. */
export const CONTENT_PICKER_LABELS: Record<ContentType, string> = {
  MONDAY_FLIER: "Monday flier",
  WEDS_CHECKIN: "Midweek check-in",
  FRIDAY_SPOTLIGHT: "Friday spotlight",
  OTHER: "Other",
};

/** Which weekday (0 = Monday) each rhythm post belongs to. */
export const RHYTHM: { type: RhythmType; weekday: number; day: string; action: string }[] = [
  { type: "MONDAY_FLIER", weekday: 0, day: "Monday", action: "Upload flier" },
  { type: "WEDS_CHECKIN", weekday: 2, day: "Wednesday", action: "Post check-in" },
  { type: "FRIDAY_SPOTLIGHT", weekday: 4, day: "Friday", action: "Pick winner" },
];

/** Consistency: 100% is the target; 90% and up reads as on track, below that as a warning. */
export const CONSISTENCY_GOOD = 90;

/**
 * The pre-season campaign: it starts 8 weeks before the semester and has a
 * push every two weeks (Section 8's dates: Nov 11 → Nov 25 → Dec 9 → Dec 23
 * → Jan 6 for a semester starting Jan 6).
 */
export const CAMPAIGN_MILESTONES = [
  { key: "BRIEFING", label: "Ambassador briefing", weeksBefore: 8 },
  { key: "EARLY_BIRD", label: "Early-bird launch", weeksBefore: 6 },
  { key: "URGENCY", label: "Urgency push", weeksBefore: 4 },
  { key: "FINAL_CALL", label: "Final call", weeksBefore: 2 },
  { key: "SEMESTER", label: "Semester begins", weeksBefore: 0 },
] as const;
export type MilestoneKey = (typeof CAMPAIGN_MILESTONES)[number]["key"];
export const CAMPAIGN_LEAD_WEEKS = 8;
