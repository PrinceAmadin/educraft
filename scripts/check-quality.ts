/**
 * Phase D8 checks (no database, no Claude): the quality gate's 89 checks on a
 * structurally complete Business report (scripts/fixtures/quality-fixture.ts),
 * then one change at a time that must fail exactly its rule: Word XML edits for
 * Layer 1, chapter edits for voice, references and structure. Also the scoring
 * (85 of 89, the CRITICAL block), the 30-minute recall, the failure block a
 * re-generated chapter carries, the phrase tables against
 * prompts/shared/anti_ai_rules.md and the required sections against the
 * chapter prompt files.
 *
 *   npm run check:quality
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { AssemblyInput } from "../src/lib/assembly/assemble";
import { buildChapterBrief } from "../src/lib/generation/chapter-plan";
import { extractDepartmentSection, type ChapterNumber } from "../src/lib/generation/prompt-loader";
import type { SectionKey } from "../src/lib/generation/department-map";
import { TRANSITIONS } from "../src/lib/pipeline";
import { briefStatements, failureLinesForChapter, knownCommonCitation } from "../src/lib/quality-gate";
import { finishReport, prepareReport, type AiResults, type PreparedReport } from "../src/lib/quality/evaluate";
import { runFormattingChecks, FORMATTING_RULES, type DocxParts } from "../src/lib/quality/formatting-checks";
import { recallState, recallWindowEnd, RECALL_WINDOW_MINUTES } from "../src/lib/quality/recall";
import { requiredSections } from "../src/lib/quality/required-sections";
import { scoreQuality, PASS_MARK } from "../src/lib/quality/score";
import type { TraceabilityResult } from "../src/lib/quality/structural-checks";
import type { CheckResult, QualityLayer } from "../src/lib/quality/types";
import { BANNED_OPENERS, META_PHRASES, PROMOTIONAL, TRANSITION_WORDS, scanVoice, validateAiVoiceFindings } from "../src/lib/quality/voice-scan";
import { proseParagraphs, splitSentences } from "../src/lib/quality/prose";
import { parseStoredPath } from "../src/lib/files/paths";
import { generatedReportPath } from "../src/lib/services/deliverables";
import { FIXTURE_OBJECTIVES, FIXTURE_REFERENCES, FIXTURE_TITLE, fixtureChapters, type FixtureChapter } from "./fixtures/quality-fixture";

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const eq = (label: string, got: unknown, want: unknown) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ─── The fixture report and a pure run of the gate ───────────────────────────

function inputFor(chapters: FixtureChapter[], over: Partial<AssemblyInput> = {}): AssemblyInput {
  return {
    projectCode: "EC-QA-CHECK",
    title: FIXTURE_TITLE,
    student: { name: "Ada Obi", matric: "190404001" },
    university: "University of Lagos",
    faculty: "Management Sciences",
    department: "Business Administration",
    supervisor: "Dr. K. Bello",
    hod: "Prof. T. Adeyemi",
    submission: new Date("2026-10-15T12:00:00Z"),
    dedication: { type: "God", details: null },
    acknowledgementNote: "Thank Dr. Bello and my parents",
    mode: 2,
    section: "BUSINESS",
    referencingStyle: "APA_7TH",
    citationPlacement: "NOT_APPLICABLE",
    thematicTitles: { chapter3: null, chapter4: null },
    chapters: chapters.map((c) => ({ number: c.number, text: c.text })),
    references: FIXTURE_REFERENCES,
    includePrelims: true,
    ...over,
  };
}

/** Every objective reported in Chapter Four and achieved in Chapter Five (what a good trace looks like). */
const GOOD_TRACE: TraceabilityResult = {
  objectives: FIXTURE_OBJECTIVES.map((_, i) => ({ index: i + 1, reported: true, reportQuote: "x", reportQuoteFound: true, verdict: "ACHIEVED", verdictQuote: "y", verdictQuoteFound: true })),
};
const NO_AI: AiResults = { voice: [], voiceNotes: [], support: { results: [], checked: 0, total: 0 }, traceability: GOOD_TRACE, errors: [] };

async function prepare(chapters = fixtureChapters(), over: Partial<AssemblyInput> = {}): Promise<{ prepared: PreparedReport; chapters: FixtureChapter[] }> {
  const prepared = await prepareReport({ input: inputFor(chapters, over), references: FIXTURE_REFERENCES, knownCommon: knownCommonCitation });
  return { prepared, chapters };
}

function finish(prepared: PreparedReport, chapters: FixtureChapter[], ai: Partial<AiResults> = {}, ctx: { pureScience?: boolean; objectives?: string[] } = {}) {
  return finishReport(prepared, { ...NO_AI, ...ai }, {
    objectives: ctx.objectives ?? FIXTURE_OBJECTIVES,
    pureScience: ctx.pureScience ?? false,
    supervisorToc: false,
    plans: new Map(chapters.map((c) => [c.number, c.plan])),
  });
}

const byId = (checks: CheckResult[], id: string) => checks.find((c) => c.id === id)!;
const statusOf = (checks: CheckResult[], id: string) => byId(checks, id)?.status;
const failed = (checks: CheckResult[]) => checks.filter((c) => c.status === "FAIL").map((c) => c.id);

/** One chapter's text changed by `edit`. */
function withChapter(n: number, edit: (t: string) => string): FixtureChapter[] {
  return fixtureChapters().map((c) => (c.number === n ? { ...c, text: edit(c.text) } : c));
}

/** Layer 1 on hand-edited XML: only that rule should fail. */
function formattingWith(prepared: PreparedReport, edit: (p: DocxParts) => DocxParts): CheckResult[] {
  return runFormattingChecks(edit({ ...prepared.parts, footers: { ...prepared.parts.footers } }), {
    input: prepared.input,
    report: prepared.report,
    profile: "FYP_STANDARD",
    knownCommon: knownCommonCitation,
  });
}
const replaceOnce = (s: string, a: string | RegExp, b: string) => {
  const out = s.replace(a, b);
  if (out === s) throw new Error(`fixture edit did not apply: ${a}`);
  return out;
};

(async () => {
  // ── The clean report ─────────────────────────────────────────────────────
  const { prepared, chapters } = await prepare();
  const clean = finish(prepared, chapters);
  const layerCount = (layer: QualityLayer) => clean.checks.filter((c) => c.layer === layer).length;
  eq("89 checks: 71 formatting, 1 voice, 1 reference, 16 structural", [clean.checks.length, layerCount("formatting"), layerCount("voice"), layerCount("reference"), layerCount("structural")], [89, 71, 1, 1, 16]);
  eq("formatting rule list is the 71 of formatting_rules.md, in order", FORMATTING_RULES.map((r) => r.id).join(" "), "F1 F2 F3 F4 F5 F6 S1 S2 S3 S4 S5 MG1 MG2 MG3 MG4 AL1 AL2 AL3 AL4 H1 H2 H3 H4 P1 P2 P3 P4 P5 PN1 PN2 PN3 PN4 T1 T2 T3 T4 T5 T6 T7 T8 FG1 FG2 FG3 FG4 FG5 FG6 EQ1 EQ2 EQ3 EQ4 EQ5 TOC1 TOC2 TOC3 TOC4 TOC5 LF1 LF2 LF3 LT1 LT2 LT3 LA1 LA2 LA3 R1 R2 R3 R4 R5 R6");
  eq("clean fixture: no check fails", failed(clean.checks), []);
  check("clean fixture: 89 of 89, passed", clean.score.qualityScore === 89 && clean.score.passed, `${clean.score.qualityScore}, passed ${clean.score.passed}`);
  eq("clean fixture: layer scores", [clean.score.formattingScore, clean.score.structuralScore, clean.score.referenceScore, clean.score.voiceScore], [71, 16, 1, 1]);
  eq("clean fixture: not-applicable rules", clean.checks.filter((c) => c.status === "NA").map((c) => c.id), ["T2", "T3", "LA1", "LA2", "LA3"]);
  check("FIX 2: Davis (1989) is a WARN on the reference check, not a failure", statusOf(clean.checks, "REF") === "WARN" && byId(clean.checks, "REF").issues.some((i) => i.level === "WARN" && /Davis \(1989\) is cited but is not among the verified references/.test(i.message)));
  check("FIX 2: Yamane (1967) is a WARN too", byId(clean.checks, "REF").issues.some((i) => i.level === "WARN" && /Yamane \(1967\)/.test(i.message)));
  check("FIX 2: the known citations cost no point", clean.score.referenceScore === 1);
  check("reference summary names the relevance split", /CORE/.test(byId(clean.checks, "REF").summary), byId(clean.checks, "REF").summary);
  check("36 verified references cited (ST12)", prepared.match.cited.length === 36, String(prepared.match.cited.length));
  check("abstract/acknowledgement placeholders are WARN until D7b (ST1)", statusOf(clean.checks, "ST1") === "WARN");
  check("title page carries the degree (FIX 1, via the gate's build)", /BACHELOR OF SCIENCE \(B\.Sc\)/.test(prepared.parts.document));

  // ── Layer 1: one XML change, one failure ─────────────────────────────────
  const l1 = (label: string, id: string, edit: (p: DocxParts) => DocxParts, extra: string[] = []) => {
    const res = formattingWith(prepared, edit);
    const f = res.filter((r) => r.status === "FAIL").map((r) => r.id).sort();
    eq(`L1 ${label}`, f, [id, ...extra].sort());
    return res;
  };
  l1("Arial run fails F1 (CRITICAL)", "F1", (p) => ({ ...p, document: replaceOnce(p.document, "<w:t xml:space=\"preserve\">Mobile money has changed", '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t xml:space="preserve">Mobile money has changed') }));
  l1("a 14pt run fails F3", "F3", (p) => ({ ...p, document: replaceOnce(p.document, "<w:t xml:space=\"preserve\">Adoption has not been even", '<w:rPr><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">Adoption has not been even') }), ["F2"]);
  l1("red text fails F5", "F5", (p) => ({ ...p, document: replaceOnce(p.document, "<w:t xml:space=\"preserve\">Adoption has not been even", '<w:rPr><w:color w:val="FF0000"/></w:rPr><w:t xml:space="preserve">Adoption has not been even') }));
  l1("1.5 line spacing by default fails S1", "S1", (p) => ({ ...p, styles: replaceOnce(p.styles, /(<w:docDefaults>[\s\S]*?)w:line="480"/, '$1w:line="360"') }));
  l1("space before Heading 1 fails S2 (and S5)", "S2", (p) => ({ ...p, styles: replaceOnce(p.styles, /(<w:style [^>]*w:styleId="Heading1"[\s\S]*?)w:before="0"/, '$1w:before="240"') }), ["S5"]);
  l1("a 1.25 inch left margin fails MG3", "MG3", (p) => ({ ...p, document: p.document.replace(/w:left="1440" w:header/g, 'w:left="1800" w:header') }));
  l1("upper Roman in the body fails PN2", "PN2", (p) => ({ ...p, document: replaceOnce(p.document, 'w:start="1" w:fmt="decimal"', 'w:start="1" w:fmt="upperRoman"') }));
  l1("body starting at 5 fails PN3", "PN3", (p) => ({ ...p, document: replaceOnce(p.document, 'w:start="1" w:fmt="decimal"', 'w:start="5" w:fmt="decimal"') }));
  l1("a centred body paragraph fails AL1", "AL1", (p) => ({ ...p, document: replaceOnce(p.document, "<w:p><w:r><w:t xml:space=\"preserve\">Adoption has not been even", '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">Adoption has not been even') }));
  l1("a first-line indent fails P1", "P1", (p) => ({ ...p, document: replaceOnce(p.document, "<w:p><w:r><w:t xml:space=\"preserve\">Adoption has not been even", '<w:p><w:pPr><w:ind w:firstLine="720"/></w:pPr><w:r><w:t xml:space="preserve">Adoption has not been even') }));
  l1("highlighted text fails P5", "P5", (p) => ({ ...p, document: replaceOnce(p.document, "<w:t xml:space=\"preserve\">Adoption has not been even", '<w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve">Adoption has not been even') }));
  l1("a shaded table cell fails T4", "T4", (p) => ({ ...p, document: replaceOnce(p.document, '<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="TableText"/>', '<w:shd w:val="clear" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="TableText"/>') }));
  l1("a dotted TOC leader fails TOC5, LF3, LT3", "TOC5", (p) => ({ ...p, styles: replaceOnce(p.styles, '<w:tab w:val="right" w:pos="9026"/>', '<w:tab w:val="right" w:leader="dot" w:pos="9026"/>') }), ["LF3", "LT3"]);
  l1("equation numbered (3.1) fails EQ3 and EQ4", "EQ3", (p) => ({ ...p, document: replaceOnce(p.document, /(<w:jc w:val="right"\/><\/w:pPr><w:r><w:t xml:space="preserve">)3\.1(<\/w:t>)/, "$1(3.1)$2") }), ["EQ4"]);
  l1("a bordered equation table fails EQ2", "EQ2", (p) => ({ ...p, document: replaceOnce(p.document, /(<w:tbl>(?:(?!<\/w:tbl>)[\s\S])*?<w:tblBorders>)<w:top w:val="none"/, '$1<w:top w:val="single"') }));
  l1("an upright et al. fails P4", "P4", (p) => {
    const at = p.document.indexOf(">et al.<");
    const runStart = p.document.lastIndexOf("<w:r>", at);
    const runXml = p.document.slice(runStart, p.document.indexOf("</w:r>", at) + 6);
    return { ...p, document: p.document.replace(runXml, runXml.replace(/<w:i\/>|<w:i w:val="true"\/>/g, "").replace(/<w:iCs\/>|<w:iCs w:val="true"\/>/g, "")) };
  });
  l1("two references swapped fail R2", "R2", (p) => {
    const refs = [...p.document.matchAll(/<w:p><w:pPr><w:pStyle w:val="Reference"\/>[\s\S]*?<\/w:p>/g)].map((m) => m[0]);
    return { ...p, document: p.document.replace(refs[0], "\u0000A").replace(refs[1], refs[0]).replace("\u0000A", refs[1]) };
  });
  l1("a duplicated reference fails R6", "R6", (p) => {
    const ref = /<w:p><w:pPr><w:pStyle w:val="Reference"\/>[\s\S]*?<\/w:p>/.exec(p.document)![0];
    return { ...p, document: p.document.replace(ref, ref + ref) };
  });
  l1("no List of Tables fails T8, LT1 and LT2", "T8",(p) => ({ ...p, document: p.document.replace(/\\t &quot;Table Caption,1&quot;/, "\\t &quot;Nothing,1&quot;") }), ["LT1", "LT2"]);
  {
    const res = formattingWith(prepared, (p) => ({ ...p, document: replaceOnce(p.document, "<w:t xml:space=\"preserve\">Mobile money has changed", '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t xml:space="preserve">Mobile money has changed') }));
    const all = finish(prepared, chapters);
    const swapped = all.checks.map((c) => res.find((r) => r.id === c.id) ?? c);
    const s = scoreQuality(swapped);
    check("a CRITICAL failure (F1) blocks the pass even at 88 of 89", s.qualityScore === 88 && !s.passed && s.criticalFailures === 1, JSON.stringify({ score: s.qualityScore, passed: s.passed }));
  }

  // ── Layer 1 and 3 from the chapter text ──────────────────────────────────
  {
    const chs = withChapter(2, (t) => t.replace("[H3] 2.2.1 Mobile money adoption", "[H3] 2.2.1 Mobile money adoption\nThe term covers wallets.\n\n[H3] 2.2.1.1 Wallet types"));
    const { prepared: p2 } = await prepare(chs);
    const r = finish(p2, chs);
    check("a 1.1.1.1 heading fails H4", statusOf(r.checks, "H4") === "FAIL");
  }
  {
    const chs = withChapter(3, (t) => t.replace("The design allows the relationships in the hypotheses to be tested.", "The model is written as Sales = β0 + β1Adoption + e for every trader in the sample."));
    const { prepared: p2 } = await prepare(chs);
    check("an equation inside a sentence fails EQ1", statusOf(finish(p2, chs).checks, "EQ1") === "FAIL");
  }
  {
    const chs = withChapter(2, (t) => t.replace("Figure 2.1: Conceptual framework of the study (Researcher, 2026)", "Figure 2.1: Conceptual framework of the study"));
    const { prepared: p2 } = await prepare(chs);
    check("a figure with no source fails FG5", statusOf(finish(p2, chs).checks, "FG5") === "FAIL");
  }
  {
    const chs = withChapter(2, (t) => t.replace("Figure 2.1: Conceptual framework of the study (Researcher, 2026)", "Figure 2.1: Conceptual framework of the study (Okonkwo, 2011)"));
    const { prepared: p2 } = await prepare(chs);
    const r = finish(p2, chs);
    check("a figure citing an unverified source fails FG4", statusOf(r.checks, "FG4") === "FAIL");
  }

  // ── Layer 2a voice ───────────────────────────────────────────────────────
  {
    const chs = withChapter(1, (t) => t.replace("Mobile money has changed how market traders", "In today's rapidly evolving technological landscape, mobile money has changed how market traders"));
    const { prepared: p2 } = await prepare(chs);
    const r = finish(p2, chs);
    const v = byId(r.checks, "VOICE");
    check("an injected \"In today's rapidly evolving\" fails voice", v.status === "FAIL" && v.issues.some((i) => i.level === "FAIL" && i.chapter === 1 && i.paragraph === 1 && /In today's rapidly evolving/.test(i.quote ?? "")), JSON.stringify(v.issues.slice(0, 2)));
    check("…and costs exactly one point", r.score.qualityScore === 88 && r.score.voiceScore === 0);
  }
  const voiceOf = (text: string) => scanVoice(proseParagraphs([{ number: 1, text: `[H2] 1.1 Background\n${text}` }]));
  const hit = (text: string, rule: string, severity = "MAJOR") => voiceOf(text).some((f) => f.rule === rule && f.severity === severity);
  check("scan: every §2.1 opener at a sentence start", BANNED_OPENERS.every((o) => hit(`Traders sell food in the market daily. ${o.phrase} traders sell goods.`, "opener", o.severity)));
  check("scan: an opener is not flagged mid-sentence", !hit("Traders said that in recent times prices rose. Sales rose too.", "opener", "MINOR"));
  check("scan: promotional words", hit("The groundbreaking system raised sales.", "promotional") && hit("It played a pivotal role in sales.", "promotional"));
  check("scan: cutting-edge allowed with a citation", !hit("The cutting-edge scanner raised yield (Okafor, 2020).", "promotional"));
  check("scan: historical and theory terms keep their word", !hit("The Revolutionary United Front operated in Sierra Leone.", "promotional") && !hit("Transformative learning theory explains this.", "promotional"));
  check("scan: Moreover / Furthermore / Additionally openers", hit("Moreover, the traders adopted wallets.", "transition") && hit("Additionally, fees rose.", "transition"));
  check("scan: a Firstly… Secondly run", hit("Firstly, traders adopted. Secondly, fees fell.", "transition"));
  check("scan: meta-commentary", hit("This chapter aims to explain adoption.", "meta") && hit("This section will discuss adoption.", "meta"));
  check("scan: first person, not inside quotes or 'US'", hit("We found that sales rose.", "first_person") && !hit('Traders answered "we use wallets daily" in the survey. The US market differs.', "first_person"));
  check("scan: two section cross-references in a paragraph", voiceOf("Traders sell food.\n\nAs discussed in Section 2.3 and Section 2.4, fees matter.").some((f) => f.rule === "cross_reference"));
  check("scan: vague qualifiers and weak verbs are MINOR", hit("The wallet showed high performance.", "vague", "MINOR") && hit("Traders utilise wallets.", "weak_verb", "MINOR"));
  check("scan: sentences do not break on et al. or initials", splitSentences("Okafor et al. (2020) found this. Dr. K. Bello agreed. Sales rose.").length === 3);
  {
    const paras = proseParagraphs(fixtureChapters().slice(0, 1));
    const v = validateAiVoiceFindings({ findings: [{ paragraph: 1, quote: "have changed", rule: "opener", severity: "MAJOR", fix: "x" }, { paragraph: 1, quote: "has changed how market traders", rule: "hollow", severity: "MINOR", fix: "x" }] }, 1, paras);
    check("AI voice: a quote not in its paragraph is dropped", v.findings.length === 1 && v.dropped === 1);
    const v2 = validateAiVoiceFindings({ findings: JSON.stringify([{ paragraph: 1, quote: "has changed how market traders", rule: "opener", severity: "MAJOR", fix: "x" }]) }, 1, paras);
    check("AI voice: a list sent as a JSON string is read", v2.findings.length === 1);
    const r = finish(prepared, chapters, { voice: [{ ...v.findings[0], rule: "hollow", severity: "MAJOR" }] });
    check("AI voice: a MAJOR judgement (not a banned construction) is a WARN", statusOf(r.checks, "VOICE") === "WARN" && r.score.voiceScore === 1);
    const r2 = finish(prepared, chapters, { voice: [{ ...v.findings[0], rule: "opener", severity: "MAJOR" }] });
    check("AI voice: a reworded banned opener fails", statusOf(r2.checks, "VOICE") === "FAIL");
  }
  // anti_ai_rules.md ⇄ the phrase tables
  {
    const md = readFileSync(path.join(process.cwd(), "prompts", "shared", "anti_ai_rules.md"), "utf8").replace(/\r\n/g, "\n");
    const sectionBullets = (heading: string) => {
      const start = md.indexOf(heading);
      const end = md.indexOf("\n## ", start + 5);
      return md.slice(start, end).split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
    };
    const quoted = (b: string) => [...b.matchAll(/"([^"]+)"/g)].map((m) => m[1].replace(/\.\.\.$/, "").trim());
    const openers = sectionBullets("## 2.1").flatMap(quoted);
    check("§2.1 has 12 openers, every one matched", openers.length === 12 && openers.every((o) => BANNED_OPENERS.some((b) => b.pattern.test(o))), openers.filter((o) => !BANNED_OPENERS.some((b) => b.pattern.test(o))).join(" | "));
    const promo = sectionBullets("## 2.2").flatMap(quoted);
    check("§2.2 has 9 words, every one matched", promo.length === 9 && promo.every((w) => PROMOTIONAL.some((p) => p.pattern.test(w))), promo.join(" | "));
    const transitions = sectionBullets("## 2.3").flatMap((b) => quoted(b).flatMap((q) => q.split(/\.\.\.\s*/).map((x) => x.trim()).filter(Boolean)));
    check("§2.3 transitions all in the table", transitions.length >= 9 && transitions.every((t) => TRANSITION_WORDS.includes(t)), transitions.filter((t) => !TRANSITION_WORDS.includes(t)).join(" | "));
    const meta = sectionBullets("## 2.6").flatMap(quoted);
    check("§2.6 has 5 meta phrases, every one matched", meta.length === 5 && meta.every((m) => META_PHRASES.some((p) => p.pattern.test(m))), meta.join(" | "));
  }

  // ── Layer 2b references ──────────────────────────────────────────────────
  {
    const chs = withChapter(2, (t) => t.replace("It suits this study because fees and trust shape perceived usefulness.", "It suits this study because fees and trust shape perceived usefulness (Okonkwo and Bassey, 2019)."));
    const { prepared: p2 } = await prepare(chs);
    const r = finish(p2, chs);
    const ref = byId(r.checks, "REF");
    check("a citation not on the verified list fails the reference check", ref.status === "FAIL" && ref.issues.some((i) => i.level === "FAIL" && /Okonkwo and Bassey, 2019/.test(i.message) && i.chapter === 2), JSON.stringify(ref.issues.filter((i) => i.level === "FAIL")));
  }
  {
    const chs = withChapter(4, (t) => t.replace("Adoption had a mean of 3.62 on the five-point scale.", "Adoption had a mean of 3.62 on the five-point scale (World Bank, 2022)."));
    const five = await prepareReport({ input: inputFor(chs, { mode: 5 }), references: FIXTURE_REFERENCES, knownCommon: knownCommonCitation });
    const two = await prepareReport({ input: inputFor(chs), references: FIXTURE_REFERENCES, knownCommon: knownCommonCitation });
    check("World Bank as a data source is ignored in Mode 5", five.match.unmatched.length === 0);
    check("…but is an unmatched citation in a Mode 2 report", two.match.unmatched.some((u) => u.author === "World Bank"));
    check("(Field Survey, 2026) is never a citation", !prepared.match.uses.some((u) => /field/i.test(u.author)));
  }
  {
    const pair = { index: 1, chapter: 2, paragraph: 3, sentence: "s", ref: { ...FIXTURE_REFERENCES[0], abstract: "a".repeat(100) } };
    const many = Array.from({ length: 10 }, (_, i) => ({ ...pair, index: i + 1, verdict: (i < 2 ? "DOES_NOT_SUPPORT" : "SUPPORTS") as "DOES_NOT_SUPPORT" | "SUPPORTS", reason: "r" }));
    const r = finish(prepared, chapters, { support: { results: many, checked: 10, total: 10 } });
    check("20% of citations not supported fails the reference check", statusOf(r.checks, "REF") === "FAIL");
    const r2 = finish(prepared, chapters, { support: { results: many.map((m, i) => ({ ...m, verdict: i === 0 ? "DOES_NOT_SUPPORT" : "SUPPORTS" })), checked: 10, total: 10 } });
    check("10% not supported is a WARN", statusOf(r2.checks, "REF") === "WARN");
  }

  // ── Layer 3 structure ────────────────────────────────────────────────────
  const st = async (label: string, id: string, chs: FixtureChapter[], opts: { over?: Partial<AssemblyInput>; ctx?: { pureScience?: boolean; objectives?: string[] }; ai?: Partial<AiResults> } = {}) => {
    const { prepared: p2 } = await prepare(chs, opts.over);
    const r = finish(p2, chs, opts.ai, opts.ctx);
    check(label, statusOf(r.checks, id) === "FAIL", `${id}: ${statusOf(r.checks, id)} ${JSON.stringify(byId(r.checks, id)?.issues.slice(0, 2))}`);
    return r;
  };
  await st("ST2: a numbering gap (1.5 → 1.7) fails", "ST2", withChapter(1, (t) => t.replace("[H2] 1.6 Significance", "[H2] 1.7 Significance").replace("[H2] 1.7 Scope", "[H2] 1.8 Scope").replace("[H2] 1.8 Operational", "[H2] 1.9 Operational")));
  await st("ST3: no Statement of the Problem fails", "ST3", withChapter(1, (t) => t.replace("[H2] 1.2 Statement of the Problem", "[H2] 1.2 Context of the Traders")));
  await st("ST5: no Population section fails", "ST5", withChapter(3, (t) => t.replace("[H2] 3.2 Population of the Study", "[H2] 3.2 Traders Covered")));
  {
    const nursing = fixtureChapters();
    const r = await st("ST5: a Nursing Chapter Three without ethics fails…", "ST5", nursing, { over: { section: "NURSING" as SectionKey, department: "Nursing" } });
    check("…as CRITICAL, which blocks the pass", !r.score.passed && r.score.criticalFailures >= 1 && r.score.failures.some((f) => f.id === "ST5" && f.severity === "CRITICAL"));
  }
  await st("ST6: no Hypotheses Testing section fails", "ST6", withChapter(4, (t) => t.replace("[H2] 4.6 Hypotheses Testing", "[H2] 4.6 Further Results")));
  await st("ST7: no Recommendations section fails", "ST7", withChapter(5, (t) => t.replace("[H2] 5.4 Recommendations", "[H2] 5.4 Advice to Traders")));
  await st("ST8: an objective not stated word for word fails", "ST8", fixtureChapters(), { ctx: { objectives: [...FIXTURE_OBJECTIVES.slice(0, 2), "To measure the cost of cash handling among market traders in Lagos State."] } });
  await st("ST9: an objective not reported fails", "ST9", fixtureChapters(), { ai: { traceability: { objectives: GOOD_TRACE.objectives.map((o, i) => (i === 2 ? { ...o, reported: false } : o)) } } });
  await st("ST9: an objective never judged in Chapter Five fails", "ST9", fixtureChapters(), { ai: { traceability: { objectives: GOOD_TRACE.objectives.map((o, i) => (i === 1 ? { ...o, verdict: "NOT_STATED" as const } : o)) } } });
  {
    const { prepared: p2, chapters: c2 } = await prepare();
    const r = finish(p2, c2, { traceability: null });
    check("ST9: a traceability call that could not run is a WARN, not a failure", statusOf(r.checks, "ST9") === "WARN");
  }
  await st("ST10: a research question never answered fails", "ST10", withChapter(4, (t) => t.replace("Research Question Three asked about the relationship between trust in agents and adoption.", "The third finding concerns agents.").replace("[H3] 4.5.3 Research question three", "[H3] 4.5.3 Agents")));
  await st("ST11: a chapter at half its planned length fails", "ST11", fixtureChapters().map((c) => (c.number === 3 ? { ...c, plan: { ...c.plan, targetWords: c.plan.targetWords * 2 } } : c)));
  {
    const few = FIXTURE_REFERENCES.slice(0, 20);
    const { prepared: p2, chapters: c2 } = await prepare();
    const lean = await prepareReport({ input: { ...p2.input, references: few }, references: few, knownCommon: knownCommonCitation });
    const r = finish(lean, c2);
    check("ST12: 20 verified references cited fails (35 needed)", statusOf(r.checks, "ST12") === "FAIL");
  }
  await st("ST13: Chapter Five citing a new source fails", "ST13", withChapter(5, (t) => t.replace("Studies in Abuja and Kano markets would test whether the findings travel.", `Studies in Abuja and Kano markets would test whether the findings travel ${"(Coker & Akande, 2023)"}.`)).map((c) => (c.number === 2 ? { ...c, text: c.text.replace(/\(Coker & [A-Za-z]+, \d{4}\)/, "") } : c)));
  await st("ST14: a table never referred to fails", "ST14", withChapter(4, (t) => t.replace("Table 4.1 shows that 58% of the respondents were women.", "Most respondents were women.")));
  await st("ST15: an equation with no symbol definitions fails", "ST15", withChapter(3, (t) => t.replace(/where n is the sample size[^\n]*/, "The sample was then drawn from each market register.")));
  await st("ST16: a review placeholder left in fails", "ST16", withChapter(4, (t) => t.replace("Trust in agents had a mean of 3.18.", "Trust in agents had a mean of [DATA NOT PROVIDED — COO TO REVIEW].")));
  {
    const chs = withChapter(4, (t) => t.replace("[H2] 4.4 Reliability Test Results", "[FIGURE PLACEHOLDER: bar chart of adoption]\nFigure 4.1: Adoption by market (Researcher, 2026)\n\n[H2] 4.4 Reliability Test Results").replace("Adoption had a mean of 3.62", "Figure 4.1 shows adoption by market. Adoption had a mean of 3.62"));
    const { prepared: p2 } = await prepare(chs);
    check("ST16: a figure placeholder is a WARN (the specialist's task)", statusOf(finish(p2, chs).checks, "ST16") === "WARN");
  }

  // ── Required sections ⇄ the chapter prompt files ─────────────────────────
  {
    const sections: SectionKey[] = ["ENGINEERING", "MEDICAL_SCIENCE", "NURSING", "COMPUTER_SCIENCE", "BUSINESS", "ECONOMICS", "LAW_DOCTRINAL", "LAW_NON_DOCTRINAL", "HUMANITIES", "EDUCATION", "AGRICULTURE"];
    const problems: string[] = [];
    let listed = 0;
    for (const s of sections) {
      for (const n of [1, 2, 3, 4, 5] as ChapterNumber[]) {
        for (const ctx of [{ mode: 3, pureScience: false, hasHypotheses: true }, { mode: 4, pureScience: false, hasHypotheses: true }, { mode: 2, pureScience: false, hasHypotheses: true }]) {
          const req = requiredSections(s, n, ctx);
          if (!req || req === "THEMATIC") continue;
          const block = (await extractDepartmentSection(n, s)) ?? "";
          const headings = block.split("\n").filter((l) => new RegExp(`^${n}\\.\\d+\\s`).test(l.trim()));
          // Law non-doctrinal Chapter 1 and the Template B conclusion have no numbered list: nothing to hold them to.
          if (!headings.length) continue;
          for (const r of req) {
            listed++;
            if (!headings.some((h) => r.match.test(h))) problems.push(`${s} ch${n} "${r.label}"`);
          }
        }
      }
    }
    check(`every required section (${listed} checked) matches a heading in its prompt block`, problems.length === 0, [...new Set(problems)].join("; "));
  }

  // ── Scoring ──────────────────────────────────────────────────────────────
  {
    const mk = (fails: number, severity: "MAJOR" | "MINOR" | "CRITICAL" = "MINOR"): CheckResult[] =>
      clean.checks.map((c, i) => (i < fails ? { ...c, severity, status: "FAIL" as const, issues: [{ level: "FAIL" as const, message: "x" }] } : c));
    check(`${PASS_MARK} of 89 passes`, scoreQuality(mk(4)).passed && scoreQuality(mk(4)).qualityScore === 85);
    check("84 of 89 does not", !scoreQuality(mk(5)).passed);
    check("one CRITICAL failure blocks 88 of 89", !scoreQuality(mk(1, "CRITICAL")).passed);
    check("N/A and WARN count as passed", scoreQuality(clean.checks).qualityScore === 89);
    let threw = false;
    try {
      scoreQuality(clean.checks.slice(1));
    } catch {
      threw = true;
    }
    check("a layer with the wrong number of checks is refused", threw);
    const s = scoreQuality(mk(3, "MAJOR"));
    check("failures come first by severity, with their fix", s.failures.length === 3 && s.failures.every((f) => f.severity === "MAJOR"));
  }

  // ── Recall ───────────────────────────────────────────────────────────────
  {
    const at = new Date("2026-09-28T10:00:00Z");
    const until = recallWindowEnd(at);
    eq("recall window is 30 minutes", (until.getTime() - at.getTime()) / 60_000, RECALL_WINDOW_MINUTES);
    const facts = { status: "SUBMITTED", autoSubmittedAt: at, recallWindowExpiresAt: until, recalledAt: null };
    eq("recall: open inside the window", recallState(facts, new Date(at.getTime() + 29 * 60_000)), "OPEN");
    eq("recall: closed at 30 minutes", recallState(facts, until), "WINDOW_CLOSED");
    eq("recall: closed after", recallState(facts, new Date(at.getTime() + 31 * 60_000)), "WINDOW_CLOSED");
    eq("recall: a reviewer has started", recallState({ ...facts, status: "IN_QA_REVIEW" }, at), "REVIEW_STARTED");
    eq("recall: already recalled", recallState({ ...facts, recalledAt: new Date(at.getTime() + 60_000) }, at), "ALREADY_RECALLED");
    eq("recall: never auto-submitted", recallState({ ...facts, autoSubmittedAt: null, recallWindowExpiresAt: null }, at), "NOT_AUTO_SUBMITTED");
    eq("recall: a later submission after an earlier recall opens again", recallState({ ...facts, recalledAt: new Date(at.getTime() - 60_000) }, at), "OPEN");
    const rule = TRANSITIONS.SUBMITTED?.find((r) => r.to === "IN_PROGRESS");
    check("pipeline: SUBMITTED → IN_PROGRESS exists, never a generic button", Boolean(rule?.external));
    const cand = { status: "SUBMITTED", workerId: "w", workerAccepted: true, downpaymentStatus: "Verified", balanceStatus: "Unpaid", qaStatus: null, projectTitle: "t", serviceId: "s", hasRequirementDetail: true, workerFileCount: 1 } as const;
    check("pipeline: the recall guard refuses a closed window", rule?.guard?.({ ...cand, recallOpen: false }) !== null);
    check("pipeline: …and allows an open one", rule?.guard?.({ ...cand, recallOpen: true }) === null);
  }

  check(
    "auto-submit: the report's storage path is one the private store accepts",
    parseStoredPath(generatedReportPath("cmukdnqwy000211lvish6wobk", "cmukdnr1a000511lvabcd1234"))?.purpose === "deliverable",
  );

  // ── Re-generation: the failures a chapter carries ────────────────────────
  {
    const chs = withChapter(2, (t) => t.replace("It suits this study because fees and trust shape perceived usefulness.", "It suits this study because fees and trust shape perceived usefulness (Okonkwo and Bassey, 2019).").replace("[H2] 2.1 Introduction", "[H2] 2.1 Introduction\nMoreover, the review is long and it covers traders in the market today."));
    const { prepared: p2 } = await prepare(chs);
    const r = finish(p2, chs);
    const lines = failureLinesForChapter(r.score.failures, 2);
    check("re-generation: Chapter 2's failures become lines", lines.length >= 2 && lines.some((l) => l.startsWith("[REF]") && /Okonkwo and Bassey/.test(l)) && lines.some((l) => l.startsWith("[VOICE]") && /Moreover/.test(l)), lines.join(" || "));
    check("re-generation: another chapter's failures are left out", failureLinesForChapter(r.score.failures, 3).length === 0);
    const brief = buildChapterBrief({ chapter: 2, projectTitle: FIXTURE_TITLE, university: "University of Lagos", department: "Business Administration", template: "A", objectives: FIXTURE_OBJECTIVES, researchQuestions: ["What is the effect?"], qualityFailures: lines });
    check("re-generation: the brief ends with the failure block", /QUALITY CHECK FAILURES IN THE PREVIOUS VERSION OF THIS CHAPTER\nThe previous version of Chapter 2 failed these checks\. Write the chapter so that none of them happens again:\n- \[/.test(brief) && brief.trim().endsWith(lines[lines.length - 1]));
    check("re-generation: a brief without failures has no block", !/QUALITY CHECK FAILURES/.test(buildChapterBrief({ chapter: 2, projectTitle: FIXTURE_TITLE, university: "U", department: "D", template: "A", objectives: FIXTURE_OBJECTIVES })));
    eq("re-generation: the first run's research questions are read back from its brief", briefStatements(brief, "Research questions:"), ["What is the effect?"]);
  }

  if (failures.length) {
    console.error(`check:quality — ${failures.length} failed, ${passed} passed:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`check:quality — all ${passed} checks passed`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
