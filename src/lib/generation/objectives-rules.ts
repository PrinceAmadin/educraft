/**
 * The rules an objectives list must meet (D3b), whether the drafter wrote it or
 * the COO edited it. Pure (no I/O), so the COO's card can check as they type.
 */

export const MIN_OBJECTIVES = 4;
export const MAX_OBJECTIVES = 5;
export const MAX_OBJECTIVE_CHARS = 250;

/** Removes a leading number or bullet ("1.", "(ii)", "-") and a trailing full stop. */
function tidy(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(\(?[0-9ivx]{1,4}[.)]|[-*•])\s+/i, "")
    .replace(/[.;]+$/, "")
    .trim();
}

export type ObjectivesCheck = { ok: true; objectives: string[] } | { ok: false; problems: string[] };

/**
 * The rules an objectives list must meet, whether the drafter wrote it or the
 * COO edited it: 4 to 5, each "To …", one sentence, at most 250 characters,
 * no repeats. Pure: used by the drafter, the card and the approval.
 */
export function validateObjectives(raw: unknown): ObjectivesCheck {
  const list = Array.isArray(raw) ? raw : [];
  const objectives = list.map((o) => (typeof o === "string" ? tidy(o) : "")).filter(Boolean);
  const problems: string[] = [];
  if (objectives.length < MIN_OBJECTIVES || objectives.length > MAX_OBJECTIVES) {
    problems.push(`Give ${MIN_OBJECTIVES} to ${MAX_OBJECTIVES} objectives (there ${objectives.length === 1 ? "is" : "are"} ${objectives.length}).`);
  }
  objectives.forEach((o, i) => {
    if (!/^To [a-z]/i.test(o)) problems.push(`Objective ${i + 1} should begin with "To" and a verb.`);
    if (o.length > MAX_OBJECTIVE_CHARS) problems.push(`Objective ${i + 1} is over ${MAX_OBJECTIVE_CHARS} characters.`);
    if (o.length < 15) problems.push(`Objective ${i + 1} is too short to state an aim.`);
  });
  const seen = new Set<string>();
  objectives.forEach((o, i) => {
    const key = o.toLowerCase();
    if (seen.has(key)) problems.push(`Objective ${i + 1} repeats an earlier one.`);
    seen.add(key);
  });
  return problems.length ? { ok: false, problems } : { ok: true, objectives };
}
