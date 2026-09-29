/**
 * A Mode 5 dataset the specialist supplies by hand: the last resort for
 * variables no automatic source publishes (firm-level survey measures, for
 * example). Pure: turns the uploaded CSV into the same Dataset a fetch
 * produces, checked against the model Chapter 3 specifies.
 *
 * The file is "Year" then one column per symbol in the model (any order,
 * letter case ignored), one row per year inside the model's period. The
 * upload replaces the whole dataset, so the card's template carries every
 * value already in it: a column the specialist left exactly as it was keeps
 * its citation (a fetched series, or an earlier upload); any other column is
 * cited to what the specialist says the data comes from.
 */

import { parseCsv } from "./csv";
import { missingYears, roundTo, yearRanges, type Dataset, type DatasetColumn, type MissingItem } from "./dataset-csv";
import type { ModelSpec } from "./model-spec";
import { MISSING_TEXT } from "./secondary-data-fetcher";

/** 66 years × 13 columns is about 6 KB; this leaves room for long decimals. */
export const MAX_UPLOAD_CHARS = 200_000;
const MAX_PROBLEMS = 20;
const MAX_DECIMALS = 4;
/** Cells read as "no value". */
const EMPTY = new Set(["", "na", "n/a", "n.a.", "-", "--", "..", "…", "null", "nil"]);

/** What the specialist is told (for the founder to review). */
export const UPLOAD_TEXT = {
  tooLarge: `The file is too large for a dataset (over ${MAX_UPLOAD_CHARS / 1000} KB). Save only the data sheet as CSV.`,
  noRows: "The file has no data rows under the header.",
  firstColumn: 'The first column must be "Year".',
  unknownColumn: (col: string, expected: string[]) => `"${col}" is not a variable in Chapter 3's model (the columns are Year, ${expected.join(", ")}).`,
  missingColumn: (symbol: string, name: string) => `The file has no column for ${symbol} (${name}).`,
  twiceColumn: (col: string) => `The column ${col} appears twice.`,
  notYear: (row: number, value: string) => `Row ${row}: "${value}" is not a year.`,
  outsidePeriod: (year: number, start: number, end: number) => `${year} is outside the model's period, ${start}–${end}.`,
  twiceYear: (year: number) => `${year} appears twice.`,
  notNumber: (row: number, year: number, symbol: string, value: string) => `Row ${row} (${year}), ${symbol}: "${value}" is not a number.`,
  noValues: (symbol: string) => `${symbol} has no values. Fill it, or the COO takes it out of Chapter 3.`,
  more: (n: number) => `…and ${n} more.`,
  sourceNote: "supplied by the specialist",
} as const;

export class UploadedDatasetError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.length === 1 ? problems[0] : `The file has ${problems.length} problems; fix them and upload it again.`);
  }
}

function numberCell(raw: string): number | null | undefined {
  const cell = raw.trim();
  if (EMPTY.has(cell.toLowerCase())) return null;
  const cleaned = cell.replace(/[,\s]/g, "").replace(/^\+/, "");
  if (!/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(cleaned)) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function decimalsOf(raw: string): number {
  const m = /\.(\d+)/.exec(raw.replace(/[,\s]/g, ""));
  return m ? Math.min(m[1].length, MAX_DECIMALS) : 0;
}

const sameValues = (a: Record<number, number>, b: Record<number, number>) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((y) => b[Number(y)] !== undefined && Math.abs(a[Number(y)] - b[Number(y)]) < 1e-9);
};

/**
 * Pure: the uploaded CSV as a Dataset for the model's period. Throws
 * UploadedDatasetError with every problem found (up to 20) so the specialist
 * can fix them all at once.
 */
export function parseUploadedDataset(
  text: string,
  spec: ModelSpec,
  opts: { sourceDescription: string; previous?: Dataset | null }
): { dataset: Dataset; missing: MissingItem[] } {
  if (text.length > MAX_UPLOAD_CHARS) throw new UploadedDatasetError([UPLOAD_TEXT.tooLarge]);
  const rows = parseCsv(text);
  if (rows.length < 2) throw new UploadedDatasetError([UPLOAD_TEXT.noRows]);
  const problems: string[] = [];
  const header = rows[0].map((h) => h.trim());
  if (!/^year$/i.test(header[0] ?? "")) problems.push(UPLOAD_TEXT.firstColumn);

  const bySymbol = new Map(spec.variables.map((v) => [v.symbol.toLowerCase(), v]));
  const columnOf = new Map<string, number>();
  header.slice(1).forEach((h, i) => {
    if (!h) return;
    const v = bySymbol.get(h.toLowerCase());
    if (!v) problems.push(UPLOAD_TEXT.unknownColumn(h, spec.variables.map((x) => x.symbol)));
    else if (columnOf.has(v.symbol)) problems.push(UPLOAD_TEXT.twiceColumn(v.symbol));
    else columnOf.set(v.symbol, i + 1);
  });
  for (const v of spec.variables) if (!columnOf.has(v.symbol)) problems.push(UPLOAD_TEXT.missingColumn(v.symbol, v.name));

  const { start, end } = spec.period;
  const values = new Map(spec.variables.map((v) => [v.symbol, {} as Record<number, number>]));
  const decimals = new Map(spec.variables.map((v) => [v.symbol, 0]));
  const seenYears = new Set<number>();
  rows.slice(1).forEach((r, i) => {
    const rowNumber = i + 2;
    const yearRaw = (r[0] ?? "").trim();
    const year = Number(yearRaw);
    if (!/^\d{4}$/.test(yearRaw)) return void problems.push(UPLOAD_TEXT.notYear(rowNumber, yearRaw));
    if (year < start || year > end) return void problems.push(UPLOAD_TEXT.outsidePeriod(year, start, end));
    if (seenYears.has(year)) return void problems.push(UPLOAD_TEXT.twiceYear(year));
    seenYears.add(year);
    for (const [symbol, col] of columnOf) {
      const raw = r[col] ?? "";
      const n = numberCell(raw);
      if (n === undefined) problems.push(UPLOAD_TEXT.notNumber(rowNumber, year, symbol, raw.trim()));
      else if (n !== null) {
        values.get(symbol)![year] = n;
        decimals.set(symbol, Math.max(decimals.get(symbol)!, decimalsOf(raw)));
      }
    }
  });
  for (const v of spec.variables) {
    if (columnOf.has(v.symbol) && Object.keys(values.get(v.symbol)!).length === 0) problems.push(UPLOAD_TEXT.noValues(v.symbol));
  }
  if (problems.length) {
    const shown = problems.slice(0, MAX_PROBLEMS);
    if (problems.length > MAX_PROBLEMS) shown.push(UPLOAD_TEXT.more(problems.length - MAX_PROBLEMS));
    throw new UploadedDatasetError(shown);
  }

  const columns: DatasetColumn[] = spec.variables.map((v) => {
    const own = values.get(v.symbol)!;
    const places = decimals.get(v.symbol)!;
    const rounded = Object.fromEntries(Object.entries(own).map(([y, n]) => [y, roundTo(n, places)])) as Record<number, number>;
    const before = opts.previous?.columns.find((c) => c.symbol === v.symbol && c.source);
    // Left exactly as fetched: it is still the fetched series, with its own citation.
    if (before && sameValues(before.values, rounded)) return { ...before, name: v.name || before.name, role: v.role };
    return {
      symbol: v.symbol,
      name: v.name,
      role: v.role,
      catalogueKey: v.catalogueKey,
      unit: null,
      decimals: places,
      source: opts.sourceDescription,
      code: null,
      sourceNote: UPLOAD_TEXT.sourceNote,
      values: rounded,
    };
  });
  const dataset: Dataset = { start, end, frequency: "annual", columns };
  const missing: MissingItem[] = [];
  for (const c of columns) {
    const gaps = missingYears(dataset, c);
    if (gaps.length) missing.push({ symbol: c.symbol, name: c.name, code: "YEARS_MISSING", reason: MISSING_TEXT.YEARS_MISSING(c.source ?? opts.sourceDescription, yearRanges(gaps)), years: gaps });
  }
  return { dataset, missing };
}

/** The file the card offers: Year and the model's symbols, one row per year, with every value already fetched filled in. */
export function uploadTemplateCsv(spec: Pick<ModelSpec, "variables" | "period">, previous?: Dataset | null): string {
  const header = ["Year", ...spec.variables.map((v) => v.symbol)].join(",");
  const lines = [header];
  for (let y = spec.period.start; y <= spec.period.end; y++) {
    const cells = spec.variables.map((v) => {
      const c = previous?.columns.find((x) => x.symbol === v.symbol);
      const n = c?.values[y];
      return n === undefined ? "" : n.toFixed(c!.decimals);
    });
    lines.push([String(y), ...cells].join(","));
  }
  return lines.join("\n") + "\n";
}
