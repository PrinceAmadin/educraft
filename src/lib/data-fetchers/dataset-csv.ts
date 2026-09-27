/**
 * The fetched Mode 5 dataset as the chapters and the specialist see it (Phase
 * D5). Pure: the CSV, the notes that go beside it, and the two tables Chapter 4
 * opens with (descriptive statistics and correlations), computed here rather
 * than by the model so every figure is exact and matches what EViews prints
 * for the same data.
 */

export interface DatasetColumn {
  /** Chapter 3's own symbol for the variable (GDP, INF, EXR): the CSV header. */
  symbol: string;
  name: string;
  role: "dependent" | "independent";
  catalogueKey: string | null;
  unit: string | null;
  decimals: number;
  /** "World Bank, World Development Indicators" or "Central Bank of Nigeria"; null when nothing was fetched. */
  source: string | null;
  /** The source's own code for the series (NY.GDP.MKTP.CD, GetAllInflationRates.allItemsAverage). */
  code: string | null;
  /** How the series was measured or when the source last updated it. */
  sourceNote: string | null;
  /** year -> value, already scaled to `unit` and rounded to `decimals`; missing years are absent. */
  values: Record<number, number>;
}

export interface Dataset {
  start: number;
  end: number;
  frequency: "annual";
  columns: DatasetColumn[];
}

export interface MissingItem {
  symbol: string;
  name: string;
  reason: string;
}

export function years(d: Pick<Dataset, "start" | "end">): number[] {
  const out: number[] = [];
  for (let y = d.start; y <= d.end; y++) out.push(y);
  return out;
}

/** Rounds to a fixed number of decimals without floating noise (69.4499999 -> 69.45). */
export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * f) / f;
}

function csvCell(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Year, then one column per variable in model order; a missing value is an empty cell. */
export function datasetCsv(d: Dataset): string {
  const header = ["Year", ...d.columns.map((c) => c.symbol)].map(csvCell).join(",");
  const rows = years(d).map((y) => [String(y), ...d.columns.map((c) => (c.values[y] === undefined ? "" : c.values[y].toFixed(c.decimals)))].join(","));
  return [header, ...rows].join("\n") + "\n";
}

/** "2000–2002, 2005" */
export function yearRanges(list: number[]): string {
  const sorted = [...new Set(list)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(i === j ? String(sorted[i]) : `${sorted[i]}–${sorted[j]}`);
    i = j;
  }
  return parts.join(", ");
}

export function missingYears(d: Dataset, c: DatasetColumn): number[] {
  return years(d).filter((y) => c.values[y] === undefined);
}

/** One line per column: what it is, its unit and where it came from. */
export function datasetNotes(d: Dataset): string[] {
  const lines = [`Year: calendar year. Annual data, ${d.start}–${d.end}.`];
  for (const c of d.columns) {
    if (!c.source) {
      lines.push(`${c.symbol}: ${c.name}. Not fetched: the column is empty.`);
      continue;
    }
    const gaps = missingYears(d, c);
    lines.push(
      `${c.symbol}: ${c.name}${c.unit ? `, ${c.unit}` : ""}. Source: ${c.source}${c.code ? ` (${c.code})` : ""}${c.sourceNote ? `, ${c.sourceNote}` : ""}.` +
        (gaps.length ? ` No value for ${yearRanges(gaps)}.` : "")
    );
  }
  return lines;
}

// ─── Descriptive statistics (EViews layout) ─────────────────────────────────

export interface ColumnStats {
  symbol: string;
  observations: number;
  mean: number | null;
  median: number | null;
  maximum: number | null;
  minimum: number | null;
  stdDev: number | null;
  skewness: number | null;
  kurtosis: number | null;
  jarqueBera: number | null;
  probability: number | null;
}

/**
 * EViews' formulas: Std. Dev. with N−1; skewness and kurtosis with the
 * population deviation σ̂ = s·√((N−1)/N); Jarque-Bera = N/6·(S² + (K−3)²/4),
 * probability from χ²(2): exp(−JB/2).
 */
export function describeColumn(symbol: string, values: number[]): ColumnStats {
  const n = values.length;
  const empty: ColumnStats = { symbol, observations: n, mean: null, median: null, maximum: null, minimum: null, stdDev: null, skewness: null, kurtosis: null, jarqueBera: null, probability: null };
  if (n === 0) return empty;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const base = { ...empty, mean, median, maximum: sorted[n - 1], minimum: sorted[0] };
  if (n < 2) return base;
  const ss = values.reduce((s, v) => s + (v - mean) ** 2, 0);
  const stdDev = Math.sqrt(ss / (n - 1));
  const sigma = Math.sqrt(ss / n);
  if (sigma === 0) return { ...base, stdDev };
  const skewness = values.reduce((s, v) => s + ((v - mean) / sigma) ** 3, 0) / n;
  const kurtosis = values.reduce((s, v) => s + ((v - mean) / sigma) ** 4, 0) / n;
  const jarqueBera = (n / 6) * (skewness ** 2 + (kurtosis - 3) ** 2 / 4);
  return { ...base, stdDev, skewness, kurtosis, jarqueBera, probability: Math.exp(-jarqueBera / 2) };
}

export function describeDataset(d: Dataset): ColumnStats[] {
  return d.columns.filter((c) => c.source).map((c) => describeColumn(c.symbol, years(d).flatMap((y) => (c.values[y] === undefined ? [] : [c.values[y]]))));
}

// ─── Correlation (Pearson, over the years both variables have) ──────────────

export interface CorrelationMatrix {
  symbols: string[];
  /** matrix[i][j]; null where fewer than three common years or no variation. */
  matrix: (number | null)[][];
}

export function pearson(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 3 || b.length !== n) return null;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  if (saa === 0 || sbb === 0) return null;
  return sab / Math.sqrt(saa * sbb);
}

export function correlationMatrix(d: Dataset): CorrelationMatrix {
  const cols = d.columns.filter((c) => c.source);
  const ys = years(d);
  const matrix = cols.map((ci) =>
    cols.map((cj) => {
      const common = ys.filter((y) => ci.values[y] !== undefined && cj.values[y] !== undefined);
      return pearson(
        common.map((y) => ci.values[y]),
        common.map((y) => cj.values[y])
      );
    })
  );
  return { symbols: cols.map((c) => c.symbol), matrix };
}

// ─── The two tables as text, for the chapter prompt ─────────────────────────

const fmt = (v: number | null, decimals = 4) => (v === null ? "n/a" : roundTo(v, decimals).toFixed(decimals));

function textTable(header: string[], rows: string[][]): string {
  return [header.join(" | "), header.map(() => "---").join(" | "), ...rows.map((r) => r.join(" | "))].join("\n");
}

export function statsTableText(stats: ColumnStats[]): string {
  const row = (label: string, pick: (s: ColumnStats) => string) => [label, ...stats.map(pick)];
  return textTable(
    ["Statistic", ...stats.map((s) => s.symbol)],
    [
      row("Mean", (s) => fmt(s.mean)),
      row("Median", (s) => fmt(s.median)),
      row("Maximum", (s) => fmt(s.maximum)),
      row("Minimum", (s) => fmt(s.minimum)),
      row("Std. Dev.", (s) => fmt(s.stdDev)),
      row("Skewness", (s) => fmt(s.skewness)),
      row("Kurtosis", (s) => fmt(s.kurtosis)),
      row("Jarque-Bera", (s) => fmt(s.jarqueBera)),
      row("Probability", (s) => fmt(s.probability)),
      row("Observations", (s) => String(s.observations)),
    ]
  );
}

export function correlationTableText(c: CorrelationMatrix): string {
  return textTable(
    ["", ...c.symbols],
    c.symbols.map((s, i) => [s, ...c.matrix[i].map((v) => fmt(v))])
  );
}
