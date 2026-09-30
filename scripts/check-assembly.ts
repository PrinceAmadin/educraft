/**
 * Phase D7 checks (no database, no Word, no Claude): the text rules, the
 * equation parser, the chapter parser, then two whole reports built from
 * fixture chapters (a Business survey and an Engineering lab report) and
 * read back from their XML, rule by rule against prompts/shared/formatting_rules.md.
 *
 *   npm run check:assembly                 run the checks
 *   npm run check:assembly -- --out <dir>  also write the two .docx files there (for Word)
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import {
  chapterWord,
  citationsIn,
  citedReferences,
  findPlaceholders,
  fixSentenceDashes,
  inlineSegments,
  properNounsFrom,
  renumberEquationRefs,
  sentenceCase,
  splitEquationNumber,
  titleCase,
} from "../src/lib/assembly/text-rules";
import { linearText, parseEquation } from "../src/lib/assembly/equation-omml";
import { detectEquationLine, parseChapter, parsePipeTable } from "../src/lib/assembly/parse-chapter";
import { packReport, reportFileName, type AssemblyInput } from "../src/lib/assembly/assemble";
import { analyseChapterNotes, collectEndnotes, entryFor, resolveNotes } from "../src/lib/assembly/endnotes";
import { referencesForNote, superscriptNotes } from "../src/lib/assembly/text-rules";
import { E_EXTRA, E_OBJECTIVES, E_REFERENCES, E_THEMATIC, E_TITLE, endnotesChapters } from "./fixtures/endnotes-fixture";
import { ASSEMBLY_REFS, assemblyChapters, assemblyInput } from "./fixtures/assembly-fixture";

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const eq = (label: string, got: unknown, want: unknown) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ─── Text rules ──────────────────────────────────────────────────────────────

const segs = (t: string, o?: { inTable?: boolean }) => inlineSegments(t, o).map((s) => (s.italics ? `<i>${s.text}</i>` : s.text)).join("");
eq("et al. italic (unmarked)", segs("Okafor et al. (2020) found"), "Okafor <i>et al.</i> (2020) found");
eq("et al. italic (asterisks)", segs("Musa *et al.* (2021)"), "Musa <i>et al.</i> (2021)");
eq("et al. without stop", segs("Bello et al, 2019"), "Bello <i>et al.</i>, 2019");
eq("et. al. slip", segs("(Eze et. al., 2018)"), "(Eze <i>et al.</i>, 2018)");
eq("not inside a word", segs("the petal alone"), "the petal alone");
eq("journal italics kept", segs("in *Journal of Banking*, 12"), "in <i>Journal of Banking</i>, 12");
eq("bold markers dropped", segs("a **key** point"), "a key point");
eq("stray asterisk dropped in prose", segs("value* here"), "value here");
eq("significance star kept in a table", segs("0.032*", { inTable: true }), "0.032*");
eq("two stars in a table cell", segs("0.001**", { inTable: true }), "0.001**");
const subs = (t: string) => inlineSegments(t).map((s) => (s.sub ? `<sub>${s.text}</sub>` : s.text)).join("");
eq("prose symbols get real subscripts", subs("where f_m is the mean and f_c the characteristic strength, η_{charge} the efficiency"), "where f<sub>m</sub> is the mean and f<sub>c</sub> the characteristic strength, η<sub>charge</sub> the efficiency");
eq("…but not snake_case words or file names", subs("see mix_design_v2 and table_1.csv"), "see mix_design_v2 and table_1.csv");
const supMark = (t: string) => inlineSegments(t).map((s) => (s.sup ? `<sup>${s.text}</sup>` : s.text)).join("");
eq("^N in prose becomes a superscript (Fix 3)", supMark("...the market for cassava.^3 Traders now record"), "...the market for cassava.<sup>3</sup> Traders now record");
eq("^{N} braces are stripped", supMark("the same trend.^{12}"), "the same trend.<sup>12</sup>");
eq("^[N] brackets are stripped", supMark("adoption rose.^[3]"), "adoption rose.<sup>3</sup>");
eq("a trailing [N] after a word is a note marker", supMark("cassava traders[3] now record"), "cassava traders<sup>3</sup> now record");
eq("years and page numbers are not superscripted on their own", supMark("in the last 5 years"), "in the last 5 years");
eq("a real placeholder is left alone", supMark("[DATA NOT PROVIDED — COO TO REVIEW]"), "[DATA NOT PROVIDED — COO TO REVIEW]");
eq("[N] at the start of a line is not a note marker (no preceding word)", supMark("[3] is a stray label"), "[3] is a stray label");

eq("P2 spaced em dash", fixSentenceDashes("adoption rose — especially among women").text, "adoption rose, especially among women");
eq("P2 unspaced em dash", fixSentenceDashes("traders—mostly women—use it").text, "traders, mostly women, use it");
eq("P2 spaced hyphen", fixSentenceDashes("the result - as expected - was clear").text, "the result, as expected, was clear");
eq("P2 keeps ranges", fixSentenceDashes("from 2000–2023 and pp. 12 – 15").text, "from 2000–2023 and pp. 12 – 15");
eq("P2 keeps compounds", fixSentenceDashes("co-operative and Nigeria–Ghana trade").text, "co-operative and Nigeria–Ghana trade");
eq("P2 keeps placeholders", fixSentenceDashes("[DATA NOT PROVIDED — COO TO REVIEW]").text, "[DATA NOT PROVIDED — COO TO REVIEW]");
eq("P2 counts", fixSentenceDashes("a — b — c").fixed, 2);

eq("AL3 title case", titleCase("1.1 background of the study"), "1.1 Background of the Study");
eq("AL3 keeps acronyms", titleCase("3.4 reliability of the SPSS instrument"), "3.4 Reliability of the SPSS Instrument");
eq("AL3 keeps COVID-19 and mHealth", titleCase("2.3 mHealth use during COVID-19"), "2.3 mHealth Use During COVID-19");
eq("AL3 shouted heading", titleCase("1.2 STATEMENT OF THE PROBLEM"), "1.2 Statement of the Problem");
eq("AL3 hyphenated", titleCase("2.2 self-efficacy theory"), "2.2 Self-Efficacy Theory");
const nouns = properNounsFrom(["Traders in Nigeria face high fees. Many shops in Lagos now use it, as Yamane showed."]);
check("proper nouns found", nouns.has("Nigeria") && nouns.has("Lagos") && nouns.has("Yamane") && !nouns.has("Traders"), [...nouns].join(","));
eq("AL4 sentence case", sentenceCase("1.2.1 Challenges Facing Traders In Nigeria", nouns), "1.2.1 Challenges facing traders in Nigeria");
// Real Chapter 3 (D7 live test): "Rice Husk Ash" capitalised in one sentence and in captions, "rice husk ash" everywhere else.
const engNouns = properNounsFrom([
  "Table 3.1: Properties of Rice Husk Ash\n| Rice Husk Ash | Cement |\nThe husk was collected at Abakaliki. The Rice Husk Ash was ground, and the rice husk ash was then mixed with cement from Ewekoro.",
]);
check("words also written in lower case are not names", !engNouns.has("Rice") && !engNouns.has("Husk") && !engNouns.has("Cement") && engNouns.has("Abakaliki") && engNouns.has("Ewekoro"), [...engNouns].join(","));
eq("…so the heading is plain sentence case", sentenceCase("3.2.2 Source of Rice Husk, Cement and Aggregates", engNouns), "3.2.2 Source of rice husk, cement and aggregates");
eq("AL4 keeps acronyms", sentenceCase("3.5.1 Data Analysis Using SPSS", nouns), "3.5.1 Data analysis using SPSS");
eq("AL4 after a colon", sentenceCase("2.1.1 Theory: An Overview", nouns), "2.1.1 Theory: An overview");
eq("chapter words", [1, 2, 3, 4, 5].map(chapterWord), ["ONE", "TWO", "THREE", "FOUR", "FIVE"]);

eq("EQ3 references renumbered", renumberEquationRefs("from Equation (3.1) and Eq. 3.2", new Map([["3.1", "3.1"], ["3.2", "3.3"]])), "from Equation 3.1 and Eq. 3.3");
eq("equation number split", splitEquationNumber("n = N / (1 + N(e²)) (3.1)"), { text: "n = N / (1 + N(e²))", number: "3.1" });
eq("a value is not a number label", splitEquationNumber("x = 3.1"), { text: "x = 3.1", number: null });
eq("placeholders", findPlaceholders("A [DATA NOT PROVIDED — COO TO REVIEW] b p. [page] [FIGURE PLACEHOLDER: map] [CASE TO BE SUPPLIED]"), ["[DATA NOT PROVIDED — COO TO REVIEW]", "p. [page]", "[FIGURE PLACEHOLDER]", "[CASE TO BE SUPPLIED]"]);
// FIX 2: the count and date placeholders written into Ch3 before the client sends the data.
eq(
  "count-before-pause placeholders are all caught",
  findPlaceholders("A total of [N_DISTRIBUTED] were sent, [N_RETURNED] returned, [N_USABLE] usable, giving [RESPONSE_RATE]. Frame: [POPULATION_SIZE]; achieved [SAMPLE_SIZE]; between [FIELDWORK_PERIOD]."),
  ["[N_DISTRIBUTED]", "[N_RETURNED]", "[N_USABLE]", "[RESPONSE_RATE]", "[POPULATION_SIZE]", "[SAMPLE_SIZE]", "[FIELDWORK_PERIOD]"],
);

const cites = citationsIn("As Adeyemi and Bello (2019) note, fees fell (Okafor et al., 2020; Central Bank of Nigeria, 2022). Musa (2021, p. [page]) agrees (see Eze, 2018a, 2019). Between 2000–2023 (N = 384) nothing.");
eq(
  "citation forms",
  cites.map((c) => `${c.author}|${c.year}`).sort(),
  ["Adeyemi|2019", "Central Bank of Nigeria|2022", "Eze|2018a", "Eze|2019", "Musa|2021", "Okafor|2020"].sort(),
);
const refs = [
  { authors: "Okafor, C.; Musa, A.; Eze, B.", year: 2020 },
  { authors: "Adeyemi, T.; Bello, K.", year: 2019 },
  { authors: "Central Bank of Nigeria", year: 2022 },
  { authors: "Musa, A.", year: 2021 },
  { authors: "Uncited, Z.", year: 2018 },
];
const cr = citedReferences(refs, ["Okafor et al. (2020) and (Adeyemi & Bello, 2019); Central Bank of Nigeria (2022); Musa (2021); (Ghost, 2015)"]);
eq("cited only", cr.cited.map((r) => r.authors?.split(",")[0]), ["Okafor", "Adeyemi", "Central Bank of Nigeria", "Musa"]);
eq("uncited left out", cr.uncited.length, 1);
eq(
  "accented and hyphenated names; & in brackets; sources are not works",
  citationsIn("Demirgüç-Kunt et al. (2019) and Konté and Tetteh (2022) agree (Najib & Fahma, 2020). Figure 4.1 (Field Survey, 2026); Table 2.1 (Researcher's compilation, 2026)").map((c) => `${c.author}|${c.year}`).sort(),
  ["Demirgüç-Kunt|2019", "Konté|2022", "Najib|2020"],
);
const accented = citedReferences([{ authors: "Demirgüç‐Kunt, A.; Klapper, L. F.", year: 2019 }, { authors: "Najib, M.; Fahma, F.", year: 2020 }], ["Demirgüç-Kunt et al. (2019) and (Najib & Fahma, 2020)"]);
eq("…and they match their references", [accented.cited.length, accented.unmatched], [2, []]);
eq("unmatched citation reported", cr.unmatched, ["Ghost, 2015"]);

// ─── Equations ───────────────────────────────────────────────────────────────

const lin = (t: string) => linearText(parseEquation(t).nodes);
eq("Yamane", lin("n = N / (1 + N(e²))"), "n = (N)/(1 + N(e^{2}))");
eq("regression β subscripts", lin("GDP = β0 + β1(INF) + β2(EXR) + ε"), "GDP = β_{0} + β_{1}(INF) + β_{2}(EXR) + ε");
eq("engineering subscripts and fraction", lin("P_panel = (P_load × t × SF) / η_charge"), "P_{panel} = (P_{load} × t × SF)/(η_{charge})");
eq("sqrt and power", lin("σ = √(Σ(x − μ)² / N)"), "σ = √((∑(x − μ)^{2})/(N))");
eq("braced script", lin("Y_{it} = α + βX_{it}"), "Y_{it} = α + βX_{it}");
eq("function upright", parseEquation("y = ln(x)").nodes.some((n) => n.t === "run" && n.text === "ln" && !n.italic), true);
eq("unreadable falls back to runs", parseEquation("a = (b").structured, false);
eq("words keep their space", lin("Total cost = Unit cost × Quantity"), "Total cost = Unit cost × Quantity");

eq("equation line (bare)", detectEquationLine("n = N / (1 + N(e²))    (3.1)"), { text: "n = N / (1 + N(e²))", number: "3.1" });
eq("equation line ([Equation])", detectEquationLine("[Equation 3.2: σ = P / A]"), { text: "σ = P / A", number: "3.2" });
eq("a sentence is not an equation", detectEquationLine("The sample size was then worked out as n = 384 using the formula below."), null);
eq("a definition is not an equation", detectEquationLine("where n = sample size"), null);
eq("a symbol defined in words is not an equation", detectEquationLine("n = sample size"), null);
eq("…even with a value in brackets", detectEquationLine("N = population of the study (4,200)"), null);
eq("a short formula still is", detectEquationLine("σ = P / A"), { text: "σ = P / A", number: null });
const defs = parseChapter("[H2] 3.4 Sample Size\nThe formula is:\n\nn = N / (1 + N(e²))    (3.1)\n\nwhere:\nn = sample size\nN = population (4,200)\ne = level of precision (0.05)", 3);
eq("definition lines stay lines", defs.blocks.map((b) => b.kind), ["heading", "paragraph", "equation", "paragraph", "paragraph", "paragraph", "paragraph"]);

eq("pipe table without outer pipes", parsePipeTable(["Statistic | GDP | INF", "--- | --- | ---", "Mean | 12.1 | 13.4"]), { header: ["Statistic", "GDP", "INF"], rows: [["Mean", "12.1", "13.4"]] });

// ─── Chapter parser ──────────────────────────────────────────────────────────

const CH3 = `[H1] CHAPTER THREE
[H1] RESEARCH METHODOLOGY
[H2] 3.1 Introduction
This chapter describes the methods. The sample size follows Yamane (1967) in Equation (3.1).

n = N / (1 + N(e²))    (3.1)

where n = sample size and N = population.

[EQ] GDP = β0 + β1(INF) + β2(EXR) + ε | 3.2 [/EQ]

3.2 Research Design
A survey design was adopted.

Table 3.1: Distribution of the Sample
| Market | Population | Sample |
|---|---|---|
| Balogun | 400 | 120 |
| Oshodi | 300 | 90 |
Source: Field Survey, 2026

[FIGURE PLACEHOLDER: conceptual framework linking fees, trust and adoption]
Figure 3.1: Conceptual Framework of the Study (Researcher, 2026)

The objectives are to:
i. examine adoption;
ii. assess trust.

[AGENT REPORT]
CHAPTER THREE COMPLETE`;
const p3 = parseChapter(CH3, 3);
eq("title read", p3.title, "RESEARCH METHODOLOGY");
eq(
  "block kinds",
  p3.blocks.map((b) => b.kind),
  ["heading", "paragraph", "equation", "paragraph", "equation", "heading", "paragraph", "table", "figure", "paragraph", "list"],
);
const t31 = p3.blocks.find((b) => b.kind === "table");
check("table caption + source", t31?.kind === "table" && t31.caption === "Table 3.1: Distribution of the Sample" && t31.source === "Field Survey, 2026" && t31.rows.length === 2);
const f31 = p3.blocks.find((b) => b.kind === "figure");
check("figure caption below placeholder", f31?.kind === "figure" && f31.caption === "Figure 3.1: Conceptual Framework of the Study (Researcher, 2026)");
check("agent report dropped", !JSON.stringify(p3.blocks).includes("COMPLETE"));
check("unmarked 3.2 heading", p3.blocks.some((b) => b.kind === "heading" && b.text === "3.2 Research Design"));
const deep = parseChapter("[H1] CHAPTER TWO\n[H1] LITERATURE REVIEW\n[H3] 2.1.1.1 Too deep\ntext", 2);
check("H4 flagged", deep.warnings.some((w) => w.includes("fourth heading level")));
const noHeadingFromNumbers = parseChapter("[H1] CHAPTER FOUR\n[H1] RESULTS\n[H2] 4.1 Introduction\n\n2.5 million traders now use it in Lagos.", 4);
check("a sentence starting with a number stays a paragraph", noHeadingFromNumbers.blocks.filter((b) => b.kind === "heading").length === 1);
const tableSentence = parseChapter("[H2] 4.2 Results\nTable 4.1 shows that most respondents were women.\n\nMore text.", 4);
check("'Table 4.1 shows…' stays a sentence", tableSentence.blocks.every((b) => b.kind !== "table") && tableSentence.warnings.length === 0);
const tagged = parseChapter("[H2] 2.4 Summary\n[TABLE] Table 2.1: Summary of Reviewed Studies\n| Author | Finding |\n|---|---|\n| Okafor et al. (2020) | Fees fell |\n[/TABLE]\n[FIG] [FIGURE PLACEHOLDER: TAM diagram] | Figure 2.1: Technology Acceptance Model (Davis, 1989) [/FIG]", 2);
check("[TABLE] block", tagged.blocks.some((b) => b.kind === "table" && b.caption === "Table 2.1: Summary of Reviewed Studies" && b.rows.length === 1));
check("[FIG] block", tagged.blocks.some((b) => b.kind === "figure" && b.caption === "Figure 2.1: Technology Acceptance Model (Davis, 1989)"));

// ─── Whole reports, read back from XML ───────────────────────────────────────

const REFS = ASSEMBLY_REFS;
const chapters = assemblyChapters;
const input = assemblyInput;

const textOf = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
const paragraphs = (xml: string) => xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) ?? [];
const tables = (xml: string) => xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];
const styleBlock = (styles: string, id: string) => new RegExp(`<w:style [^>]*w:styleId="${id}"[^>]*>[\\s\\S]*?</w:style>`).exec(styles)?.[0] ?? "";
const attr = (xml: string, tag: string, name: string) => [...xml.matchAll(new RegExp(`<${tag}\\s[^>]*${name}="([^"]*)"`, "g"))].map((m) => m[1]);

async function checkReport(engineering: boolean, outDir: string | null) {
  const label = engineering ? "ENG" : "STD";
  const { buffer, report } = await packReport(input(engineering));
  if (outDir) writeFileSync(join(outDir, `check-assembly-${label}.docx`), buffer);
  const zip = await JSZip.loadAsync(buffer);
  const doc = await zip.file("word/document.xml")!.async("string");
  const styles = await zip.file("word/styles.xml")!.async("string");
  const settings = await zip.file("word/settings.xml")!.async("string");
  const footerNames = Object.keys(zip.files).filter((f) => /^word\/footer\d+\.xml$/.test(f));
  const footers = await Promise.all(footerNames.map((f) => zip.file(f)!.async("string")));
  const all = [doc, styles, ...footers].join("\n");

  // F1-F6
  check(`${label} F1 fonts are Times New Roman`, attr(all, "w:rFonts", "w:ascii").every((f) => f === "Times New Roman") && attr(all, "w:rFonts", "w:ascii").length > 0, [...new Set(attr(all, "w:rFonts", "w:ascii"))].join(","));
  const sizes = [...attr(all, "w:sz", "w:val"), ...attr(all, "w:szCs", "w:val")];
  check(`${label} F2/F3 every size is 12pt (24 half-points), nothing 14pt`, sizes.every((s) => s === "24"), [...new Set(sizes)].join(","));
  check(`${label} F4 headings bold`, ["Heading1", "Heading2", "Heading3"].every((id) => /<w:b\/>|<w:b w:val="(?:true|1|on)"\/>/.test(styleBlock(styles, id))));
  const colours = attr(all, "w:color", "w:val");
  check(`${label} F5 black only`, colours.every((c) => c === "000000" || c === "auto"), [...new Set(colours)].join(","));
  check(`${label} F6 no underline on headings`, ["Heading1", "Heading2", "Heading3"].every((id) => !/<w:u /.test(styleBlock(styles, id))));

  // S1-S5
  const docDefaults = /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/.exec(styles)?.[0] ?? "";
  const double = (xml: string) => /<w:spacing [^>]*w:line="480"/.test(xml) && /w:lineRule="auto"/.test(xml) && /w:before="0"/.test(xml) && /w:after="0"/.test(xml);
  check(`${label} S1/S5 document default 2.0 and 0 before/after`, double(docDefaults));
  check(`${label} S2-S4 headings 2.0, 0 before/after`, ["Heading1", "Heading2", "Heading3", "TOC1", "TOC2", "TOC3", "TableCaption", "FigureCaption", "Reference"].every((id) => double(styleBlock(styles, id))));
  const outsideTables = doc.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, "");
  const spacings = [...outsideTables.matchAll(/<w:spacing [^>]*\/>/g)].map((m) => m[0]);
  check(`${label} S5 no extra spacing on body paragraphs`, spacings.every((s) => !/w:(?:before|after)="[1-9]/.test(s) && (!/w:line=/.test(s) || /w:line="(?:480|240)"/.test(s))), spacings.find((s) => /w:(?:before|after)="[1-9]/.test(s)) ?? "");

  // MG1-MG4
  const margins = ["w:top", "w:bottom", "w:left", "w:right"].flatMap((a) => attr(doc, "w:pgMar", a));
  check(`${label} MG1-MG4 margins 1.0 inch`, margins.length >= 12 && margins.every((m) => m === "1440"), margins.join(","));

  // AL1-AL4, H1-H4
  check(`${label} AL1 body justified`, /<w:jc w:val="both"\/>/.test(docDefaults));
  check(`${label} AL2 H1 centred`, /<w:jc w:val="center"\/>/.test(styleBlock(styles, "Heading1")));
  check(`${label} AL3/AL4 H2/H3 left`, ["Heading2", "Heading3"].every((id) => /<w:jc w:val="left"\/>/.test(styleBlock(styles, id))));
  const heads = (id: string) => paragraphs(doc).filter((p) => p.includes(`<w:pStyle w:val="${id}"/>`)).map(textOf);
  const h1 = heads("Heading1");
  check(`${label} AL2 every H1 in capitals`, h1.every((t) => t === t.toUpperCase()), h1.find((t) => t !== t.toUpperCase()) ?? "");
  check(`${label} chapter H1 = CHAPTER ONE + title`, h1.includes("CHAPTER ONEINTRODUCTION"), h1.join(" / "));
  // The founder's template (prompts/preliminary-pages/PRELIMINARY PAGE TEMPLATE.docx): page order, Table of Contents last.
  eq(
    `${label} preliminary page order (template)`,
    h1.slice(0, 9),
    ["DECLARATION", "CERTIFICATION", "DEDICATION", "ACKNOWLEDGEMENT", "ABSTRACT", "LIST OF TABLES", "LIST OF FIGURES", "LIST OF ABBREVIATIONS", "TABLE OF CONTENTS"],
  );
  const allParas = paragraphs(doc).map(textOf).filter((t) => t.trim());
  const coverEnd = allParas.findIndex((t) => t === "BY");
  const cover = allParas.slice(0, coverEnd - 1);
  const want = input(engineering);
  eq(`${label} cover: topic, name, matric number, date only`, cover, [want.title.toUpperCase(), want.student.name.toUpperCase(), want.student.matric, "OCTOBER, 2026"]);
  const titleStart = coverEnd - 1;
  const titleLines = allParas.slice(titleStart, allParas.indexOf("DECLARATION"));
  check(`${label} title page: BY, statement in capitals, supervisor, date`, titleLines[1] === "BY" && titleLines.some((t) => t.startsWith("A PROJECT SUBMITTED TO THE DEPARTMENT OF")) && titleLines.includes("SUPERVISED BY: DR. K. BELLO") && titleLines[titleLines.length - 1] === "OCTOBER, 2026", titleLines.join(" / "));
  const wantDegree = engineering ? "THE DEGREE OF BACHELOR OF ENGINEERING (B.Eng)" : "THE DEGREE OF BACHELOR OF SCIENCE (B.Sc)";
  check(`${label} title page names the degree (FIX 1)`, titleLines.some((t) => t.endsWith(`FOR THE AWARD OF ${wantDegree}`)), titleLines.join(" / "));
  check(`${label} certification names the degree`, allParas.some((t) => t.includes(`suitable for the award of the degree of ${engineering ? "Bachelor of Engineering (B.Eng)" : "Bachelor of Science (B.Sc)"}.`)));
  check(`${label} no degree placeholder anywhere`, !allParas.some((t) => t.includes("DEGREE TO BE SUPPLIED")));
  check(`${label} certification: supervisor, HOD and External Examiner blocks`, allParas.filter((t) => t.startsWith("____________________________")).length === 4 && allParas.some((t) => t.startsWith("External Examiner")) && allParas.includes("Project Supervisor") && allParas.includes("Head of Department"));
  const dateRows = paragraphs(doc).filter((p) => /<w:t[^>]*>Date<\/w:t>/.test(p));
  check(`${label} "Date" centred under the date line (4 rows)`, dateRows.length === 4 && dateRows.every((p) => /<w:tab w:val="center" w:pos="7346"\/>/.test(p)), `${dateRows.length} rows`);
  const dedicationPara = paragraphs(doc).find((p) => textOf(p).startsWith("This project is dedicated")) ?? "";
  check(`${label} dedication justified, not centred (template)`, dedicationPara !== "" && !/<w:jc w:val="center"\/>/.test(dedicationPara) && !dedicationPara.includes("PrelimCentred"));
  check(`${label} AL3 H2 title case`, heads("Heading2").includes("1.1 Background of the Study") && heads("Heading2").includes("1.2 Objectives of the Study"), heads("Heading2").join(" / "));
  check(`${label} AL4 H3 sentence case keeps Nigeria`, heads("Heading3").includes("1.1.1 Challenges facing traders in Nigeria"), heads("Heading3").join(" / "));
  check(`${label} H4 not used`, !/w:val="Heading4"/.test(doc));

  // P1, P2, P4
  check(`${label} P1 no first-line indent`, !/w:firstLine="[1-9]/.test(all));
  check(`${label} P2 no dash separators left`, !/\s—\s/.test(textOf(doc).replace(/\[[^\]]*\]/g, "")));
  const etAlRuns = [...doc.matchAll(/<w:r>(?:(?!<\/w:r>)[\s\S])*?et al\.(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g)].map((m) => m[0]);
  check(`${label} P4/R5 every et al. italic`, etAlRuns.length >= 5 && etAlRuns.every((r) => /<w:i\/>|<w:i w:val="(?:true|1)"\/>/.test(r)), `${etAlRuns.length} runs, ${etAlRuns.filter((r) => !/<w:i/.test(r)).length} not italic`);
  check(`${label} P5 no highlight or shading`, !/<w:highlight|<w:shd /.test(doc));

  // PN1-PN4
  const sectPrs = doc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g) ?? [];
  check(`${label} PN three sections`, sectPrs.length === 3, String(sectPrs.length));
  const fmt = sectPrs.map((s) => /<w:pgNumType([^>]*)\/>/.exec(s)?.[1] ?? "");
  check(`${label} PN1 cover lower-case Roman from i`, /w:fmt="lowerRoman"/.test(fmt[0] ?? "") && /w:start="1"/.test(fmt[0] ?? ""), fmt[0]);
  check(`${label} PN1 title page and prelims carry on at ii (template)`, /w:fmt="lowerRoman"/.test(fmt[1] ?? "") && /w:start="2"/.test(fmt[1] ?? ""), fmt[1]);
  check(`${label} PN2/PN3 body Arabic restarting at 1`, /w:fmt="decimal"/.test(fmt[2] ?? "") && /w:start="1"/.test(fmt[2] ?? ""), fmt[2]);
  const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
  const footerOf = async (sect: string) => {
    const id = /<w:footerReference [^>]*w:type="default"[^>]*r:id="([^"]+)"|<w:footerReference [^>]*r:id="([^"]+)"[^>]*w:type="default"/.exec(sect);
    const rid = id?.[1] ?? id?.[2];
    const target = rid ? new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels) : null;
    const file = target ? `word/${target[1] ?? target[2]}` : null;
    return file && zip.file(file) ? zip.file(file)!.async("string") : "";
  };
  check(`${label} PN the cover shows no page number`, !/PAGE/.test(await footerOf(sectPrs[0] ?? "")));
  check(`${label} PN the title page and prelims show it`, /PAGE/.test(await footerOf(sectPrs[1] ?? "")) && !/<w:titlePg/.test(sectPrs[1] ?? ""));
  check(`${label} PN3 each section has its own footer (unlinked)`, sectPrs.every((s) => /<w:footerReference [^>]*w:type="default"/.test(s)));
  const pageFooters = footers.filter((f) => /PAGE/.test(f));
  check(`${label} PN4 page number centred in the footer`, pageFooters.length >= 2 && pageFooters.every((f) => /<w:jc w:val="center"\/>/.test(f)));

  // EQ1-EQ5
  const eqTables = tables(doc).filter((t) => t.includes("<m:oMath"));
  const eqRows = eqTables.flatMap((t) => t.match(/<w:tr>[\s\S]*?<\/w:tr>/g) ?? []);
  const wantEq = engineering ? 2 : 1;
  check(`${label} EQ1/EQ2 every equation on its own row of a two-column table`, eqRows.length === wantEq && (doc.match(/<m:oMath/g) ?? []).length === wantEq && eqRows.every((r) => (r.match(/<w:tc>/g) ?? []).length === 2), `${eqTables.length} tables, ${eqRows.length} rows`);
  check(`${label} consecutive equations share one table (Word would join them)`, eqTables.length === 1);
  check(`${label} EQ2 equation tables borderless`, eqTables.every((t) => !/w:val="single"/.test(t)));
  const numbers = eqRows.map((r) => textOf(r.split("</w:tc>")[1] ?? ""));
  eq(`${label} EQ3/EQ4 numbers 3.n, no parentheses`, numbers, engineering ? ["3.1", "3.2"] : ["3.1"]);
  check(`${label} EQ3 no (3.1) left in the text`, !/\(\d+\.\d+\)/.test(textOf(doc).replace(/\(\d{4}/g, "")), textOf(doc).match(/\(\d+\.\d+\)/)?.[0] ?? "");
  check(`${label} EQ5 native OMML in Times New Roman`, eqTables.every((t) => (t.match(/<m:r>/g) ?? []).length > 0 && (t.match(/<m:r>/g) ?? []).length === (t.match(/<m:nor\/>/g) ?? []).length));
  check(`${label} EQ5 structures kept`, engineering ? /<m:f>/.test(doc) && /<m:sSub>/.test(doc) : /<m:f>/.test(doc) && /<m:sSup>/.test(doc));

  // T1-T8
  const dataTables = tables(doc).filter((t) => !t.includes("<m:oMath") && t.includes("<w:tblHeader"));
  check(`${label} T1 rows cannot split`, dataTables.length === 3 && dataTables.every((t) => (t.match(/<w:trPr>/g) ?? []).length === (t.match(/<w:cantSplit/g) ?? []).length));
  check(`${label} T1 kept together (keepNext)`, dataTables.every((t) => /<w:keepNext/.test(t)));
  const tblBorders = dataTables.map((t) => /<w:tblBorders>[\s\S]*?<\/w:tblBorders>/.exec(t)?.[0] ?? "");
  if (engineering) {
    check(`${label} T2 three-line: top and bottom 0.5pt, header rule`, tblBorders.every((b) => /<w:top w:val="single" [^>]*w:sz="4"/.test(b) && /<w:bottom w:val="single" [^>]*w:sz="4"/.test(b)) && dataTables.every((t) => /<w:tcBorders>[\s\S]*?<w:bottom w:val="single"/.test(t)));
    check(`${label} T3 no vertical or inside lines`, tblBorders.every((b) => /<w:left w:val="none"/.test(b) && /<w:right w:val="none"/.test(b) && /<w:insideV w:val="none"/.test(b) && /<w:insideH w:val="none"/.test(b)));
  } else {
    check(`${label} standard tables: single 0.5pt grid`, tblBorders.every((b) => (b.match(/w:val="single"/g) ?? []).length === 6 && !/w:sz="(?!4")/.test(b)));
  }
  check(`${label} T4 no shading`, !/<w:shd /.test(doc));
  const beforeTable = (t: string) => doc.slice(0, doc.indexOf(t)).match(/<w:p(?:\s[^>]*)?>(?:(?!<w:p[ >])[\s\S])*?<\/w:p>\s*$/)?.[0] ?? "";
  check(`${label} T5-T7 caption above every table in Table Caption`, dataTables.every((t) => beforeTable(t).includes('<w:pStyle w:val="TableCaption"/>')));
  check(`${label} FG1-FG3 figure caption below in Figure Caption`, /FIGURE PLACEHOLDER[\s\S]*?<\/w:p>\s*<w:p>(?:(?!<\/w:p>)[\s\S])*?<w:pStyle w:val="FigureCaption"\/>/.test(doc));
  check(`${label} T6 caption styles centred`, ["TableCaption", "FigureCaption"].every((id) => /<w:jc w:val="center"\/>/.test(styleBlock(styles, id))));
  const instr = [...doc.matchAll(/<w:instrText[^>]*>([^<]*)<\/w:instrText>/g)].map((m) => m[1].replace(/&quot;/g, '"')).filter((t) => t.startsWith("TOC"));
  const hasField = (...switches: string[]) => instr.some((t) => switches.every((s) => t.includes(s)));
  check(`${label} T8/LF1 list fields over the caption styles`, hasField("\\t \"Table Caption,1\"", "\\h") && hasField("\\t \"Figure Caption,1\"", "\\h"), instr.join(" | "));

  // TOC1-TOC5, LF3, LT3
  check(`${label} TOC1-TOC4 a real field over Heading 1-3`, hasField('\\o "1-3"', "\\h", "\\u", "\\z"), instr.join(" | "));
  check(`${label} TOC5/LF3/LT3 no dotted leaders anywhere`, !/w:leader="dot"/.test(all));
  check(`${label} TOC styles: plain right tab at the margin`, ["TOC1", "TOC2", "TOC3"].every((id) => /<w:tab w:val="right" w:pos="9026"\/>/.test(styleBlock(styles, id))));
  check(`${label} Word asked to update fields on open`, /<w:updateFields(?: w:val="(?:true|1)")?\/>/.test(settings));

  // R1-R6
  const refParas = paragraphs(doc).filter((p) => p.includes('<w:pStyle w:val="Reference"/>')).map(textOf);
  check(`${label} R1 References section`, h1.includes("REFERENCES"));
  const surnames = refParas.map((r) => r.split(",")[0]);
  eq(`${label} R2/R6 alphabetical, cited only, no duplicates`, surnames, ["Adeyemi", "Musa", "Okafor", "Yamane"].filter((s) => engineering ? s !== "Yamane" : true));
  check(`${label} R3 hanging indent`, /<w:ind w:left="720" w:hanging="720"\/>/.test(styleBlock(styles, "Reference")));
  check(`${label} R4 journal italic`, paragraphs(doc).some((p) => p.includes('w:val="Reference"') && /<w:i\/>[\s\S]*?Journal of African Business/.test(p)));

  // Report
  check(`${label} report: profile`, report.profile === (engineering ? "ENGINEERING" : "FYP_STANDARD"));
  check(`${label} report: placeholders listed`, report.chapters[3].placeholders.includes("[DATA NOT PROVIDED — COO TO REVIEW]") && report.chapters[4].placeholders.includes("p. [page]"));
  check(`${label} report: uncited left out`, report.references.leftOut === 1 + (engineering ? 1 : 0), JSON.stringify(report.references));
  check(`${label} report: prelim placeholders`, report.prelimPlaceholders.includes("[HEAD OF DEPARTMENT TO BE SUPPLIED]") && report.prelimPlaceholders.includes("[ABSTRACT TO BE SUPPLIED]"));
  check(`${label} report: dashes fixed`, report.dashesFixed >= 1);
  check(`${label} size`, buffer.length > 8_000, `${buffer.length} bytes`);
}

eq("file name from the title", reportFileName('Mobile: Money / "Adoption"?', "EC-1"), "Mobile Money Adoption.docx");
eq("file name falls back to the code", reportFileName("  ", "EC-00012"), "EC-00012.docx");

// ─── D11 Fix 1: endnotes (MODE_A per chapter, MODE_B one list for the report) ───
async function checkEndnotes(outDir: string | null) {
  // Markers resolve against the block after them, even when a part restarts at 1.
  const two = "[H2] 1.1 A\n\nFirst claim.^1 Second claim.^2\n\n[ENDNOTES]\n1. Alpha, A. (2015). One. *J*.\n2. Beta, B. (2016). Two. *J*.\n\n[H2] 1.2 B\n\nThird claim.^1 A cm² plot and R^2 of 0.4 and R² too. Fourth³ claim.\n\n[ENDNOTES]\n1. Gamma, C. (2017). Three. *J*.\n³ Delta, D. (2018). Four. *J*.\n";
  const a = analyseChapterNotes(two);
  eq("notes: four markers (cm², R^2 and R² are not markers)", a.markers.map((m) => m.local), [1, 2, 1, 3]);
  eq("notes: each marker tied to the block after it", a.markers.map((m) => m.block), [0, 0, 1, 1]);
  eq("notes: a restarted part resolves to its own block", entryFor(a, a.markers[2])?.text, "Gamma, C. (2017). Three. *J*.");
  eq("notes: an entry written ³ Text is read as note 3", entryFor(a, a.markers[3])?.text, "Delta, D. (2018). Four. *J*.");
  const dangling = analyseChapterNotes("Claim.^5\n\n[ENDNOTES]\n1. Alpha, A. (2015). One.\n\nLater claim.^2\n");
  eq("notes: a marker with no entry, and one with no block after it, are both unresolved", dangling.markers.map((m) => Boolean(entryFor(dangling, m))), [false, false]);
  // The parser: a block ends at its first line that is not an entry.
  const parsed = parseChapter("[H2] 1.1 A\n\nText.^1\n\n[ENDNOTES]\n1. Alpha, A. (2015). One.\nThe next part's first paragraph, which must stay a paragraph.\n\n[ENDNOTES]\n2. Beta, B. (2016). Two.", 1);
  eq("parser: two note blocks, each only its entries", parsed.blocks.filter((b) => b.kind === "endnotes").map((b) => (b.kind === "endnotes" ? b.lines.length : 0)), [1, 1]);
  check("parser: the line after a block is a paragraph again", parsed.blocks.some((b) => b.kind === "paragraph" && b.text.startsWith("The next part's first paragraph")));
  // Joining (MODE_B).
  const joined = collectEndnotes([
    { number: 1, text: "Claim.^1 Claim.^2\n\n[ENDNOTES]\n1. Alpha, A. (2015). One. *J*.\n2. Beta, B. (2016). Two. *J*.\n3. Unused, U. (2019). Never cited." },
    { number: 2, text: "Claim.^1 Claim.^2 Claim.^3 Claim.^4\n\n[ENDNOTES]\n1. Beta, B. (2016). Two. *J*.\n2. Gamma, C. (2017). Three. *J*.\n3. Ibid.\n4. Alpha, *One*." },
    { number: 3, text: "Claim.^1 Claim.^2\n\n[ENDNOTES]\n1. Beta, B. (2016). Two. *J*.\n2. Ibid." },
  ]);
  eq("join: numbered by first appearance, identical notes joined, Ibid and the short form kept", joined.notes.map((n) => `${n.number}. ${n.text}`), ["1. Alpha, A. (2015). One. *J*.", "2. Beta, B. (2016). Two. *J*.", "3. Gamma, C. (2017). Three. *J*.", "4. Ibid.", "5. Alpha, *One*."]);
  eq("join: chapters' markers rewritten to the joined numbers", joined.chapters.map((c) => c.text.match(/\^\d+/g)), [["^1", "^2"], ["^2", "^3", "^4", "^5"], ["^2", "^2"]]);
  check("join: an Ibid whose work was joined into an earlier note reuses that note's number", joined.chapters[2].text === "Claim.^2 Claim.^2");
  check("join: the [ENDNOTES] blocks are taken out", joined.chapters.every((c) => !c.text.includes("[ENDNOTES]")));
  eq("join: repeats joined, the unused note reported", [joined.merged, joined.unused, joined.dangling], [2, ["Chapter 1, note 3"], []]);
  // Superscript characters render as true superscripts; R² keeps its look.
  eq("sup: ¹² becomes a superscript 12", superscriptNotes([{ text: "market.¹² Next" }]).map((s) => [s.text, Boolean(s.sup)]), [["market.", false], ["12", true], [" Next", false]]);
  eq("sup: R² is R with a superscript 2", superscriptNotes([{ text: "R² = 0.4" }]).map((s) => [s.text, Boolean(s.sup)]), [["R", false], ["2", true], [" = 0.4", false]]);
  // Matching a note to the verified list.
  const adebanjo = E_EXTRA[0];
  const iwuchukwu = E_EXTRA[8];
  eq("match: the first author wins over a shared co-author (Okonjo on every cultural work)", referencesForNote(E_REFERENCES, `Adebanjo, A., & Okonjo, T. (2016). ${adebanjo.title}.`).map((r) => r.id), [adebanjo.id]);
  check("match: both works share the co-author and the year", adebanjo.year === iwuchukwu.year && iwuchukwu.authors.includes("Okonjo"));
  eq("match: a short form (no year) by surname and a title word", referencesForNote(E_REFERENCES, "Adebanjo, *Cash, credit and custom*.").map((r) => r.id), [adebanjo.id]);
  const notes = analyseChapterNotes("A.^1 B.^2 C.^3\n\n[ENDNOTES]\n1. Adebanjo, A., & Okonjo, T. (2016). Cash, credit and custom in the Yoruba market.\n2. Ibid., 12.\n3. On this point see the discussion above.");
  const resolved = [...resolveNotes(notes, E_REFERENCES).values()].map((v) => (v === "comment" ? v : v.map((r) => r.id)));
  eq("resolve: a note, its Ibid. and a note of comment", resolved, [[adebanjo.id], [adebanjo.id], "comment"]);

  // MODE_A: a chapter's part blocks shown as one list at its end.
  const aInput = endnotesInput({ citationPlacement: "MODE_A", section: "BUSINESS", mode: 2 });
  const aXml = await documentXml(aInput);
  const aHeadings = (aXml.match(/<w:pStyle w:val="Heading2"\/>(?:(?!<\/w:p>).)*?Endnotes/g) ?? []).length;
  eq("MODE A: one Endnotes heading per chapter, not one per part", aHeadings, 5);
  check("MODE A: no document ENDNOTES section", !/<w:t[^>]*>ENDNOTES<\/w:t>/.test(aXml));

  // MODE_B: the whole fixture report.
  const input = endnotesInput({});
  const { buffer, report } = await packReport(input);
  if (outDir) writeFileSync(join(outDir, "endnotes-mode-b.docx"), buffer);
  const xml = await (await JSZip.loadAsync(buffer)).file("word/document.xml")!.async("string");
  const text = xml.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "");
  const joinedFixture = collectEndnotes(input.chapters);
  const sups = [...xml.matchAll(/<w:vertAlign w:val="superscript"\/>(?:(?!<\/w:r>).)*?<w:t[^>]*>(\d+)<\/w:t>/g)].map((m) => Number(m[1]));
  eq("MODE B fixture: 41 notes, 4 identical notes joined, none dangling or unused", [joinedFixture.notes.length, joinedFixture.merged, joinedFixture.dangling.length, joinedFixture.unused.length], [41, 4, 0, 0]);
  eq("MODE B fixture: every marker a true superscript", sups.length, joinedFixture.markers);
  const first: number[] = [];
  for (const n of sups) if (!first.includes(n)) first.push(n);
  check("MODE B fixture: numbered 1–41 in order of first appearance", first.length === 41 && first.every((n, i) => n === i + 1));
  const h1 = [...xml.matchAll(/<w:pStyle w:val="Heading1"\/>(?:(?!<\/w:p>).)*/g)].map((m) => m[0].replace(/<[^>]+>/g, "").trim());
  eq("MODE B fixture: ENDNOTES (Heading 1) straight before REFERENCES, once", [h1.filter((h) => h === "ENDNOTES").length, h1.indexOf("REFERENCES") - h1.indexOf("ENDNOTES")], [1, 1]);
  check("MODE B fixture: no [ENDNOTES] tag, ^N or superscript character left", !/\[ENDNOTES\]|\^\d|[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(text));
  const listed = text.slice(text.lastIndexOf("ENDNOTES") + 8, text.lastIndexOf("REFERENCES")).split("\n").filter((l) => /^\d+\. /.test(l.trim()));
  check("MODE B fixture: the ENDNOTES section lists 1–41", listed.length === 41 && listed.every((l, i) => l.trim().startsWith(`${i + 1}. `)));
  eq("MODE B fixture: the References hold the 39 works the notes cite", report.references.listed, 39);
  check("MODE B fixture: the assembly no longer says the notes are not produced", !report.notes.some((n) => /not produced yet/.test(n)));
  check("MODE B fixture: objectives and thematic titles unchanged", E_OBJECTIVES.every((o) => text.includes(o)) && text.includes(E_THEMATIC.chapter3.toUpperCase()));
}

function endnotesInput(over: Partial<AssemblyInput>): AssemblyInput {
  return {
    projectCode: "EC-QA-CHECK-EN",
    title: E_TITLE,
    student: { name: "Ada Obi", matric: "190404001" },
    university: "University of Lagos",
    faculty: "Arts",
    department: "Cultural Studies",
    supervisor: "Dr. K. Bello",
    hod: "Prof. T. Adeyemi",
    submission: new Date("2026-10-15T12:00:00Z"),
    dedication: { type: "God", details: null },
    acknowledgementNote: null,
    mode: 1,
    section: "HUMANITIES",
    referencingStyle: "APA_7TH",
    citationPlacement: "MODE_B",
    thematicTitles: E_THEMATIC,
    chapters: endnotesChapters(),
    references: E_REFERENCES,
    includePrelims: true,
    ...over,
  };
}

async function documentXml(input: AssemblyInput): Promise<string> {
  const { buffer } = await packReport(input);
  return (await JSZip.loadAsync(buffer)).file("word/document.xml")!.async("string");
}

(async () => {
  const outIdx = process.argv.indexOf("--out");
  const outDir = outIdx !== -1 ? process.argv[outIdx + 1] : null;
  if (outDir) mkdirSync(outDir, { recursive: true });
  await checkReport(false, outDir);
  await checkReport(true, outDir);
  await checkEndnotes(outDir);
  if (failures.length) {
    console.error(`check:assembly — ${failures.length} failed, ${passed} passed:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`check:assembly — all ${passed} checks passed`);
})();
