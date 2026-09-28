/**
 * The quality score out of 89 (founder's brief, D8): 71 formatting + 16
 * structural + 1 reference + 1 voice. A check that passes, only warns, or does
 * not apply counts as passed. The report passes at 85 or more with no CRITICAL
 * failure (founder's call: one CRITICAL failure blocks auto-submit whatever the count). Pure.
 */

import type { CheckResult, QualityIssue, QualityItem, QualityLayer, Severity } from "./types";

export const LAYER_TOTALS: Record<QualityLayer, number> = { formatting: 71, structural: 16, reference: 1, voice: 1 };
export const QUALITY_TOTAL = 89;
export const PASS_MARK = 85;

const RANK: Record<Severity, number> = { CRITICAL: 0, MAJOR: 1, MINOR: 2 };

export interface QualityScore {
  qualityScore: number;
  totalChecks: number;
  percent: number;
  passed: boolean;
  criticalFailures: number;
  formattingScore: number;
  structuralScore: number;
  referenceScore: number;
  voiceScore: number;
  failures: QualityItem[];
  warnings: QualityItem[];
}

/** The severity a failed check carries: its own, or higher when one of its failures says so. */
export function effectiveSeverity(check: CheckResult): Severity {
  let s = check.severity;
  for (const i of check.issues) if (i.level === "FAIL" && i.severity && RANK[i.severity] < RANK[s]) s = i.severity;
  return s;
}

/** Issues of one check that say the same thing become one line with several locations (at most 5 shown). */
function items(check: CheckResult, level: "FAIL" | "WARN", severity: Severity): QualityItem[] {
  const groups = new Map<string, { issue: QualityIssue; locations: QualityIssue[] }>();
  for (const issue of check.issues.filter((i) => i.level === level)) {
    const key = `${issue.message}\u0000${issue.fix ?? ""}`;
    const g = groups.get(key);
    if (g) g.locations.push(issue);
    else groups.set(key, { issue, locations: [issue] });
  }
  const out = [...groups.values()].map(({ issue, locations }) => ({
    id: check.id,
    layer: check.layer,
    severity: level === "FAIL" ? (issue.severity ?? severity) : check.severity,
    status: level,
    chapter: issue.chapter ?? null,
    message: locations.length > 5 ? `${issue.message} (${locations.length} places)` : issue.message,
    locations: locations.slice(0, 5).map((l) => ({ chapter: l.chapter ?? null, paragraph: l.paragraph ?? null, quote: l.quote ?? null })),
    fix: issue.fix ?? null,
  }));
  // A failed check always shows at least one line, even when a layer gave no detail.
  if (level === "FAIL" && out.length === 0) {
    out.push({ id: check.id, layer: check.layer, severity, status: "FAIL", chapter: null, message: check.summary, locations: [], fix: null });
  }
  return out;
}

const order = (a: QualityItem, b: QualityItem) =>
  RANK[a.severity] - RANK[b.severity] || (a.chapter ?? 0) - (b.chapter ?? 0) || a.id.localeCompare(b.id, "en", { numeric: true });

export function scoreQuality(results: CheckResult[]): QualityScore {
  const byLayer = (layer: QualityLayer) => results.filter((r) => r.layer === layer);
  for (const layer of Object.keys(LAYER_TOTALS) as QualityLayer[]) {
    const n = byLayer(layer).length;
    if (n !== LAYER_TOTALS[layer]) throw new Error(`The ${layer} layer returned ${n} checks, not ${LAYER_TOTALS[layer]}.`);
  }
  const passedIn = (layer: QualityLayer) => byLayer(layer).filter((r) => r.status !== "FAIL").length;
  const failed = results.filter((r) => r.status === "FAIL");
  const criticalFailures = failed.filter((r) => effectiveSeverity(r) === "CRITICAL").length;
  const qualityScore = results.length - failed.length;
  return {
    qualityScore,
    totalChecks: QUALITY_TOTAL,
    percent: Math.round((qualityScore / QUALITY_TOTAL) * 1000) / 10,
    passed: qualityScore >= PASS_MARK && criticalFailures === 0,
    criticalFailures,
    formattingScore: passedIn("formatting"),
    structuralScore: passedIn("structural"),
    referenceScore: passedIn("reference"),
    voiceScore: passedIn("voice"),
    failures: failed.flatMap((r) => items(r, "FAIL", effectiveSeverity(r))).sort(order),
    warnings: results.flatMap((r) => items(r, "WARN", r.severity)).sort(order),
  };
}
