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
import { validateObjectives } from "../src/lib/generation/objectives-rules";
import { extractClientStatedObjectives, objectivesUserPrompt } from "../src/lib/generation/objectives-drafter";
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
import { modeChangeAction } from "../src/lib/research/source-stage-actions";
import { briefBlockers, buildBriefView, type BriefCardRow } from "../src/lib/research/source-stage-view";

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
const none = buildBriefView(null, { costNaira: 0, currentDepartment: "Law", locked: false, now });
expect("no brief yet: Law can start a case search", [none.status, none.kindLabel, none.canStart, none.placeholder], ["NONE", "Cases", true, "[CASE TO BE SUPPLIED]"]);
expect("no brief yet blocks approval", briefBlockers(none, true), ["Draft the objectives first: press Draft objectives below."]);
const ready = buildBriefView(row({}), { costNaira: 420.5, currentDepartment: "Law", locked: false, now });
expect("ready: sources under their points, the PDF known, the domain shown", [ready.points[0].sources.map((s) => [s.id, s.hasPdf, s.sourceDomain]), ready.points[1].sources.length], [
  [
    ["s1", true, "guardian.ng"],
    ["s2", false, "lawcarenigeria.com"],
  ],
  0,
]);
expect("ready: editable, can redraft, nothing blocks", [ready.canEdit, ready.canRedraft, briefBlockers(ready, true)], [true, true, []]);
const running = buildBriefView(row({ status: "SEARCHING", cursor: 2, lockedUntil: new Date(now + 60_000) }), { costNaira: 0, currentDepartment: "Law", locked: false, now });
expect("running: progress by point, approval waits", [running.running, running.progress, briefBlockers(running, true)], [true, "Finding cases: point 2 of 2", ["The objectives and sources are still being prepared."]]);
const stopped = buildBriefView(row({ status: "SEARCHING", failedSteps: 4, lastError: "overloaded" }), { costNaira: 0, currentDepartment: "Law", locked: false, now });
expect("stopped after 4 failures: Carry on", [stopped.stopped, stopped.canCarryOn, stopped.error], [true, true, "overloaded"]);
const moved = buildBriefView(row({}), { costNaira: 0, currentDepartment: "History", locked: false, now });
expect("department now History: start again for archives", [moved.kindMismatch, moved.canStart, briefBlockers(moved, true)], [
  { now: "ARCHIVE" },
  true,
  ["The department now calls for archival sources: press Start again to search for them."],
]);
const emptySearch = buildBriefView(row({ points: [], sources: [] }), { costNaira: 0, currentDepartment: "Law", locked: false, now });
expect("a finished search with no points: Search again is offered", [emptySearch.noPoints, emptySearch.canStart], [true, true]);
const lockedView = buildBriefView(row({}), { costNaira: 0, currentDepartment: "Law", locked: true, now });
expect("locked: nothing editable", [lockedView.canEdit, lockedView.canRedraft, lockedView.canStart], [false, false, false]);
const badObjectives = buildBriefView(row({ objectives: ["To x"] }), { costNaira: 0, currentDepartment: "Law", locked: false, now });
expect("bad saved objectives block approval", briefBlockers(badObjectives, true)[0], "Give 4 to 5 objectives (there is 1).");
const hansard = buildBriefView(row({ sourceKind: "ARCHIVE", department: "History", sources: [{ ...row({}).sources[0], id: "h1", kind: "ARCHIVE", origin: "HANSARD" }] }), { costNaira: 0, currentDepartment: "History", locked: false, now });
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

// ── Mode change reset (mighty-wondering-hippo, 2026-09-29) ──
// Objectives are keyed to the approved mode; if the COO changes the mode after
// drafting, the brief resets so stepDraft rewrites them for the new mode. When
// no objectives have been drafted yet, the brief just moves to DRAFTING.
expect("no objectives yet, brief still PENDING: mode 5 chosen → drafting", modeChangeAction(null, 5, "PENDING"), "drafting");
expect("no objectives yet, brief already DRAFTING: mode 5 chosen → drafting", modeChangeAction(null, 5, "DRAFTING_OBJECTIVES"), "drafting");
expect("objectives already drafted for Mode 3, brief READY: mode 5 → redraft", modeChangeAction(3, 5, "READY"), "redraft");
expect("objectives already drafted for Mode 3, brief PLANNING: mode 5 → redraft", modeChangeAction(3, 5, "PLANNING_POINTS"), "redraft");
expect("objectives already drafted for Mode 3, brief SEARCHING: mode 5 → redraft", modeChangeAction(3, 5, "SEARCHING"), "redraft");
expect("objectives already drafted for Mode 5, mode 5 chosen: no-op", modeChangeAction(5, 5, "READY"), "no-op");
expect("no objectives, brief READY (a search finished without any): mode 5 → redraft", modeChangeAction(null, 5, "READY"), "redraft");

console.log(`${passes} checks passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
console.log("The source stage matches the approved D3b rules.");
