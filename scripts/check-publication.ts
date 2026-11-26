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

if (failures.length) {
  console.error(`check:publication — ${failures.length} failed, ${passed} passed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check:publication — all ${passed} checks passed`);
