/**
 * Chapter-based final year reports.
 *
 * A client can order a few chapters instead of the whole report. Each chapter
 * is a fixed share of the full report's price (the price of the same report,
 * with or without data analysis), and the total is the shares added up. The
 * shares below are the founder's, and they add to 100%.
 */

export const CHAPTER_SERVICE_CODE = "FYP-CHAPTERS";

export const CHAPTER_SHARES = [
  { chapter: 1, percent: 12 },
  { chapter: 2, percent: 18 },
  { chapter: 3, percent: 30 },
  { chapter: 4, percent: 35 },
  { chapter: 5, percent: 5 },
] as const;

export interface ChapterLine {
  chapter: number;
  percent: number;
  amount: number;
}

export function isChapterService(serviceCode: string): boolean {
  return serviceCode === CHAPTER_SERVICE_CODE;
}

/** Sorted, de-duplicated, valid chapter numbers only. */
export function normalizeChapters(chapters: readonly number[] | undefined | null): number[] {
  const valid = new Set<number>(CHAPTER_SHARES.map((c) => c.chapter));
  return [...new Set(chapters ?? [])].filter((c) => valid.has(c)).sort((a, b) => a - b);
}

/** One line per chosen chapter, each a whole-naira share of `fullPrice`. */
export function chapterBreakdown(fullPrice: number, chapters: readonly number[]): { lines: ChapterLine[]; total: number } {
  const lines = normalizeChapters(chapters).map((chapter) => {
    const percent = CHAPTER_SHARES.find((c) => c.chapter === chapter)!.percent;
    return { chapter, percent, amount: Math.round((fullPrice * percent) / 100) };
  });
  return { lines, total: lines.reduce((sum, l) => sum + l.amount, 0) };
}

/**
 * The amount an intake is priced on. Ordinary services use the base price plus
 * the chosen option; the chapter-based service uses the share of that price the
 * chosen chapters make up. The one function both the form and the server use,
 * so what the student sees is what is charged.
 */
export function intakeBasePrice(input: {
  serviceCode: string;
  basePrice: number;
  variantAddon: number;
  chapters?: readonly number[] | null;
}): number {
  const full = input.basePrice + input.variantAddon;
  if (!isChapterService(input.serviceCode)) return full;
  return chapterBreakdown(full, input.chapters ?? []).total;
}

/** "1", "1 and 2", "1, 2 and 3" */
export function chapterListLabel(chapters: readonly number[]): string {
  const c = normalizeChapters(chapters);
  if (c.length <= 1) return c.join("");
  return `${c.slice(0, -1).join(", ")} and ${c[c.length - 1]}`;
}
