/** One source's answer for one series, as every source module returns it. */
export interface AnnualSeries {
  /** year -> value (raw, before any display scaling); years with no value are absent. */
  values: Record<number, number>;
  /** The source's own "last updated" date, when it gives one. */
  lastUpdated: string | null;
}

/** Keeps the years within the period (both ends included). */
export function keepPeriod(values: Record<number, number>, start: number, end: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [y, v] of Object.entries(values)) {
    const year = Number(y);
    if (year >= start && year <= end) out[year] = v;
  }
  return out;
}

/** A finite number from a JSON value or a numeric string ("1,234.5"); null otherwise. */
export function numberFrom(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value.replace(/,/g, "").trim()) : NaN;
  return Number.isFinite(n) ? n : null;
}
