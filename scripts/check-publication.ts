/**
 * The publication format profile, against the founder's own §3.11
 * (`DATA/QUALITY CHECK SYSTEM/EDUCRAFT_STRUCTURAL_QUALITY_v1.1`) and his two calls of 26 Nov 2026.
 *
 * No database, no Word, no Claude. The load-bearing group is the last one: the two formats that
 * already shipped must come out of the profile exactly as the constants they were built from say,
 * or threading the profile through the assembly would change an existing report.
 *
 *   npm run check:publication
 */

import {
  COLUMN_GAP,
  ENGINEERING_PROFILE,
  FORMAT_PROFILES,
  FORMAT_PROFILE_IDS,
  FORMAT_PROFILE_TEXT,
  FYP_PROFILE,
  PUBLICATION_COLUMN_WIDTH,
  PUBLICATION_MARGIN,
  PUBLICATION_PROFILE,
  PUBLICATION_TEXT_WIDTH,
  allowedSizes,
  equationCellWidth,
  equationNumberCellWidth,
  equationNumberText,
  equationReference,
  formatProfileFor,
} from "../src/lib/assembly/format-profile";
import { DOUBLE, FONT_NAME, FOOTNOTE_SIZE, PAGE, SINGLE, SIZE, TEXT_WIDTH } from "../src/lib/assembly/styles";
import { intakeBasePrice } from "../src/lib/chapter-pricing";
import {
  MAX_PAPERS,
  PAPER_SHARES,
  PUBLICATION_PRICING_TEXT,
  isPublicationService,
  normalizePaperCount,
  paperCountLabel,
  paperPrice,
  publicationBreakdown,
} from "../src/lib/publication-pricing";
import { RETIRED_SERVICE_CODES, SERVICE_CATALOGUE } from "../prisma/catalogue";

const PUB_SERVICE = SERVICE_CATALOGUE.find((s) => s.serviceCode === "PUB");
const RETIRED = RETIRED_SERVICE_CODES as readonly string[];
if (!PUB_SERVICE) throw new Error("the PUB service is not in prisma/catalogue.ts");
const PUB_FIRST_PAPER = PUB_SERVICE.basePrice;
const PUB_VARIANT_NAME = PUB_SERVICE.variants?.[0]?.name ?? "";
const PUB_OUTSIDE_PREMIUM = PUB_SERVICE.variants?.[0]?.priceAddon ?? 0;

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail: unknown = "") {
  if (ok) passed++;
  else failures.push(`${label}${detail !== "" ? ` — ${JSON.stringify(detail)}` : ""}`);
}

// ─── §3.11's own numbers ─────────────────────────────────────────────────────

check("US Letter, 8.5 x 11 inches, in twips", PUBLICATION_PROFILE.page.size.width === 12240 && PUBLICATION_PROFILE.page.size.height === 15840, PUBLICATION_PROFILE.page.size);
check("0.70 inch margins on all four sides", PUBLICATION_MARGIN === 1008 && ["top", "bottom", "left", "right"].every((k) => PUBLICATION_PROFILE.page.margin[k] === 1008), PUBLICATION_PROFILE.page.margin);
check("the text width follows from them", PUBLICATION_TEXT_WIDTH === 12240 - 2 * 1008 && PUBLICATION_PROFILE.textWidth === PUBLICATION_TEXT_WIDTH, PUBLICATION_TEXT_WIDTH);
check("two equal columns with a 0.25 inch gap", PUBLICATION_PROFILE.columns?.count === 2 && COLUMN_GAP === 360 && PUBLICATION_PROFILE.columns?.space === 360);
check("each column is half of what is left after the gap", PUBLICATION_COLUMN_WIDTH === (PUBLICATION_TEXT_WIDTH - COLUMN_GAP) / 2 && PUBLICATION_COLUMN_WIDTH === 4932, PUBLICATION_COLUMN_WIDTH);
check("the two columns and the gap fill the text width exactly", 2 * PUBLICATION_COLUMN_WIDTH + COLUMN_GAP === PUBLICATION_TEXT_WIDTH);

check("body 10pt, title 14pt, captions and affiliation 9pt (half-points)", PUBLICATION_PROFILE.size === 20 && PUBLICATION_PROFILE.titleSize === 28 && PUBLICATION_PROFILE.captionSize === 18 && PUBLICATION_PROFILE.affiliationSize === 18);
check("single spaced, nothing before or after", PUBLICATION_PROFILE.spacing === SINGLE && PUBLICATION_PROFILE.spacing.line === 240 && PUBLICATION_PROFILE.spacing.before === 0 && PUBLICATION_PROFILE.spacing.after === 0);
check("Times New Roman, like every other EduCraft document", PUBLICATION_PROFILE.font === FONT_NAME);
check("three-line tables only", PUBLICATION_PROFILE.threeLineTables);
check("no preliminary pages: a journal supplies its own front matter", PUBLICATION_PROFILE.prelims === false);
check("Roman-and-letter headings (I. INTRODUCTION, A. Theoretical basis)", PUBLICATION_PROFILE.headingNumbering === "roman-letter" && FYP_PROFILE.headingNumbering === "none");

// ─── The equation-numbering exception ────────────────────────────────────────

check("a publication's equation numbers carry parentheses and run 1..N", (() => {
  const p = PUBLICATION_PROFILE.equationNumbers;
  return p.parenthesised && !p.perChapter && equationNumberText(PUBLICATION_PROFILE, 3, 1) === "(1)" && equationNumberText(PUBLICATION_PROFILE, 4, 7) === "(7)";
})(), equationNumberText(PUBLICATION_PROFILE, 3, 1));
check("a report's do neither, and restart each chapter", (() => {
  const p = FYP_PROFILE.equationNumbers;
  return !p.parenthesised && p.perChapter && equationNumberText(FYP_PROFILE, 3, 1) === "3.1" && equationNumberText(FYP_PROFILE, 4, 2) === "4.2";
})(), equationNumberText(FYP_PROFILE, 3, 1));
check("the prose reference follows the same rule", equationReference(FYP_PROFILE, 3, 1) === "Equation 3.1" && equationReference(PUBLICATION_PROFILE, 3, 1) === "Eq. (1)");
check("the exception is written down where a reader will find it", /documented exception/i.test(FORMAT_PROFILE_TEXT.equationException) && /parentheses/i.test(FORMAT_PROFILE_TEXT.equationException));
check("so is the page-inheritance trap, which is the riskiest part of a two-column paper", /do NOT inherit/.test(FORMAT_PROFILE_TEXT.pageInheritance) && /every section/i.test(FORMAT_PROFILE_TEXT.pageInheritance));

// ─── An equation has to fit the COLUMN, not the page ─────────────────────────

check("a report's equation table fills the text width", equationCellWidth(FYP_PROFILE) + equationNumberCellWidth(FYP_PROFILE) === TEXT_WIDTH, [equationCellWidth(FYP_PROFILE), equationNumberCellWidth(FYP_PROFILE)]);
check("a publication's fills one column, which is far narrower", equationCellWidth(PUBLICATION_PROFILE) + equationNumberCellWidth(PUBLICATION_PROFILE) === PUBLICATION_COLUMN_WIDTH && equationCellWidth(PUBLICATION_PROFILE) < equationCellWidth(FYP_PROFILE));
check("...which is the whole point: the page's width would overflow the column", PUBLICATION_TEXT_WIDTH > PUBLICATION_COLUMN_WIDTH * 2 - 1);
check("the equation cell is the wider of the two in both formats", equationCellWidth(FYP_PROFILE) > equationNumberCellWidth(FYP_PROFILE) && equationCellWidth(PUBLICATION_PROFILE) > equationNumberCellWidth(PUBLICATION_PROFILE));

// ─── The gate's size allow-set ───────────────────────────────────────────────

check("a report allows one body size, and the footnote size only with footnotes", JSON.stringify(allowedSizes(FYP_PROFILE)) === JSON.stringify([SIZE]) && JSON.stringify(allowedSizes(FYP_PROFILE, { footnotes: true })) === JSON.stringify([FOOTNOTE_SIZE, SIZE]));
check("a publication allows its three sizes", JSON.stringify(allowedSizes(PUBLICATION_PROFILE)) === JSON.stringify([18, 20, 28]), allowedSizes(PUBLICATION_PROFILE));
check(
  "a publication's 10pt body collides with the footnote size, so footnotes must never be allowed in one",
  PUBLICATION_PROFILE.size === FOOTNOTE_SIZE && allowedSizes(PUBLICATION_PROFILE, { footnotes: true }).length === allowedSizes(PUBLICATION_PROFILE).length,
  { body: PUBLICATION_PROFILE.size, footnote: FOOTNOTE_SIZE },
);

// ─── Which profile a document gets ───────────────────────────────────────────

check("a publication is picked by its own axis, not by a department", formatProfileFor({ documentFormat: "PUBLICATION" }) === PUBLICATION_PROFILE && formatProfileFor({ section: "NURSING", documentFormat: "PUBLICATION" }) === PUBLICATION_PROFILE);
check("...in every department, which is why it cannot come from the section", ["ENGINEERING", "NURSING", "HUMANITIES", "LAW_DOCTRINAL", null].every((section) => formatProfileFor({ section, documentFormat: "PUBLICATION" }) === PUBLICATION_PROFILE));
check("an engineering report keeps its three-line tables", formatProfileFor({ section: "ENGINEERING" }) === ENGINEERING_PROFILE && ENGINEERING_PROFILE.threeLineTables);
check("every other report gets the standard format", ["NURSING", "BUSINESS", "HUMANITIES", null, undefined].every((section) => formatProfileFor({ section }) === FYP_PROFILE));
check("every id has a profile and every profile has its own id", FORMAT_PROFILE_IDS.every((id) => FORMAT_PROFILES[id]?.id === id) && Object.keys(FORMAT_PROFILES).length === FORMAT_PROFILE_IDS.length);

// ─── The load-bearing group: the shipped formats are UNMOVED ─────────────────
//
// Everything above describes a document EduCraft has never built. These assert that the two it has
// built come out of the profile exactly as the constants they were built from say. If one of these
// fails, threading the profile through the assembly would silently change a real report.

check("the standard profile IS the shipped constants, not a copy of their values", FYP_PROFILE.size === SIZE && FYP_PROFILE.font === FONT_NAME && FYP_PROFILE.spacing === DOUBLE && FYP_PROFILE.page === PAGE && FYP_PROFILE.textWidth === TEXT_WIDTH && FYP_PROFILE.footnoteSize === FOOTNOTE_SIZE);
check("12pt double spaced on A4 with 1 inch margins, as every report has been", FYP_PROFILE.size === 24 && FYP_PROFILE.spacing.line === 480 && FYP_PROFILE.page.size.width === 11906 && FYP_PROFILE.page.margin.left === 1440);
check("one column, preliminary pages, no three-line tables", FYP_PROFILE.columns === null && FYP_PROFILE.prelims && !FYP_PROFILE.threeLineTables);
check("centred capitals, Title Case, sentence case: the house heading rules", JSON.stringify(FYP_PROFILE.headings) === JSON.stringify({ h1: "UPPER", h2: "TITLE", h3: "SENTENCE" }));
check("the engineering profile differs from the standard in exactly one thing", (() => {
  const differing = (Object.keys(FYP_PROFILE) as (keyof typeof FYP_PROFILE)[]).filter((k) => JSON.stringify(FYP_PROFILE[k]) !== JSON.stringify(ENGINEERING_PROFILE[k]));
  return differing.length === 2 && differing.includes("id") && differing.includes("threeLineTables");
})(), (Object.keys(FYP_PROFILE) as (keyof typeof FYP_PROFILE)[]).filter((k) => JSON.stringify(FYP_PROFILE[k]) !== JSON.stringify(ENGINEERING_PROFILE[k])));
check("a report's equation widths are the integers the assembly already uses", equationCellWidth(FYP_PROFILE) === Math.round(TEXT_WIDTH * 0.85) && equationCellWidth(ENGINEERING_PROFILE) === Math.round(TEXT_WIDTH * 0.85));

// ─── The pricing ladder, against the founder's own figures ───────────────────
//
// The founder's words, 26 Nov 2026: "for report we write, the pricing should be,
// 20K for first paper, 17k for 2nd paper, 15k for 3rd paper, while 13k for
// fourth paper, while for those we didn't write, add increment of 5K".
// These assertions are those four numbers and that one increment. The shares in
// `publication-pricing.ts` must reproduce them from the live `PUB` base price,
// so a price the founder changes on Settings > Services moves the whole ladder.

const FIRST = PUB_FIRST_PAPER; // the PUB service's basePrice in prisma/catalogue.ts
const PREMIUM = PUB_OUTSIDE_PREMIUM; // its variant's priceAddon

check("the catalogue's PUB first paper is the founder's N20,000", FIRST === 20_000, FIRST);
check("its one variant is the outside-report premium at N5,000 per paper", PREMIUM === 5_000, PREMIUM);
check(
  "the variant is named exactly as the pricing module expects, so the premium is applied per paper",
  PUB_VARIANT_NAME === PUBLICATION_PRICING_TEXT.outsideReportVariant,
  [PUB_VARIANT_NAME, PUBLICATION_PRICING_TEXT.outsideReportVariant],
);
check(
  "the premium must never read as a data-analysis option, which would change what the client is asked for",
  !/data analysis/i.test(PUB_VARIANT_NAME),
  PUB_VARIANT_NAME,
);

const ours = [1, 2, 3, 4].map((n) => paperPrice(n, FIRST, 0));
check("a report EduCraft wrote: 20,000 / 17,000 / 15,000 / 13,000", JSON.stringify(ours) === JSON.stringify([20_000, 17_000, 15_000, 13_000]), ours);
const outside = [1, 2, 3, 4].map((n) => paperPrice(n, FIRST, PREMIUM));
check("a report EduCraft did not write: each rung plus 5,000", JSON.stringify(outside) === JSON.stringify([25_000, 22_000, 20_000, 18_000]), outside);
check("the premium is the only difference, at every rung", ours.every((v, i) => outside[i] - v === PREMIUM));

check("every rung is cheaper than the one before it", ours.every((v, i) => i === 0 || v < ours[i - 1]), ours);
check("the first paper is the full price, and nothing is free", PAPER_SHARES[0].percent === 100 && PAPER_SHARES.every((s) => s.percent > 0));
check("the shares are the ladder, so the base price drives it", (() => {
  // Double the first paper's price and every rung doubles with it.
  const doubled = [1, 2, 3, 4].map((n) => paperPrice(n, FIRST * 2, 0));
  return JSON.stringify(doubled) === JSON.stringify(ours.map((v) => v * 2));
})());

check("a fifth paper holds the last rung rather than walking the price down", paperPrice(5, FIRST, 0) === 13_000 && paperPrice(6, FIRST, 0) === 13_000);
check("the paper count is clamped to 1..MAX_PAPERS", normalizePaperCount(0) === 1 && normalizePaperCount(-3) === 1 && normalizePaperCount(99) === MAX_PAPERS && normalizePaperCount(2.7) === 2);
check("a missing or broken count is one paper, never zero", normalizePaperCount(undefined) === 1 && normalizePaperCount(null) === 1 && normalizePaperCount(Number.NaN) === 1);

check("three papers from our own report total 52,000", publicationBreakdown(3, FIRST, 0).total === 52_000, publicationBreakdown(3, FIRST, 0).total);
check("three papers from an outside report total 67,000", publicationBreakdown(3, FIRST, PREMIUM).total === 67_000, publicationBreakdown(3, FIRST, PREMIUM).total);
check("one paper is just the first rung", publicationBreakdown(1, FIRST, 0).total === 20_000 && publicationBreakdown(1, FIRST, PREMIUM).total === 25_000);
check("the total is its lines added up, every time", [1, 2, 3, 4, 5, 6].every((n) => {
  const b = publicationBreakdown(n, FIRST, PREMIUM);
  return b.lines.length === n && b.total === b.lines.reduce((s, l) => s + l.amount, 0);
}));
check("each line shows the rung and the premium separately, so the client sees what the premium is for", (() => {
  const b = publicationBreakdown(2, FIRST, PREMIUM);
  return b.lines.every((l) => l.amount === l.ladderAmount + l.premium) && b.lines[1].ladderAmount === 17_000 && b.lines[1].premium === 5_000;
})());
check("'one more paper' is quoted at the next rung, and stops at the cap", publicationBreakdown(1, FIRST, 0).nextPaperAmount === 17_000 && publicationBreakdown(MAX_PAPERS, FIRST, 0).nextPaperAmount === null);
check("the label counts papers in plain English", paperCountLabel(1) === "1 paper" && paperCountLabel(3) === "3 papers");

// `intakeBasePrice` is the one function the intake form, the Paystack checkout,
// the submit path, the coupon quote and the reprice dialog all call. If it and
// the breakdown ever disagree, the price shown is not the price charged.
check("intakeBasePrice prices a publication order by the ladder, not base + addon", (() => {
  const shown = publicationBreakdown(3, FIRST, PREMIUM).total;
  const charged = intakeBasePrice({ serviceCode: "PUB", basePrice: FIRST, variantAddon: PREMIUM, papers: 3 });
  return shown === charged && charged === 67_000;
})(), intakeBasePrice({ serviceCode: "PUB", basePrice: FIRST, variantAddon: PREMIUM, papers: 3 }));
check(
  "the variant addon is applied PER PAPER, so it can never be added just once",
  intakeBasePrice({ serviceCode: "PUB", basePrice: FIRST, variantAddon: PREMIUM, papers: 3 }) - intakeBasePrice({ serviceCode: "PUB", basePrice: FIRST, variantAddon: 0, papers: 3 }) === 3 * PREMIUM,
);
check("a publication order with no paper count is priced as one paper, never as zero", intakeBasePrice({ serviceCode: "PUB", basePrice: FIRST, variantAddon: 0 }) === 20_000);
check("every other service is priced exactly as before: base plus the option", (() => {
  const full = intakeBasePrice({ serviceCode: "FYP-FULL", basePrice: 70_000, variantAddon: 20_000 });
  const thesis = intakeBasePrice({ serviceCode: "THESIS", basePrice: 120_000, variantAddon: 40_000 });
  const chapters = intakeBasePrice({ serviceCode: "FYP-CHAPTERS", basePrice: 70_000, variantAddon: 0, chapters: [1, 2] });
  // A stray `papers` on a non-publication order changes nothing.
  const ignored = intakeBasePrice({ serviceCode: "FYP-FULL", basePrice: 70_000, variantAddon: 20_000, papers: 4 });
  return full === 90_000 && thesis === 160_000 && chapters === 21_000 && ignored === 90_000;
})());
check("only PUB takes the publication path", isPublicationService("PUB") && !isPublicationService("FYP-FULL") && !isPublicationService("THESIS") && !isPublicationService("PUB-X"));

// ─── The two lists deliberately overlap, and that nearly undid a decision ────
//
// A retired code keeps its catalogue entry (its prices are history, and existing
// projects point at it), so the two lists overlap on purpose. The sync's
// catalogue loop sets `isActive: true` on everything it writes, which meant the
// twelve services the founder retired on 26 Nov 2026 would have come back to
// life on the very next `--apply`. These assertions hold the data side of the
// fix: the services EduCraft sells must not be in the retired list at all.

check("the publication service EduCraft sells is not in the retired list", !RETIRED.includes("PUB"));
check(
  "nor is anything else the business is specialising on",
  ["FYP-FULL", "FYP-PROP", "FYP-CHAPTERS", "FYP-CH4", "THESIS", "SEM", "ENT-PROJ", "PPT-FYP"].every((c) => !RETIRED.includes(c)),
  ["FYP-FULL", "FYP-PROP", "FYP-CHAPTERS", "FYP-CH4", "THESIS", "SEM", "ENT-PROJ", "PPT-FYP"].filter((c) => RETIRED.includes(c)),
);
check("every retired code is named once", new Set(RETIRED).size === RETIRED.length);
check(
  "the overlap is exactly the twelve services retired on 26 Nov 2026, so a live service cannot be retired by accident",
  (() => {
    const overlap = SERVICE_CATALOGUE.filter((s) => RETIRED.includes(s.serviceCode)).map((s) => s.serviceCode).sort();
    const expected = ["ASSIGN", "CASE", "EDIT-IT", "ESSAY", "IT-3M", "IT-6M", "IT-PPT", "LTR-APP", "LTR-FORM", "LTR-INF", "MINI", "TERM"];
    return JSON.stringify(overlap) === JSON.stringify(expected);
  })(),
  SERVICE_CATALOGUE.filter((s) => RETIRED.includes(s.serviceCode)).map((s) => s.serviceCode).sort(),
);

// What the client is told, and what EduCraft does not promise.
check("the manuscript-only limit is written down where a reader will find it", /does not submit it for you/i.test(PUBLICATION_PRICING_TEXT.manuscriptOnly) && /cannot promise/i.test(PUBLICATION_PRICING_TEXT.manuscriptOnly));
check("the PDF figure limit is stated honestly rather than implied", /cannot be lifted out of a PDF/i.test(PUBLICATION_PRICING_TEXT.sourceFormat));
// The house rule, not a stricter one of my own: `check:client-copy` owns the
// list and now scans `publication-pricing.ts` itself. This asserts the two
// words a publication order is most likely to leak.
check("no client-facing sentence here mentions AI or Claude", (() => {
  const banned = /\bAI\b|\b(claude|anthropic)\b/i;
  return Object.values(PUBLICATION_PRICING_TEXT).every((s) => !banned.test(s));
})());

if (failures.length) {
  console.error(`check:publication — ${failures.length} failed, ${passed} passed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check:publication — all ${passed} checks passed`);
