/**
 * Phase D3b: objectives and the Law/History source stage, proven without a
 * database or any Claude call. `npm run check:sources`.
 *
 * The department gate, the 16-search budget and two attempts per point, the
 * honesty checks (a case must come from a page the search returned; never from
 * a blocked site), matching a case to the Supreme Court's own record, the
 * objectives rules, the planners' clean-up, the judge's mapping, the card's
 * view and blockers, and the lines the chapter prompts get.
 */
import { validateAim, validateObjectives } from "../src/lib/generation/objectives-rules";
import { aimUserPrompt, extractClientStatedAim, extractClientStatedObjectives, objectivesUserPrompt } from "../src/lib/generation/objectives-drafter";
import {
  OBJECTIVES_CHECK_TEXT,
  checkState,
  checkUserPrompt,
  isWeakRow,
  objectivesCheckKey,
  readStoredCheck,
  scoreBand,
  validateCheckReply,
  type StoredObjectivesCheck,
} from "../src/lib/generation/objectives-check-rules";
import { formatPrimarySource } from "../src/lib/generation/prompt-loader";
import { cleanArchivePlan, judgeUserPrompt, readJudgement } from "../src/lib/research/archive-fetcher";
import { cleanPoints, vetRecordedCases } from "../src/lib/research/legal-source-fetcher";
import {
  ARCHIVE_SOURCES,
  ATTEMPTS_PER_POINT,
  MAX_POINTS,
  SOURCE_SEARCH_LIMIT,
  enabledArchiveSources,
  isBlockedDomain,
  listFrom,
  matchJudgment,
  normalizeUrl,
  partyTokens,
  placeholderFor,
  searchesLeft,
  sourceKindForDepartment,
  urlInResults,
  webSearchesForPoint,
  type ArchiveRecord,
} from "../src/lib/research/source-policy";
import { readPoints } from "../src/lib/research/source-points";
import { resumeStatusFor } from "../src/lib/research/source-stage";
import {
  STAGE_QUIET_MS,
  briefBlockers,
  buildBriefView,
  isQuietRun,
  modeMismatchLine,
  objectivesModeMismatch,
  type BriefCardRow,
} from "../src/lib/research/source-stage-view";

let failures = 0;
let passes = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  } else passes++;
}

// ── Which departments get a search ──
expect("Law gets cases", sourceKindForDepartment("Law"), "CASE");
expect("LL.B gets cases", sourceKindForDepartment("LL.B"), "CASE");
expect("Public Law gets cases", sourceKindForDepartment("Public Law"), "CASE");
expect("a combined Law name gets cases", sourceKindForDepartment("Civil Law"), "CASE");
expect("History gets archival sources", sourceKindForDepartment("History"), "ARCHIVE");
expect("History and International Studies gets archival sources", sourceKindForDepartment("History and International Studies"), "ARCHIVE");
expect("English gets no search (Humanities, not History)", sourceKindForDepartment("English"), null);
expect("Criminology is not Law", sourceKindForDepartment("Criminology and Security Studies"), null);
expect("Business Administration gets no search", sourceKindForDepartment("Business Administration"), null);
expect("an unknown department gets no search", sourceKindForDepartment("Underwater Basket Weaving"), null);
expect("placeholders", [placeholderFor("CASE"), placeholderFor("ARCHIVE")], ["[CASE TO BE SUPPLIED]", "[ARCHIVE TO BE SUPPLIED]"]);

// ── The 16-search budget, two attempts per point ──
expect("16 searches a project", SOURCE_SEARCH_LIMIT, 16);
expect("8 points × 2 attempts fit the 16 exactly", MAX_POINTS * ATTEMPTS_PER_POINT, SOURCE_SEARCH_LIMIT);
expect("a fresh point gets 2 web searches", webSearchesForPoint(0), 2);
expect("with 1 left a point gets 1", webSearchesForPoint(15), 1);
expect("none left, none given", webSearchesForPoint(16), 0);
expect("never below zero", [searchesLeft(20), searchesLeft(-3)], [0, 16]);

// ── Only verified sources are switched on ──
expect(
  "switched on: Hansard, Internet Archive, Wellcome, UNILAG, ABU",
  enabledArchiveSources().map((s) => s.key),
  ["HANSARD", "INTERNET_ARCHIVE", "WELLCOME", "UNILAG", "ABU"],
);
expect("off until registration / permission", [ARCHIVE_SOURCES.NATIONAL_ARCHIVES.enabled, ARCHIVE_SOURCES.NATIONAL_LIBRARY.enabled, ARCHIVE_SOURCES.IBADAN.enabled], [false, false, false]);

// ── URLs ──
expect("scheme, www and a trailing slash do not matter", normalizeUrl("http://www.Guardian.ng/features/x/"), "guardian.ng/features/x");
expect("the query does not matter", urlInResults("https://lawcarenigeria.com/case-x?ref=1", ["https://lawcarenigeria.com/case-x"]), true);
expect("another page is not a match", urlInResults("https://lawcarenigeria.com/case-y", ["https://lawcarenigeria.com/case-x"]), false);
expect("a javascript: URL is never a match", urlInResults("javascript:alert(1)", ["javascript:alert(1)"]), false);
expect("vLex subdomains are blocked", isBlockedDomain("https://ng.vlex.com/vid/abc"), true);
expect("judy.legal subdomains are blocked", isBlockedDomain("https://law.judy.legal/case/x"), true);
expect("a look-alike domain is not blocked", isBlockedDomain("https://notjudy.legal/x"), false);

// ── Case names and the Supreme Court's own record ──
expect("FRN is not a distinctive party", partyTokens("Federal Republic of Nigeria v. Igbinedion"), ["igbinedion"]);
expect("an acronym party counts", partyTokens("PML (Nig.) Ltd v. FRN"), ["pml"]);
expect("longest name first", partyTokens("The State v. Chief Olabode George"), ["olabode", "george"]);
expect("a case named only by generic words has no party", partyTokens("The State v. The State"), []);
const record = { petitioner: "CHIRUNIM ELECHI", respondent: "THE STATE", year: 2026 };
expect("matches the record", matchJudgment("Chirunim Elechi v. The State", 2026, record), true);
expect("a year off by one still matches", matchJudgment("Elechi v. State", 2025, record), true);
expect("a year far off does not", matchJudgment("Chirunim Elechi v. The State", 2019, record), false);
expect("another party does not", matchJudgment("Okafor v. The State", 2026, record), false);
expect("a generic name is never confirmed", matchJudgment("The State v. The State", 2026, record), false);

// ── A case must come from a page the search returned ──
const results = [
  { url: "https://lawcarenigeria.com/michael-igbinedion-v-frn-2014/", title: "Igbinedion v FRN" },
  { url: "https://guardian.ng/features/plea-bargain/", title: "Does plea bargain…" },
  { url: "https://ng.vlex.com/vid/some-case", title: "vLex" },
];
const vetted = vetRecordedCases(
  {
    cases: [
      { caseName: "Michael Igbinedion v. Federal Republic of Nigeria", court: "Court of Appeal", year: 2014, sourceUrl: "https://lawcarenigeria.com/michael-igbinedion-v-frn-2014", supports: "A plea agreement needs the court's approval." },
      { caseName: "Invented v. Case", sourceUrl: "https://example.com/not-returned", supports: "x" },
      { caseName: "Somebody v. State", sourceUrl: "https://ng.vlex.com/vid/some-case", supports: "x" },
      { caseName: "Igbinedion v. FRN", sourceUrl: "https://guardian.ng/features/plea-bargain/", supports: "the same case again" },
      { caseName: "Promise v. FRN", year: 3020, sourceUrl: "https://guardian.ng/features/plea-bargain", supports: "y" },
    ],
  },
  results,
);
expect("kept: the real one and a second from a returned page (a duplicate dropped)", vetted.cases.map((c) => c.caseName), ["Michael Igbinedion v. Federal Republic of Nigeria", "Promise v. FRN"]);
expect("a nonsense year is dropped", vetted.cases[1].year, null);
expect("the result's title is kept", vetted.cases[0].sourceTitle, "Igbinedion v FRN");
expect(
  "dropped: not returned, blocked site",
  vetted.dropped.map((d) => d.reason),
  ["its page was not among the search results", "found on a site whose terms forbid automated collection"],
);
expect("no record, no cases", vetRecordedCases(null, results).cases, []);

// ── The planners' clean-up ──
expect("points: trimmed, distinct, at most 8", cleanPoints(["  Whether plea bargains bind courts  ", "whether plea bargains bind courts", "short", ...Array.from({ length: 10 }, (_, i) => `Legal point number ${i}`)]).length, 8);
const plan = cleanArchivePlan({
  points: [
    {
      text: "How was direct taxation introduced in Benin Province?",
      attempts: [
        { source: "NATIONAL_ARCHIVES", query: "Benin taxation" },
        { source: "HANSARD", query: "Benin \"Province\" taxation riots 1927 native administration ordinance amended", fromYear: 1960, toYear: 1920 },
        { source: "INTERNET_ARCHIVE", query: "third attempt" },
      ],
    },
    { text: "Only switched-off sources", attempts: [{ source: "IBADAN", query: "x y z" }] },
  ],
});
expect("a switched-off source is dropped; a point with none left is dropped", plan.map((p) => p.attempts.map((a) => a.source)), [["HANSARD", "INTERNET_ARCHIVE"]]);
expect("a query is cut to 4 words (catalogues match every word), quotes removed", plan[0].attempts[0].query, "Benin Province taxation riots");
expect("a reversed year range is put right", [plan[0].attempts[0].fromYear, plan[0].attempts[0].toYear], [1920, 1960]);

// ── A list the model sends as a JSON string (seen live, 27 Sept) ──
const wrapped = JSON.stringify({ points: [{ text: "How was tax assessed in Benin Province?", attempts: [{ source: "HANSARD", query: "Benin taxation" }] }] });
expect("a plan whose points arrive as a string wrapping an object is read", cleanArchivePlan({ points: wrapped }).map((p) => p.text), ["How was tax assessed in Benin Province?"]);
expect("…and as a plain JSON list", cleanPoints(JSON.stringify(["Whether plea bargains bind Nigerian courts"])), ["Whether plea bargains bind Nigerian courts"]);
expect("unreadable text is an empty list, never an error", [listFrom("not json", "points"), listFrom(42, "points"), listFrom({ other: [1] }, "points")], [[], [], []]);

// ── The judge's answer ──
const rec = (title: string): ArchiveRecord => ({ source: "HANSARD", title, date: "1929-12-10", holder: "UK Parliament, House of Commons", reference: "HC Deb 1929-12-10", url: "https://hansard.parliament.uk/x", recordType: "Primary", description: null });
const items = [
  { pointIndex: 0, point: "Q one", records: [rec("A"), rec("B")] },
  { pointIndex: 2, point: "Q three", records: [rec("C")] },
];
expect("the judge sees numbered records", judgeUserPrompt(items).includes("Question 3: Q three\n  [1] C | 1929-12-10"), true);
const kept = readJudgement(
  { points: [{ question: 1, keep: [{ record: 2, relevance: "shows B" }, { record: 2, relevance: "again" }, { record: 9, relevance: "no such record" }] }, { question: 5, keep: [{ record: 1 }] }] },
  items,
);
expect("only real records, once each, for real questions", kept.map((k) => [k.pointIndex, k.record.title, k.relevance]), [[0, "B", "shows B"]]);

// ── Objectives ──
expect("4 good objectives pass (tidied)", validateObjectives(["1. To examine the legal basis of plea bargaining in Nigeria.", "To assess its effect on sentencing", "To compare it with the English approach;", "To propose reforms for Nigeria"]), {
  ok: true,
  objectives: ["To examine the legal basis of plea bargaining in Nigeria", "To assess its effect on sentencing", "To compare it with the English approach", "To propose reforms for Nigeria"],
});
expect("three are too few (new MIN=4)", validateObjectives(["To examine a b c", "To assess b c d e f g", "To compare c d e f g"]).ok, false);
expect("six are too many", validateObjectives(Array.from({ length: 6 }, (_, i) => `To examine aspect number ${i}`)).ok, false);
const bad = validateObjectives(["Examine the law of plea bargaining", "To assess its effect on sentencing", "To assess its effect on sentencing", `To ${"x".repeat(260)}`]);
expect("must begin with To, no repeats, no overlong ones", bad.ok ? [] : bad.problems, [
  'Objective 1 should begin with "To" and a verb.',
  "Objective 4 is over 250 characters.",
  "Objective 3 repeats an earlier one.",
]);
const prompt = objectivesUserPrompt({ title: "  Plea bargaining in Nigeria  ", department: "Law", degree: "LL.B", modeNumber: 1 });
expect(
  "the drafter prompt carries the four labelled inputs",
  [
    prompt.includes("PROJECT TITLE: Plea bargaining in Nigeria"),
    prompt.includes("RESEARCH MODE: Mode 1 (Thematic)"),
    prompt.includes("DEPARTMENT: Law"),
    prompt.includes("DEGREE: LL.B"),
  ],
  [true, true, true, true],
);

// ── Client-stated objectives fallback (pure) ──
// If the client's brief or the supervisor's outline already lists 4–5 "To …"
// lines, use them verbatim (fromClient=true) and skip the Claude call.
expect(
  "special instructions listing 4 numbered To-lines → extracted",
  extractClientStatedObjectives({
    specialInstructions: "Please cover these objectives:\n1. To examine the causes of X in Nigeria\n2. To analyse the effects of X on Y\n3. To assess mitigation measures for X\n4. To recommend a framework for handling X",
    departmentOutline: null,
  }),
  [
    "To examine the causes of X in Nigeria",
    "To analyse the effects of X on Y",
    "To assess mitigation measures for X",
    "To recommend a framework for handling X",
  ],
);
expect(
  "department outline bullets with 5 To-lines → extracted",
  extractClientStatedObjectives({
    specialInstructions: null,
    departmentOutline:
      "OBJECTIVES\n• To examine A in Nigerian schools\n• To assess B among students\n• To determine C in Lagos\n• To compare D across regions\n• To propose E for policy",
  }),
  [
    "To examine A in Nigerian schools",
    "To assess B among students",
    "To determine C in Lagos",
    "To compare D across regions",
    "To propose E for policy",
  ],
);
expect(
  "only 3 To-lines → returns null (below MIN)",
  extractClientStatedObjectives({
    specialInstructions: "1. To examine the causes\n2. To assess the effects\n3. To propose a solution",
    departmentOutline: null,
  }),
  null,
);
expect(
  "prose with no To-lines → returns null",
  extractClientStatedObjectives({
    specialInstructions: "The student should focus on Lagos State. Please cross-check with quality delivery.",
    departmentOutline: null,
  }),
  null,
);
expect(
  "both fields null → returns null",
  extractClientStatedObjectives({ specialInstructions: null, departmentOutline: null }),
  null,
);

// ── The aim (founder, 30 Sept 2026: every report states one aim before its objectives) ──
const goodAim = "The aim of this study is to develop a cybersecurity framework of prevention and mitigation strategies for Nigerian SMEs.";
expect("a one-sentence aim passes", validateAim(goodAim), { ok: true, aim: goodAim });
expect("\"project\" and \"research\" are accepted openings", [
  validateAim("The aim of this project is to design a solar-powered water pump that cuts diesel use for rural farms.").ok,
  validateAim("The aim of this research is to examine the effect of plea bargaining on criminal justice in Nigeria.").ok,
], [true, true]);
expect("a missing full stop is added, not refused", validateAim(goodAim.slice(0, -1)), { ok: true, aim: goodAim });
expect("an empty aim asks for one", validateAim("  "), { ok: false, problems: ['Write the aim: one sentence starting "The aim of this study is to".'] });
expect("an aim that does not open the right way is refused", validateAim("To develop a cybersecurity framework for SMEs in Nigeria using published data.").ok, false);
expect("two sentences are refused", validateAim(`${goodAim} It will also test the framework on real incidents.`), {
  ok: false,
  problems: ["The aim should be one sentence."],
});
expect("abbreviations do not count as a second sentence", validateAim("The aim of this study is to compare frameworks, e.g. NIST and ISO 27001, for Nigerian SMEs in Lagos.").ok, true);
expect("an overlong aim is refused", validateAim(`The aim of this study is to ${"examine ".repeat(45)}everything.`).ok, false);
expect("the aim-only prompt carries the project and the numbered objectives", aimUserPrompt({ title: "T", department: "Law", degree: "LL.B", modeNumber: 1 }, ["To a thing well", "To b thing well"]).split("\n").slice(-3), [
  "OBJECTIVES:",
  "1. To a thing well",
  "2. To b thing well",
]);
expect(
  "a client's \"Aim: to …\" line becomes the aim sentence",
  extractClientStatedAim({ specialInstructions: "Topic below.\nAim: to develop a web-based hostel allocation system for Nigerian universities.\nThanks", departmentOutline: null }),
  "The aim of this study is to develop a web-based hostel allocation system for Nigerian universities.",
);
expect(
  "a full aim sentence in the outline is used word for word",
  extractClientStatedAim({ specialInstructions: null, departmentOutline: "1.3 Aim and objectives\nThe aim of this project is to design a smart irrigation controller that saves water for smallholder farms." }),
  "The aim of this project is to design a smart irrigation controller that saves water for smallholder farms.",
);
expect("no aim line → null", extractClientStatedAim({ specialInstructions: "Please aim for 60 pages.", departmentOutline: null }), null);

// ── The independent check (founder, 30 Sept 2026: a separate model, blind to the drafter) ──
const checkNow = Date.parse("2026-09-30T12:00:00Z");
const checkIn = {
  title: "Developing a Cybersecurity Framework for SMEs",
  department: "Computer Science",
  degree: "B.Sc",
  modeNumber: 5 as const,
  aim: goodAim,
  objectives: ["To examine A in SMEs", "To analyse B in SMEs", "To assess C in SMEs", "To develop D for SMEs"],
};
const judgePrompt = checkUserPrompt(checkIn);
expect("the judge gets the title, department, degree, method, aim and numbered objectives", [
  judgePrompt.includes("PROJECT TITLE: Developing a Cybersecurity Framework for SMEs"),
  judgePrompt.includes("DEGREE: B.Sc"),
  judgePrompt.includes(`RESEARCH METHOD: ${OBJECTIVES_CHECK_TEXT.modes[5]}`),
  judgePrompt.includes(`PROPOSED AIM:\n${goodAim}`),
  judgePrompt.includes("4. To develop D for SMEs"),
], [true, true, true, true, true]);
expect(
  "the judge is blind: nothing says the text was drafted by AI or shows the drafter's instructions",
  [/\b(AI|artificial intelligence|drafter|drafted by|generated|Claude)\b/i.test(OBJECTIVES_CHECK_TEXT.system + judgePrompt), /STEP 1 — UNDERSTAND THE TITLE/.test(OBJECTIVES_CHECK_TEXT.system)],
  [false, false],
);
expect("with no aim the judge is told so", checkUserPrompt({ ...checkIn, aim: null }).includes("PROPOSED AIM:\nNone stated."), true);
const judgeRow = (number: number, extra: Record<string, unknown> = {}) => ({ number, related: 80, strong: 70.4, achievable: "75", reason: " Specific and measurable. ", suggestion: "", ...extra });
const goodReply = {
  overall: { related: 84, strong: 64, achievable: 66, summary: "Covers the title; objectives 1 and 2 overlap." },
  aim: { related: 86, strong: 66, achievable: 72, reason: "One sentence.", suggestion: "" },
  objectives: [judgeRow(2), judgeRow(1), judgeRow(3), judgeRow(4, { strong: 55, suggestion: "Name the dataset." })],
};
const parsed = validateCheckReply(goodReply, 4);
expect("a good reply: rows sorted aim first, scores rounded, empty suggestions null", parsed.ok ? [parsed.rows.map((r) => r.index), parsed.rows[1].strong, parsed.rows[1].achievable, parsed.rows[1].reason, parsed.rows[1].suggestion, parsed.rows[4].suggestion] : parsed.problems, [
  [0, 1, 2, 3, 4],
  70,
  75,
  "Specific and measurable.",
  null,
  "Name the dataset.",
]);
expect("a score out of range is refused", validateCheckReply({ ...goodReply, overall: { ...goodReply.overall, related: 140 } }, 4).ok, false);
expect("a missing objective row is refused", validateCheckReply({ ...goodReply, objectives: goodReply.objectives.slice(0, 3) }, 4), {
  ok: false,
  problems: ["Score every objective exactly once (4 expected, 3 given)."],
});
expect("a repeated number is refused", validateCheckReply({ ...goodReply, objectives: [judgeRow(1), judgeRow(1), judgeRow(3), judgeRow(4)] }, 4).ok, false);
expect("an extra row is refused", validateCheckReply({ ...goodReply, objectives: [...goodReply.objectives, judgeRow(5)] }, 4).ok, false);
expect("a missing summary is refused", validateCheckReply({ ...goodReply, overall: { ...goodReply.overall, summary: " " } }, 4).ok, false);
expect("a long reason is trimmed to 240 characters", (() => {
  const r = validateCheckReply({ ...goodReply, objectives: [judgeRow(1, { reason: "x".repeat(400) }), judgeRow(2), judgeRow(3), judgeRow(4)] }, 4);
  return r.ok ? r.rows[1].reason.length : -1;
})(), 240);
expect("bands: 59 Weak, 60 Fair, 79 Fair, 80 Strong", [scoreBand(59), scoreBand(60), scoreBand(79), scoreBand(80)], ["Weak", "Fair", "Fair", "Strong"]);
expect("a row is weak when any score is under 60", [isWeakRow({ related: 90, strong: 59, achievable: 90 }), isWeakRow({ related: 60, strong: 60, achievable: 60 })], [true, false]);
const key = objectivesCheckKey(checkIn);
expect("the key is stable and ignores spacing and title case", [objectivesCheckKey({ ...checkIn }), objectivesCheckKey({ ...checkIn, title: "  developing a cybersecurity   framework for SMEs " })], [key, key]);
expect("an edited objective, a new aim, a new mode change the key", [
  objectivesCheckKey({ ...checkIn, objectives: [...checkIn.objectives.slice(0, 3), "To develop E for SMEs"] }) !== key,
  objectivesCheckKey({ ...checkIn, aim: "The aim of this study is to study SMEs and their security in Nigeria today." }) !== key,
  objectivesCheckKey({ ...checkIn, modeNumber: 3 }) !== key,
], [true, true, true]);
const stored: StoredObjectivesCheck = { status: "done", model: "claude-opus-5-5", checkedAt: new Date(checkNow).toISOString(), inputKey: key, overall: { related: 84, strong: 64, achievable: 66, summary: "s" }, rows: [], costNaira: 56.5, error: null };
expect("check state: running while the lease holds, then done, stale after an edit, failed", [
  checkState(stored, new Date(checkNow + 60_000), key, checkNow),
  checkState(stored, new Date(checkNow - 1), key, checkNow),
  checkState(stored, null, "other", checkNow),
  checkState({ ...stored, status: "failed", error: "Claude could not be reached" }, null, key, checkNow),
  checkState(null, null, key, checkNow),
], ["running", "done", "stale", "failed", "none"]);
expect("a stored check reads back; junk reads as none", [readStoredCheck(JSON.parse(JSON.stringify(stored)))?.costNaira, readStoredCheck({ status: "odd" }), readStoredCheck(null)], [56.5, null, null]);

// ── Where a stopped stage carries on ──
expect("no objectives: draft them", resumeStatusFor({ objectives: [], sourceKind: "CASE", points: null, searchedAt: null }), "DRAFTING_OBJECTIVES");
expect("objectives, no points: plan", resumeStatusFor({ objectives: ["To x"], sourceKind: "CASE", points: null, searchedAt: null }), "PLANNING_POINTS");
expect("points, not finished: search", resumeStatusFor({ objectives: ["To x"], sourceKind: "CASE", points: [], searchedAt: null }), "SEARCHING");
expect("no source stage: ready", resumeStatusFor({ objectives: ["To x"], sourceKind: null, points: null, searchedAt: null }), "READY");
expect("points read safely", readPoints([{ text: "P", outcome: "odd", searches: "x" }, null, { index: 3, text: "Q", outcome: "FOUND", searches: 2, queries: ["a", 5] }]).map((p) => [p.index, p.outcome, p.searches, p.queries]), [
  [0, "PENDING", 0, []],
  [3, "FOUND", 2, ["a"]],
]);

// ── The card ──
const now = Date.parse("2026-09-27T12:00:00Z");
const row = (over: Partial<BriefCardRow>): BriefCardRow => ({
  id: "b1",
  status: "READY",
  sourceKind: "CASE",
  department: "Law",
  draftedObjectives: ["To examine x in Nigeria", "To assess y in Nigeria", "To compare z in Nigeria", "To propose w for Nigeria"],
  objectives: ["To examine x in Nigeria", "To assess y in Nigeria", "To compare z in Nigeria", "To propose w for Nigeria"],
  objectivesFromClient: false,
  objectivesModeNumber: 2,
  aim: "The aim of this study is to examine how x shapes y and z in Nigeria and propose w for Nigeria.",
  draftedAim: null,
  objectivesCheck: null,
  objectivesCheckLockedUntil: null,
  points: [
    { index: 0, text: "Point A", searches: 2, outcome: "FOUND", queries: [], attempts: [] },
    { index: 1, text: "Point B", searches: 2, outcome: "NONE", queries: [], attempts: [] },
  ],
  searchesUsed: 4,
  cursor: 4,
  lockedUntil: null,
  failedSteps: 0,
  lastError: null,
  searchedAt: new Date(now - 60_000),
  updatedAt: new Date(now - 60_000),
  sources: [
    { id: "s1", kind: "CASE", origin: "SUPREME_COURT", pointIndex: 0, title: "X v. State", court: "Supreme Court of Nigeria", decidedOn: "2012-03-02", citation: "(2012) LPELR-1", suitNumber: "SC/1/2010", holder: null, reference: null, recordType: null, sourceUrl: "https://guardian.ng/a", officialUrl: "https://scnwebsites3.s3.af-south-1.amazonaws.com/judgements/original/x.pdf", relevance: "decides A", confirmed: true, selected: true, pdfPath: "projects/p/source/s1/aaa.pdf", addedById: null },
    { id: "s2", kind: "CASE", origin: "WEB", pointIndex: 0, title: "Y v. FRN", court: "Court of Appeal", decidedOn: "2020", citation: null, suitNumber: null, holder: null, reference: null, recordType: null, sourceUrl: "https://www.lawcarenigeria.com/y", officialUrl: null, relevance: "supports A", confirmed: false, selected: false, pdfPath: null, addedById: null },
  ],
  ...over,
});
const none = buildBriefView(null, { costNaira: 0, currentDepartment: "Law", currentMode: 2, locked: false, now });
expect("no brief yet: Law can start a case search", [none.status, none.kindLabel, none.canStart, none.placeholder], ["NONE", "Cases", true, "[CASE TO BE SUPPLIED]"]);
expect("no brief yet blocks approval", briefBlockers(none, true), ["Draft the objectives first: press Draft objectives below."]);
const ready = buildBriefView(row({}), { costNaira: 420.5, currentDepartment: "Law", currentMode: 2, locked: false, now });
expect("ready: sources under their points, the PDF known, the domain shown", [ready.points[0].sources.map((s) => [s.id, s.hasPdf, s.sourceDomain]), ready.points[1].sources.length], [
  [
    ["s1", true, "guardian.ng"],
    ["s2", false, "lawcarenigeria.com"],
  ],
  0,
]);
expect("ready: editable, can redraft, nothing blocks", [ready.canEdit, ready.canRedraft, briefBlockers(ready, true)], [true, true, []]);
const running = buildBriefView(row({ status: "SEARCHING", cursor: 2, lockedUntil: new Date(now + 60_000) }), { costNaira: 0, currentDepartment: "Law", currentMode: 2, locked: false, now });
expect("running: progress by point, approval waits", [running.running, running.progress, briefBlockers(running, true)], [true, "Finding cases: point 2 of 2", ["The objectives and sources are still being prepared."]]);
const stopped = buildBriefView(row({ status: "SEARCHING", failedSteps: 4, lastError: "overloaded" }), { costNaira: 0, currentDepartment: "Law", currentMode: 2, locked: false, now });
expect("stopped after 4 failures: Carry on", [stopped.stopped, stopped.canCarryOn, stopped.error], [true, true, "overloaded"]);
const moved = buildBriefView(row({}), { costNaira: 0, currentDepartment: "History", currentMode: 2, locked: false, now });
expect("department now History: start again for archives", [moved.kindMismatch, moved.canStart, briefBlockers(moved, true)], [
  { now: "ARCHIVE" },
  true,
  ["The department now calls for archival sources: press Start again to search for them."],
]);
const emptySearch = buildBriefView(row({ points: [], sources: [] }), { costNaira: 0, currentDepartment: "Law", currentMode: 2, locked: false, now });
expect("a finished search with no points: Search again is offered", [emptySearch.noPoints, emptySearch.canStart], [true, true]);
const lockedView = buildBriefView(row({}), { costNaira: 0, currentDepartment: "Law", currentMode: 2, locked: true, now });
expect("locked: nothing editable", [lockedView.canEdit, lockedView.canRedraft, lockedView.canStart], [false, false, false]);
const badObjectives = buildBriefView(row({ objectives: ["To x"] }), { costNaira: 0, currentDepartment: "Law", currentMode: 2, locked: false, now });
expect("bad saved objectives block approval", briefBlockers(badObjectives, true)[0], "Give 4 to 5 objectives (there is 1).");
const hansard = buildBriefView(row({ sourceKind: "ARCHIVE", department: "History", sources: [{ ...row({}).sources[0], id: "h1", kind: "ARCHIVE", origin: "HANSARD" }] }), { costNaira: 0, currentDepartment: "History", currentMode: 2, locked: false, now });
expect("Hansard used: the licence attribution shows", hansard.attribution, "Contains Parliamentary information licensed under the Open Parliament Licence v3.0.");

// ── The lines the chapters get ──
expect(
  "a case line",
  formatPrimarySource("case", { point: "Point A", title: "X v. State", court: "Supreme Court of Nigeria", decidedOn: "2012-03-02", citation: "(2012) LPELR-1", suitNumber: "SC/1/2010" }),
  "X v. State (2012), (2012) LPELR-1, Supreme Court of Nigeria, suit no. SC/1/2010. Supports: Point A",
);
expect("a case line with no citation or year", formatPrimarySource("case", { point: "P", title: "Y v. FRN", court: null, decidedOn: null }), "Y v. FRN. Supports: P");
expect("an archive line", formatPrimarySource("archive", { point: "Q", title: "Taxation in Nigeria", decidedOn: "1934-1943", holder: "The National Archives, Kew", reference: "CO 583/200/6", recordType: "Primary" }), "Taxation in Nigeria, 1934-1943, The National Archives, Kew, CO 583/200/6 (primary record). Bears on: Q");
expect("a {TOKEN} in a found title never becomes a placeholder", formatPrimarySource("case", { point: "P", title: "{SUPERVISOR} v. State" }).includes("{SUPERVISOR}"), false);

// ── Nothing starts on its own (founder, 30 Sept 2026) ──
// A brief is drafted only when the founder or the COO presses Draft objectives.
// PENDING (a brief made by research passing, before this rule) is "not started";
// a run whose chain was lost is "stopped" with Carry on, never restarted by a page
// load; a mode change never re-drafts, it asks for Draft again.
const pending = buildBriefView(row({ status: "PENDING", objectives: [], draftedObjectives: [], objectivesModeNumber: null, points: null, sources: [], sourceKind: null, cursor: 0, searchesUsed: 0, searchedAt: null }), { costNaira: 0, currentDepartment: "Computer Science", currentMode: 3, locked: false, now });
expect("a PENDING brief is not started: Draft objectives offered, nothing running (no poll)", [pending.status, pending.notStarted, pending.running, pending.stopped, pending.canStart, pending.progress], ["PENDING", true, false, false, true, null]);
expect("a PENDING brief blocks approval until Draft objectives", briefBlockers(pending, true), ["Draft the objectives first: press Draft objectives below."]);
expect("no brief is not started either", [none.notStarted, none.running], [true, false]);
const pendingLocked = buildBriefView(row({ status: "PENDING", objectives: [], points: null, sources: [] }), { costNaira: 0, currentDepartment: "Law", currentMode: 1, locked: true, now });
expect("a PENDING brief on a locked card offers nothing", [pendingLocked.canStart, pendingLocked.canCarryOn], [false, false]);

const liveLease = buildBriefView(row({ status: "DRAFTING_OBJECTIVES", lockedUntil: new Date(now + 60_000), updatedAt: new Date(now - 10 * 60_000) }), { costNaira: 0, currentDepartment: "Law", currentMode: 2, locked: false, now });
expect("a live lease is running, however old the last write", [liveLease.running, liveLease.stopped, liveLease.progress], [true, false, "Drafting objectives…"]);
const quiet = buildBriefView(row({ status: "SEARCHING", lockedUntil: new Date(now - 5 * 60_000), updatedAt: new Date(now - 4 * 60_000) }), { costNaira: 0, currentDepartment: "Law", currentMode: 2, locked: false, now });
expect("a lapsed lease with no write for 4 min is stopped: Carry on, no auto-restart", [quiet.running, quiet.stopped, quiet.canCarryOn, quiet.error], [false, true, true, "The background run was interrupted."]);
expect("a quiet run blocks approval with Carry on", briefBlockers(quiet, true), ["The objectives and source search stopped: The background run was interrupted. Press Carry on."]);
const handOver = buildBriefView(row({ status: "SEARCHING", lockedUntil: null, updatedAt: new Date(now - 20_000) }), { costNaira: 0, currentDepartment: "Law", currentMode: 2, locked: false, now });
expect("a lapsed lease written 20 s ago is between slices: still running", [handOver.running, handOver.stopped], [true, false]);
const lostChain = buildBriefView(row({ status: "PLANNING_POINTS", lockedUntil: null, updatedAt: new Date(now - STAGE_QUIET_MS), lastError: "The background run was interrupted (HTTP 508). Press Carry on on the Report tab to resume it." }), { costNaira: 0, currentDepartment: "Law", currentMode: 2, locked: false, now });
expect("a lost chain keeps its own reason", [lostChain.stopped, lostChain.error], [true, "The background run was interrupted (HTTP 508). Press Carry on on the Report tab to resume it."]);
expect("isQuietRun: PENDING and READY are never quiet", [
  isQuietRun({ status: "PENDING", lockedUntil: null, updatedAt: new Date(now - 60 * 60_000) }, now),
  isQuietRun({ status: "READY", lockedUntil: null, updatedAt: new Date(now - 60 * 60_000) }, now),
  isQuietRun({ status: "DRAFTING_OBJECTIVES", lockedUntil: null, updatedAt: new Date(now - 60 * 60_000) }, now),
], [false, false, true]);

const otherMode = buildBriefView(row({ objectivesModeNumber: 3 }), { costNaira: 0, currentDepartment: "Law", currentMode: 5, locked: false, now });
expect("objectives drafted for Mode 3, card on Mode 5: Draft again, approval refused", [otherMode.modeMismatch, otherMode.canRedraft, briefBlockers(otherMode, true)], [
  { drafted: 3, now: 5 },
  true,
  ["The objectives were drafted for Mode 3. Press Draft again to draft them for Mode 5."],
]);
const sameMode = buildBriefView(row({ objectivesModeNumber: 5 }), { costNaira: 0, currentDepartment: "Law", currentMode: 5, locked: false, now });
expect("objectives drafted for the mode on the card: nothing blocks", [sameMode.modeMismatch, briefBlockers(sameMode, true)], [null, []]);
const legacy = buildBriefView(row({ objectivesModeNumber: null }), { costNaira: 0, currentDepartment: "Law", currentMode: 2, locked: false, now });
expect("objectives from before modes were recorded: Draft again", briefBlockers(legacy, true), ["The objectives were drafted before the mode was recorded. Press Draft again to draft them for Mode 2."]);
const lockedOther = buildBriefView(row({ objectivesModeNumber: 3 }), { costNaira: 0, currentDepartment: "Law", currentMode: 5, locked: true, now });
expect("a locked card shows no mode mismatch and offers nothing", [lockedOther.modeMismatch, lockedOther.canRedraft, lockedOther.canStart, lockedOther.canCarryOn], [null, false, false, false]);
expect("no mode on the card yet: no mismatch", objectivesModeMismatch({ status: "READY", objectivesMode: 3 }, null), null);
expect("a brief still running: no mismatch yet", objectivesModeMismatch({ status: "SEARCHING", objectivesMode: 3 }, 5), null);
expect("the mismatch line names both modes", modeMismatchLine({ drafted: 1, now: 2 }), "The objectives were drafted for Mode 1. Press Draft again to draft them for Mode 2.");

// ── The aim and the check on the card ──
const noAim = buildBriefView(row({ aim: null }), { costNaira: 0, currentDepartment: "Law", currentMode: 2, locked: false, now });
expect("objectives without an aim: Draft the aim offered, approval asks for the aim", [noAim.aimMissing, noAim.canDraftAim, noAim.canAddAim, briefBlockers(noAim, true)], [
  true,
  true,
  false,
  ["Write the aim, or press Draft the aim: every report states one aim before its objectives."],
]);
const lockedNoAim = buildBriefView(row({ aim: null, draftedAim: "The aim of this study is to examine x in Nigeria for w." }), { costNaira: 0, currentDepartment: "Law", currentMode: 2, locked: true, now });
expect("a locked card without an aim offers the one-off aim, nothing else", [lockedNoAim.canAddAim, lockedNoAim.canDraftAim, lockedNoAim.canEdit, lockedNoAim.draftedAim], [
  true,
  false,
  false,
  "The aim of this study is to examine x in Nigeria for w.",
]);
expect("a locked card with an aim offers no aim action", buildBriefView(row({}), { costNaira: 0, currentDepartment: "Law", currentMode: 2, locked: true, now }).canAddAim, false);
const badAim = buildBriefView(row({ aim: "To examine x in Nigeria and propose w for the whole country." }), { costNaira: 0, currentDepartment: "Law", currentMode: 2, locked: false, now });
expect("a saved aim that breaks the rules blocks approval", briefBlockers(badAim, true)[0], 'The aim should begin "The aim of this study is to" (or "project" / "research") and a verb.');
const checking = buildBriefView(row({ objectivesCheckLockedUntil: new Date(now + 60_000) }), { costNaira: 0, currentDepartment: "Law", currentMode: 2, locked: false, now });
expect("a check holding its lease: running, no second check", [checking.checkRunning, checking.canCheck], [true, false]);
const withCheck = buildBriefView(row({ objectivesCheck: JSON.parse(JSON.stringify(stored)) }), { costNaira: 0, currentDepartment: "Law", currentMode: 2, locked: true, now });
expect("a stored check shows on a locked card too, and can be run again", [withCheck.objectivesCheck?.overall?.strong, withCheck.canCheck], [64, true]);

console.log(`${passes} checks passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
console.log("The source stage matches the approved D3b rules.");
