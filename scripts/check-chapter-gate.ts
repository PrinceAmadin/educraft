/**
 * The chapter gate (30 Sept 2026): every chapter passes the formatting system and the quality gate as a
 * chapter, before anyone downloads or approves it. Proves, without a database, Word or Claude:
 *
 *  - each fixture chapter checked on its own Word file passes, with the whole-report checks not applying;
 *  - the chapter's own Word file has a real default paragraph style (double spaced in WPS too);
 *  - the blanks the generator is told to leave warn in AI text and fail in an upload; ST11 likewise;
 *  - one "does not support" in a handful of citations never fails a chapter;
 *  - a chapter that cites nothing has no References page to fail R1;
 *  - a comma-separated author list (EC-00002) finds its reference;
 *  - which failures a rewrite can fix, and the one rule for a chapter's AI text (check, wait, rewrite, hand over);
 *  - approval refusals from the upload's check (the founder's override).
 *
 * `npm run check:chapter-gate`.
 */
import type { AssemblyInput } from "../src/lib/assembly/assemble";
import { defaultParagraphStyle } from "../src/lib/assembly/finalize-docx";
import { approvalRefusals, CHAPTER_REVIEW_TEXT } from "../src/lib/chapter-review";
import {
  chapterGateResult,
  chapterGateStep,
  checkView,
  failureLines,
  gateFactFrom,
  isRewritable,
  MAX_CHECK_ERRORS,
  MAX_GATE_REWRITES,
  rewriteBar,
  rewritePolicy,
  rewritesAllowed,
  type ChapterGateFact,
} from "../src/lib/quality/chapter-gate";
import { referenceCheck, supportPairs, type GateReference, type SupportResult } from "../src/lib/quality/citation-check";
import { finishReport, prepareReport, type AiResults } from "../src/lib/quality/evaluate";
import { knownCommonCitation } from "../src/lib/quality/known-citations";
import type { CheckResult } from "../src/lib/quality/types";
import { FIXTURE_OBJECTIVES, FIXTURE_REFERENCES, FIXTURE_TITLE, fixtureChapters, type FixtureChapter } from "./fixtures/quality-fixture";

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const eq = (label: string, got: unknown, want: unknown) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const NO_AI: AiResults = { voice: [], voiceNotes: [], support: { results: [], checked: 0, total: 0 }, traceability: null, errors: [] };

function inputFor(chapter: { number: number; text: string }, references: GateReference[] = FIXTURE_REFERENCES): AssemblyInput {
  return {
    projectCode: "EC-QA-CG",
    title: FIXTURE_TITLE,
    student: { name: "Ada Obi", matric: "190404001" },
    university: "University of Lagos",
    faculty: "Management Sciences",
    department: "Business Administration",
    supervisor: "Dr. K. Bello",
    hod: "Prof. T. Adeyemi",
    submission: new Date("2026-10-15T12:00:00Z"),
    dedication: { type: "God", details: null },
    acknowledgementNote: null,
    mode: 2,
    section: "BUSINESS",
    referencingStyle: "APA_7TH",
    citationPlacement: "NOT_APPLICABLE",
    thematicTitles: { chapter3: null, chapter4: null },
    chapters: [chapter],
    references: references.map((r) => ({ doi: null, ...r })),
    includePrelims: false,
  };
}

const ALL = fixtureChapters();
const CH1 = ALL[0].text;

async function runChapter(
  c: FixtureChapter,
  subject: "AI_TEXT" | "UPLOAD",
  opts: { references?: GateReference[]; ai?: Partial<AiResults>; plan?: FixtureChapter["plan"] | null; earlier?: string[] } = {},
) {
  const references = opts.references ?? FIXTURE_REFERENCES;
  const prepared = await prepareReport({ input: inputFor(c, references), references, knownCommon: knownCommonCitation, chapter: { number: c.number, sourceHash: "fixture" } });
  const { checks, score } = finishReport(
    prepared,
    { ...NO_AI, ...opts.ai },
    {
      objectives: FIXTURE_OBJECTIVES,
      pureScience: false,
      supervisorToc: false,
      plans: new Map([[c.number, opts.plan === undefined ? c.plan : opts.plan]]),
      scope: { chapter: c.number, subject, chapterOneText: c.number === 1 ? null : CH1, earlierCitedIds: opts.earlier ?? [] },
    },
  );
  return { prepared, checks, score, result: chapterGateResult(checks, score) };
}

const byId = (checks: CheckResult[], id: string) => checks.find((c) => c.id === id)!;
const statusOf = (checks: CheckResult[], id: string) => byId(checks, id)?.status;
const failedIds = (checks: CheckResult[]) => checks.filter((c) => c.status === "FAIL").map((c) => c.id);

/** Every reference the earlier chapters cite (what the service passes Chapter Five). */
async function earlierIds(): Promise<string[]> {
  const ids = new Set<string>();
  for (const c of ALL.slice(0, 4)) {
    const { prepared } = await runChapter(c, "AI_TEXT");
    for (const m of prepared.match.matched) for (const r of m.refs) ids.add(r.id);
  }
  return [...ids];
}

(async () => {
  // ── 1. Each fixture chapter on its own ──
  const earlier = await earlierIds();
  const REPORT_WIDE = ["PN1", "T8", "FG6", "TOC1", "TOC2", "TOC3", "TOC4", "TOC5", "LF1", "LF2", "LF3", "LT1", "LT2", "LT3", "LA1", "LA2", "LA3", "ST1", "ST9", "ST12"];
  for (const c of ALL) {
    const { checks, result, prepared } = await runChapter(c, "AI_TEXT", { earlier: c.number === 5 ? earlier : [] });
    check(`chapter ${c.number}: passes on its own`, result.passed, failedIds(checks).join(",") + " " + JSON.stringify(result.failures.slice(0, 3).map((f) => f.message)));
    const na = checks.filter((k) => k.status === "NA").map((k) => k.id);
    check(`chapter ${c.number}: the whole-report checks do not apply`, REPORT_WIDE.every((id) => na.includes(id)), REPORT_WIDE.filter((id) => !na.includes(id)).join(","));
    const others = [1, 2, 3, 4, 5].filter((n) => n !== c.number).map((n) => `ST${n + 2}`);
    check(`chapter ${c.number}: only its own required-sections check applies`, others.every((id) => na.includes(id)) && !na.includes(`ST${c.number + 2}`));
    check(`chapter ${c.number}: counted over the checks that apply (under 89)`, result.applicable < 89 && result.applicable === checks.filter((k) => k.status !== "NA").length && result.passedCount === result.applicable, `${result.passedCount}/${result.applicable}`);
    const normal = defaultParagraphStyle(prepared.parts.styles) ?? "";
    check(`chapter ${c.number}: its Word file has a double-spaced default paragraph style (S1 passes)`, /w:line="480"/.test(normal) && statusOf(checks, "S1") === "PASS");
    check(`chapter ${c.number}: ST10 applies only to Chapter Four (with Chapter One's questions)`, (statusOf(checks, "ST10") === "NA") === (c.number !== 4));
  }

  // ── 2. The blanks the generator leaves on purpose; ST11 for a person's upload ──
  const three = ALL[2];
  const blanked = { ...three, text: three.text.replace(/(\[H2\] 3\.\d[^\n]*\n)/, "$1A total of [N_DISTRIBUTED] copies were sent and [N_RETURNED] came back.\n") };
  check("blanks: the fixture edit applied", blanked.text !== three.text);
  const aiBlank = await runChapter(blanked, "AI_TEXT");
  check("blanks: AI text carrying them passes, with ST16 as a warning", aiBlank.result.passed && statusOf(aiBlank.checks, "ST16") === "WARN", failedIds(aiBlank.checks).join(","));
  check("blanks: the specialist is told to fill them", aiBlank.result.warnings.some((w) => w.id === "ST16" && /before you upload/.test(w.fix ?? "")));
  const upBlank = await runChapter(blanked, "UPLOAD");
  check("blanks: an upload still carrying them fails ST16", !upBlank.result.passed && failedIds(upBlank.checks).includes("ST16"), failedIds(upBlank.checks).join(","));
  const double = { ...three.plan, targetWords: three.plan.targetWords * 2 };
  const aiShort = await runChapter(three, "AI_TEXT", { plan: double });
  check("ST11: AI text half its planned length fails", failedIds(aiShort.checks).includes("ST11"));
  const upShort = await runChapter(three, "UPLOAD", { plan: double });
  check("ST11: a person's upload is told, not failed", statusOf(upShort.checks, "ST11") === "WARN" && upShort.result.passed, failedIds(upShort.checks).join(","));

  // ── 3. The citation-support rule on a few citations ──
  const two = await runChapter(ALL[1], "AI_TEXT");
  const { pairs } = supportPairs(two.prepared.match, 2);
  check("support: the fixture's Chapter Two has citations to judge", pairs.length >= 5, String(pairs.length));
  const five = pairs.slice(0, 5);
  const verdicts = (against: number): SupportResult[] => five.map((p, i) => ({ ...p, verdict: i < against ? "DOES_NOT_SUPPORT" : "SUPPORTS", reason: "fixture" }));
  const oneOfFive = referenceCheck(two.prepared.match, { results: verdicts(1), checked: 5, total: 5 }, { minAgainst: 2 });
  check("support: one 'does not support' in five warns, it never fails a chapter", oneOfFive.status !== "FAIL", oneOfFive.status);
  const twoOfFive = referenceCheck(two.prepared.match, { results: verdicts(2), checked: 5, total: 5 }, { minAgainst: 2 });
  check("support: two in five fail the chapter", twoOfFive.status === "FAIL");
  const reportRule = referenceCheck(two.prepared.match, { results: verdicts(1), checked: 5, total: 5 });
  check("support: the report gate keeps its own rule (one in five is over 15%)", reportRule.status === "FAIL");

  // ── 4. A chapter that cites nothing has no References page ──
  const bare = { number: 3, text: "[H1] CHAPTER THREE\n[H1] RESEARCH METHODOLOGY\n[H2] 3.1 Research Design\nThe study used a survey design across four markets in Lagos State, with traders as the respondents and a structured questionnaire as the instrument.\n", plan: null as unknown as FixtureChapter["plan"] };
  const bareRun = await runChapter(bare, "AI_TEXT", { plan: null });
  check("R1: a chapter citing nothing has no References page and R1 does not apply", statusOf(bareRun.checks, "R1") === "NA" && !/REFERENCES/.test(bareRun.prepared.parts.document), statusOf(bareRun.checks, "R1"));

  // ── 5. EC-00002: a comma-separated author list finds its reference ──
  const ec2Ref: GateReference = {
    id: "ref-ec2",
    title: "Cybersecurity in small and medium enterprises: a systematic review",
    proposedTitle: "Cybersecurity in small and medium enterprises: a systematic review",
    authors: "Chidukwani, A.; Zander, S.; Koutsakis, P.",
    year: 2022,
    journal: "IEEE Access",
    abstract: "A systematic review of cybersecurity practices among small and medium enterprises and the gaps between them.",
    classification: "CORE",
  } as GateReference;
  const withList = { ...ALL[1], text: ALL[1].text.replace(/(\[H2\] 2\.\d[^\n]*\n)/, "$1Chidukwani, Zander, and Koutsakis (2022) found that small businesses rarely adopt formal frameworks.\n") };
  const listRun = await runChapter(withList, "AI_TEXT", { references: [...FIXTURE_REFERENCES, ec2Ref] });
  check("EC-00002: 'Chidukwani, Zander, and Koutsakis (2022)' is matched to its reference", listRun.prepared.match.unmatched.length === 0 && listRun.prepared.match.cited.some((r) => r.id === "ref-ec2"), JSON.stringify(listRun.prepared.match.unmatched.map((u) => u.raw)));

  // EC-00002: a title holding another work's journal name ("Information security…" beside the journal Information).
  const journalRefs: GateReference[] = [
    { id: "ref-j1", title: "Digital trust among small firms in West Africa", proposedTitle: "Digital trust among small firms in West Africa", authors: "Okonjo, P.; Ade, B.", year: 2021, journal: "Information", abstract: "Trust in digital tools among small firms.", classification: "CORE" },
    { id: "ref-j2", title: "Information security practices in small businesses", proposedTitle: "Information security practices in small businesses", authors: "Bassey, R.", year: 2020, journal: "Computers & Security", abstract: "Security practices of small businesses.", classification: "CORE" },
    { id: "ref-j3", title: "Cybersecurity awareness and SME growth", proposedTitle: "Cybersecurity awareness and SME growth", authors: "Musa, K.", year: 2019, journal: "Journal of Small Business Management", abstract: "Awareness and growth.", classification: "CORE" },
    { id: "ref-j4", title: "Threat reporting in a small open economy", proposedTitle: "Threat reporting in a small open economy", authors: "Eze, C.", year: 2022, journal: "Cybersecurity", abstract: "Threat reporting.", classification: "CORE" },
    // A conference paper (no journal) whose title holds the journal name Cybersecurity.
    { id: "ref-j5", title: "Cybersecurity risk management in small enterprises", proposedTitle: "Cybersecurity risk management in small enterprises", authors: "Alahmari, A.", year: 2020, journal: null, abstract: "Risk management.", classification: "CORE" },
  ] as GateReference[];
  const journalChapter = { ...ALL[1], text: ALL[1].text.replace(/(\[H2\] 2\.\d[^\n]*\n)/, "$1Small firms trust digital tools unevenly (Okonjo & Ade, 2021; Bassey, 2020), and awareness tracks growth (Musa, 2019; Eze, 2022; Alahmari, 2020).\n") };
  const journalRun = await runChapter(journalChapter, "AI_TEXT", { references: [...FIXTURE_REFERENCES, ...journalRefs] });
  check("R4: an entry is judged by its own journal, not a journal name inside its title", statusOf(journalRun.checks, "R4") === "PASS", JSON.stringify(byId(journalRun.checks, "R4").issues.map((i) => i.message)));

  // ── 6. What a rewrite can fix ──
  check("rewritable: voice, reference and structural failures", isRewritable({ id: "VOICE", layer: "voice" }) && isRewritable({ id: "REF", layer: "reference" }) && isRewritable({ id: "ST13", layer: "structural" }));
  check("rewritable: text-driven formatting (a fourth heading level, a table with no caption)", isRewritable({ id: "H4", layer: "formatting" }) && isRewritable({ id: "T5", layer: "formatting" }));
  check("rewritable: never our Word builder's rules (spacing, fonts, margins)", !isRewritable({ id: "S1", layer: "formatting" }) && !isRewritable({ id: "F1", layer: "formatting" }) && !isRewritable({ id: "MG1", layer: "formatting" }));
  const builderFail = chapterGateResult(
    [{ id: "S1", layer: "formatting", title: "", severity: "CRITICAL", status: "FAIL", summary: "", issues: [{ level: "FAIL", message: "x" }] }] as CheckResult[],
    { failures: [{ id: "S1", layer: "formatting", severity: "CRITICAL", status: "FAIL", chapter: null, message: "x", locations: [], fix: null }], warnings: [] } as never,
  );
  check("rewritable: a builder failure marks the check not rewritable and names the rule", !builderFail.rewritable && builderFail.builderFailures.includes("S1"));
  const lines = failureLines([{ id: "REF", layer: "reference", severity: "MAJOR", status: "FAIL", chapter: 2, message: "X (2020) is cited but is not among the verified references.", locations: [{ chapter: 2, paragraph: 3, quote: "X (2020) found" }], fix: "Cite only works on the list." }]);
  eq("rewrite brief lines: the report gate's format", lines, ['[REF] X (2020) is cited but is not among the verified references. Example: "X (2020) found" Fix: Cite only works on the list.']);

  // ── 7. The one rule for a chapter's AI text ──
  const now = new Date("2026-09-30T12:00:00Z");
  const later = new Date(now.getTime() + 60_000);
  const earlierTime = new Date(now.getTime() - 60_000);
  const base: ChapterGateFact = { chapter: 2, outputHash: "h", rewritesUsed: 0, check: null, barred: null };
  const step = (f: Partial<ChapterGateFact>, c: ChapterGateFact["check"], policy: "now" | "later" | "never" = "now", maxRewrites = MAX_GATE_REWRITES) =>
    chapterGateStep({ ...base, ...f, check: c }, { now, maxRewrites, policy }).kind + ("outcome" in chapterGateStep({ ...base, ...f, check: c }, { now, maxRewrites, policy }) ? `:${(chapterGateStep({ ...base, ...f, check: c }, { now, maxRewrites, policy }) as { outcome: string }).outcome}` : "");
  const c = (status: "RUNNING" | "PASSED" | "FAILED" | "ERROR", over: Partial<NonNullable<ChapterGateFact["check"]>> = {}) => ({ status, lockedUntil: null, attempts: 0, rewritable: true, lines: ["[X] y"], ...over });
  eq("step: no check yet -> check", step({}, null), "check");
  eq("step: no hash yet (written before the gate) -> check", step({ outputHash: null }, c("PASSED")), "check");
  eq("step: running with a live lease -> wait", step({}, c("RUNNING", { lockedUntil: later })), "wait");
  eq("step: running with a lapsed lease -> check", step({}, c("RUNNING", { lockedUntil: earlierTime })), "check");
  eq("step: failed to run, tries left -> check", step({}, c("ERROR", { attempts: MAX_CHECK_ERRORS - 1 })), "check");
  eq("step: failed to run three times -> hand over unchecked", step({}, c("ERROR", { attempts: MAX_CHECK_ERRORS })), "handover:unchecked");
  eq("step: passed -> hand over", step({}, c("PASSED")), "handover:passed");
  eq("step: failed, live run -> rewrite", step({}, c("FAILED")), "rewrite");
  eq("step: failed, held project -> wait for it to come back", step({}, c("FAILED"), "later"), "wait");
  eq("step: failed, no run or a stopped one -> hand over", step({}, c("FAILED"), "never"), "handover:failed");
  eq("step: failed after two rewrites -> hand over", step({ rewritesUsed: 2 }, c("FAILED")), "handover:failed");
  eq("step: failed, rewrites switched off -> hand over", step({}, c("FAILED"), "now", 0), "handover:failed");
  eq("step: failed, barred -> hand over", step({ barred: "x" }, c("FAILED")), "handover:failed");
  eq("step: failed, not rewritable -> hand over", step({}, c("FAILED", { rewritable: false })), "handover:failed");
  check("bar: a data request after the chapter bars its rewrite", rewriteBar({ chapter: 3, mode: 2, pauses: [{ afterChapter: 3, status: "OPEN" }], hasDataset: false }) !== null);
  check("bar: a cancelled request does not", rewriteBar({ chapter: 3, mode: 2, pauses: [{ afterChapter: 3, status: "CANCELLED" }], hasDataset: false }) === null);
  check("bar: Mode 5 Chapter Three once its dataset is stored", rewriteBar({ chapter: 3, mode: 5, pauses: [], hasDataset: true }) !== null && rewriteBar({ chapter: 3, mode: 5, pauses: [], hasDataset: false }) === null);
  eq("setting: rewrites allowed", [rewritesAllowed(null), rewritesAllowed(""), rewritesAllowed("0"), rewritesAllowed("1"), rewritesAllowed("5"), rewritesAllowed("x")], [2, 2, 0, 1, 2, 2]);
  eq("policy: live, held, stopped, finished, none", [
    rewritePolicy({ status: "GENERATING" }, "IN_PROGRESS"),
    rewritePolicy({ status: "NEEDS_ATTENTION" }, "REVISION_NEEDED"),
    rewritePolicy({ status: "HELD" }, "ON_HOLD"),
    rewritePolicy({ status: "STOPPED" }, "IN_PROGRESS"),
    rewritePolicy({ status: "COMPLETE" }, "IN_PROGRESS"),
    rewritePolicy(null, "IN_PROGRESS"),
    rewritePolicy({ status: "GENERATING" }, "SUBMITTED"),
  ], ["now", "now", "later", "never", "never", "never", "never"]);
  const fact = gateFactFrom({ chapter: 3, outputHash: "h", gateRewriteNo: 1, check: { status: "FAILED", lockedUntil: null, attempts: 0, rewritable: true, failures: [{ id: "ST14", layer: "structural", severity: "MAJOR", status: "FAIL", chapter: 3, message: "Table 3.2 is never referred to in the text.", locations: [], fix: "Introduce it." }] }, mode: 2, pauses: [], hasDataset: false });
  check("facts: the rewrite brief lines are read from the stored failures", fact.check?.lines[0] === "[ST14] Table 3.2 is never referred to in the text. Fix: Introduce it." && fact.rewritesUsed === 1 && fact.barred === null, JSON.stringify(fact));
  const view = checkView({ status: "FAILED", passedCount: 40, applicable: 42, failures: fact.check ? [{ id: "ST14", message: "m", fix: null, locations: [{ quote: "q" }] }] : [], warnings: [], error: null, settledAt: now, costNaira: 48.5 }, false);
  check("card: the specialist never sees what a check cost", !("costNaira" in view));

  // ── 8. Approval from the upload's check ──
  const upload = { status: "SUBMITTED" as const, submittedByRole: "WORKER", fileName: "ch2.docx" };
  const clean = { blocking: [], placeholders: [], hash: "r" };
  const refuse = (check: Parameters<typeof approvalRefusals>[0]["check"], override = false) => approvalRefusals({ version: upload, projectStatus: "IN_PROGRESS", readback: clean, check, override });
  const t = CHAPTER_REVIEW_TEXT.check.refuse;
  eq("approve: not checked yet is refused", refuse(null), [t.notChecked]);
  eq("approve: a running check is refused", refuse({ status: "RUNNING", lines: [] }), [t.running]);
  eq("approve: a check that did not run is refused", refuse({ status: "ERROR", lines: [] }), [t.error]);
  check("approve: a failed check is refused with its points", refuse({ status: "FAILED", lines: ["[REF] a", "[ST14] b"] })[0]?.includes("[REF] a") === true);
  eq("approve: the founder's override lets a failed check through", refuse({ status: "FAILED", lines: ["[REF] a"] }, true), []);
  eq("approve: a passed check approves", refuse({ status: "PASSED", lines: [] }), []);
  eq("approve: where the gate does not apply nothing changes", approvalRefusals({ version: upload, projectStatus: "IN_PROGRESS", readback: clean }), []);
  check("approve: a file the reader could not carry is refused for that, not for a missing check", approvalRefusals({ version: upload, projectStatus: "IN_PROGRESS", readback: { ...clean, blocking: ["An EMF picture."] }, check: null }).every((r) => r !== t.notChecked));

  if (failures.length) {
    console.error(`check:chapter-gate — ${failures.length} failed, ${passed} passed:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`check:chapter-gate — all ${passed} checks passed`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
