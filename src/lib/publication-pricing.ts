/**
 * Publication papers.
 *
 * A client orders one or more papers drawn from one research report, and each
 * paper after the first costs less, because the expensive part — reading the
 * source report and deciding what it can support — is done once and shared.
 * That is not a goodwill discount: the source block is the cached prefix of
 * every paper's prompt, so papers two and three really are cheaper to produce
 * than paper one. The price list and the machinery agree.
 *
 * The founder's ladder (26 Nov 2026), for papers drawn from a report EduCraft
 * wrote: ₦20,000 · ₦17,000 · ₦15,000 · ₦13,000. A report EduCraft did NOT write
 * costs ₦5,000 more PER PAPER at every rung, because the source has to be read
 * out of the client's own file, its figures and tables lifted from it, and
 * every number in the paper checked back against prose we have never seen.
 *
 * Three things to know before changing anything here:
 *
 *  1. The rungs are SHARES of the first paper's price, not typed amounts, for
 *     the same reason `CHAPTER_SHARES` is: the first paper's price is the `PUB`
 *     service's own `basePrice`, which the founder edits on Settings > Services,
 *     and a typed ladder would move the price shown on /services without moving
 *     the price charged. At the founder's ₦20,000 the shares give his figures
 *     exactly — 100% · 85% · 75% · 65% is ₦20,000 · ₦17,000 · ₦15,000 · ₦13,000.
 *  2. The outside-report premium is per paper, not per order, so it cannot live
 *     in a service variant's `priceAddon`, which is added once. The breakdown
 *     applies it to every rung and `intakeBasePrice` passes the variant's addon
 *     in as that per-paper figure — so the premium is still the founder's to
 *     change on Settings > Services, without a code change.
 *  3. The ladder has four rungs because the founder priced four. A fifth paper
 *     holds the last rung rather than carrying the step down, which would walk
 *     the price towards nothing; past `MAX_PAPERS` it is a conversation, not a
 *     form.
 */

export const PUBLICATION_SERVICE_CODE = "PUB";

/**
 * Each paper's share of the first paper's price, first paper first. The
 * founder's ladder at a ₦20,000 first paper; shares, so the whole ladder moves
 * when he changes that price.
 */
export const PAPER_SHARES = [
  { paper: 1, percent: 100 },
  { paper: 2, percent: 85 },
  { paper: 3, percent: 75 },
  { paper: 4, percent: 65 },
] as const;

/** The most papers one order may hold. Beyond this the founder quotes it himself. */
export const MAX_PAPERS = 6;

export interface PaperLine {
  /** 1 for the first paper of the order. */
  paper: number;
  percent: number;
  /** The rung itself, before the outside-report premium. */
  ladderAmount: number;
  premium: number;
  amount: number;
}

export interface PublicationBreakdown {
  lines: PaperLine[];
  total: number;
  /** What one more paper would add, or null at MAX_PAPERS. */
  nextPaperAmount: number | null;
}

export function isPublicationService(serviceCode: string): boolean {
  return serviceCode === PUBLICATION_SERVICE_CODE;
}

/** At least one paper, at most MAX_PAPERS, whole papers only. */
export function normalizePaperCount(papers: number | undefined | null): number {
  if (typeof papers !== "number" || !Number.isFinite(papers)) return 1;
  return Math.min(MAX_PAPERS, Math.max(1, Math.floor(papers)));
}

/** The share the nth paper pays. A paper past the last rung holds that rung. */
export function paperPercent(paper: number): number {
  const i = Math.min(Math.max(1, Math.floor(paper)), PAPER_SHARES.length) - 1;
  return PAPER_SHARES[i].percent;
}

/**
 * What the nth paper of an order costs, in whole naira. `firstPaperPrice` is the
 * `PUB` service's own base price; `premium` is the per-paper figure for a report
 * EduCraft did not write (0 for our own).
 */
export function paperPrice(paper: number, firstPaperPrice: number, premium = 0): number {
  const rung = Math.round((firstPaperPrice * paperPercent(paper)) / 100);
  return rung + Math.max(0, Math.round(premium));
}

/** One line per paper, cheapest last, with the total the client is charged. */
export function publicationBreakdown(papers: number | undefined | null, firstPaperPrice: number, premium = 0): PublicationBreakdown {
  const count = normalizePaperCount(papers);
  const perPaper = Math.max(0, Math.round(premium));
  const lines: PaperLine[] = [];
  for (let paper = 1; paper <= count; paper++) {
    const percent = paperPercent(paper);
    const ladderAmount = Math.round((firstPaperPrice * percent) / 100);
    lines.push({ paper, percent, ladderAmount, premium: perPaper, amount: ladderAmount + perPaper });
  }
  return {
    lines,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
    nextPaperAmount: count < MAX_PAPERS ? paperPrice(count + 1, firstPaperPrice, perPaper) : null,
  };
}

/** "3 papers" / "1 paper", for a timeline line or an admin screen. */
export function paperCountLabel(papers: number | undefined | null): string {
  const n = normalizePaperCount(papers);
  return `${String(n)} paper${n === 1 ? "" : "s"}`;
}

/** Every sentence the system writes about publication pricing, for the founder to read in one place. */
export const PUBLICATION_PRICING_TEXT = {
  paperCountLabel: "How many papers do you want from this report?",
  paperCountHint: "Each paper after the first costs less, because the report only has to be read once.",
  /** The variant's own name must match this, or the premium is not applied per paper. */
  outsideReportVariant: "From a report EduCraft did not write",
  outsideReportHint:
    "A report we wrote is already on your account, so we work from it directly. A report from somewhere else has to be read, its figures and tables lifted out of it, and every number in the paper checked back against it, which is why each paper costs more.",
  /** The founder's call of 26 Nov 2026: a manuscript, not a submission. */
  manuscriptOnly:
    "You receive a submission-ready manuscript as a Word file, formatted to the journal's two-column layout. EduCraft does not submit it for you, does not hold an account with any journal, and cannot promise that a journal will accept it.",
  sourceFormat:
    "Send the report as a Word file (.docx) if you have one. We can read a PDF, but figures and charts cannot be lifted out of a PDF automatically, so a Word file keeps your own figures in the paper.",
} as const;
