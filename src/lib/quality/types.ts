/** Phase D8 quality gate: the shapes every layer returns. Pure. */

export type QualityLayer = "formatting" | "voice" | "reference" | "structural";
export type Severity = "CRITICAL" | "MAJOR" | "MINOR";
/** WARN and NA count as passed: every report is scored out of the same 89. */
export type CheckStatus = "PASS" | "WARN" | "FAIL" | "NA";

export interface QualityIssue {
  level: "FAIL" | "WARN";
  message: string;
  chapter?: number | null;
  /** 1-based prose paragraph within the chapter, where the layer knows it. */
  paragraph?: number | null;
  quote?: string | null;
  fix?: string | null;
  /** Raises this issue's severity above the check's (ST5's missing ethics section is CRITICAL). */
  severity?: Severity;
}

export interface CheckResult {
  id: string;
  layer: QualityLayer;
  title: string;
  /** How serious the check is when it fails. */
  severity: Severity;
  status: CheckStatus;
  /** One line for the report. */
  summary: string;
  issues: QualityIssue[];
}

export interface QualityLocation {
  chapter: number | null;
  paragraph: number | null;
  quote: string | null;
}

/** One line of the failure list (failuresJson) or the warnings list. */
export interface QualityItem {
  id: string;
  layer: QualityLayer;
  severity: Severity;
  status: "FAIL" | "WARN";
  chapter: number | null;
  message: string;
  locations: QualityLocation[];
  fix: string | null;
}

/** A check result, a pass/fail/warn/NA helper for the layers. */
export function result(
  base: { id: string; layer: QualityLayer; title: string; severity: Severity },
  issues: QualityIssue[],
  summary: { pass: string; fail?: string; na?: string } | string,
  opts: { na?: boolean } = {},
): CheckResult {
  const s = typeof summary === "string" ? { pass: summary } : summary;
  if (opts.na) return { ...base, status: "NA", summary: s.na ?? s.pass, issues };
  const failed = issues.some((i) => i.level === "FAIL");
  const warned = issues.some((i) => i.level === "WARN");
  return {
    ...base,
    status: failed ? "FAIL" : warned ? "WARN" : "PASS",
    summary: failed ? (s.fail ?? s.pass) : s.pass,
    issues,
  };
}

/** Trims a quote for a failure line. */
export function shortQuote(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
