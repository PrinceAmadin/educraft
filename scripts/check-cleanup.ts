/**
 * Test project cleanup: the rules in src/lib/project-cleanup.ts. Pure: no
 * database, no network. Who may delete is proved by check:rbac; this proves
 * what can be deleted, what the founder must type, who may flag, and how a
 * deletion is summed up.
 *
 *   npm run check:cleanup
 */
import {
  CLEANUP_TEXT,
  cleanupRefusals,
  cleanupWarnings,
  confirmMatches,
  confirmPhrase,
  mayFlagTestProjects,
  mayUnflag,
  mentionsProject,
  normalizeProjectCode,
  parseFlaggerIdentifier,
  reasonIsValid,
  revenueRemoved,
  summaryLine,
  testSignals,
  type CleanupFacts,
  type DeletionSummary,
} from "../src/lib/project-cleanup";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failures.push(`${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

const base: CleanupFacts = {
  code: "EC-00004",
  title: "Prince project testing",
  status: "CANCELLED",
  isProBono: false,
  clientName: "Prince",
  clientEmail: "help.educraft@gmail.com",
  flagged: false,
  paystackMoney: 0,
  otherMoney: 0,
  paidPayoutAmount: 0,
  paidFlags: { worker: false, ambassador: false, parent: false },
  bonusCounted: false,
  runningWork: [],
  orchestratorBusy: null,
};
const facts = (over: Partial<CleanupFacts>): CleanupFacts => ({ ...base, ...over });

// ── Refusals ────────────────────────────────────────────────────────────────

check("a plain test project can be deleted", cleanupRefusals(base).length === 0, cleanupRefusals(base));
check("an unpaid Paystack checkout (pending) does not block", cleanupRefusals(facts({ paystackMoney: 0 })).length === 0);
// Founder, 1 Oct 2026: where money came from never blocks; only the founder can delete, and that is the safeguard.
check("confirmed Paystack money does not block (test checkouts look the same)", cleanupRefusals(facts({ code: "EC-00007", paystackMoney: 31500 })).length === 0);
check("money recorded by hand does not block either", cleanupRefusals(facts({ otherMoney: 40500 })).length === 0);
check("Paystack and hand-recorded money together still do not block", cleanupRefusals(facts({ paystackMoney: 1575, otherMoney: 40500 })).length === 0);
check("a PAID payout record blocks", cleanupRefusals(facts({ paidPayoutAmount: 9000 })).some((r) => r.includes("already been paid") && r.includes("₦9,000")));
check("a paid worker flag blocks", cleanupRefusals(facts({ paidFlags: { worker: true, ambassador: false, parent: false } })).some((r) => r.includes("the specialist")));
check("a paid ambassador flag blocks", cleanupRefusals(facts({ paidFlags: { worker: false, ambassador: true, parent: false } })).some((r) => r.includes("the ambassador")));
check(
  "pro bono's pre-marked paid flags do not block (no money moved)",
  cleanupRefusals(facts({ isProBono: true, paidFlags: { worker: true, ambassador: true, parent: true } })).length === 0
);
check("a processed quarterly bonus blocks", cleanupRefusals(facts({ bonusCounted: true })).some((r) => r.includes("quarterly")));
const busy = cleanupRefusals(facts({ runningWork: ["a chapter run", "the report run"], orchestratorBusy: "a chapter is being written" }));
check("live work blocks, named once", busy.length === 1 && busy[0].includes("a chapter run") && busy[0].includes("Stop it"), busy);
check(
  "every reason is listed together",
  cleanupRefusals(facts({ paystackMoney: 1575, paidPayoutAmount: 100, bonusCounted: true, runningWork: ["the research run"] })).length === 3
);

// ── Signals and warnings ────────────────────────────────────────────────────

check("QA code is a signal", testSignals({ code: "EC-QA-AIM-1", title: "Hand hygiene", clientName: "QA TEST AIM Client 1", clientEmail: null }).includes("QA code"));
check("'testing' in the title is a signal", testSignals({ code: "EC-00004", title: "Prince project testing", clientName: "Prince", clientEmail: null }).length === 1);
check("'Testing1234' client is a signal", testSignals({ code: "EC-00009", title: "Topic", clientName: "Testing1234", clientEmail: null }).includes("\"test\" in the client's name"));
check("example.com is a signal", testSignals({ code: "EC-00006", title: "Editing", clientName: "Someone", clientEmail: "callback.test@example.com" }).includes("example.com email"));
check("'Attestation' is not a test", testSignals({ code: "EC-00011", title: "Attestation of contests", clientName: "Ada", clientEmail: "ada@gmail.com" }).length === 0);
check("a real-looking project has no signal", testSignals({ code: "EC-00002", title: "Developing a Cybersecurity Framework", clientName: "OYEWOLE EBENEZER", clientEmail: "o@gmail.com" }).length === 0);

const quiet = cleanupWarnings({
  code: "EC-00002",
  status: "IN_PROGRESS",
  flagged: false,
  signals: [],
  otherMoney: 40500,
  paystackMoney: 31500,
  potsGoingNegative: [{ label: "Claude API", from: 0, to: -3163 }],
  hasWorker: true,
  hasLineage: false,
  aiSpendKept: 4228.33,
  tierDrops: [{ name: "Emmanuel", from: "Silver", to: "Bronze" }],
});
check("no flag and no signal says so", quiet[0] === CLEANUP_TEXT.noSignal);
check("hand-recorded money is warned", quiet.some((w) => w.includes("₦40,500")));
check("Paystack money is warned, with where real money would still be", quiet.some((w) => w.includes("₦31,500") && w.includes("Paystack") && w.includes("still in your Paystack balance")));
check("a pot left below zero is warned with both figures", quiet.some((w) => w.includes("Claude API pot") && w.includes("₦0") && w.includes("3,163")));
check("a tier drop is warned", quiet.some((w) => w.includes("Silver to Bronze")));
check("AI spend is kept and says so", quiet.some((w) => w.includes("stays in AI usage")));
check("a flagged project gets no 'nothing marks it' line", !cleanupWarnings({ code: "EC-00004", status: "CANCELLED", flagged: true, signals: [], otherMoney: 0, paystackMoney: 0, potsGoingNegative: [], hasWorker: false, hasLineage: false, aiSpendKept: 0, tierDrops: [] }).includes(CLEANUP_TEXT.noSignal));
check(
  "a project with no money gets no money warning",
  cleanupWarnings({ code: "EC-00004", status: "CANCELLED", flagged: true, signals: [], otherMoney: 0, paystackMoney: 0, potsGoingNegative: [], hasWorker: false, hasLineage: false, aiSpendKept: 0, tierDrops: [] }).length === 0
);

// ── Confirmation ────────────────────────────────────────────────────────────

check("one project: type its code", confirmPhrase(["EC-00004"]) === "EC-00004");
check("several: DELETE N PROJECTS", confirmPhrase(["EC-00001", "EC-00003", "EC-00004"]) === "DELETE 3 PROJECTS");
check("case and spaces forgiven", confirmMatches("  delete   3 projects ", ["a", "b", "c"]));
check("the code, lower case", confirmMatches("ec-00004", ["EC-00004"]));
check("a wrong count fails", !confirmMatches("DELETE 2 PROJECTS", ["a", "b", "c"]));
check("another code fails", !confirmMatches("EC-00001", ["EC-00004"]));
check("nothing selected never confirms", !confirmMatches("DELETE 0 PROJECTS", []));
check("a reason needs 5 characters", !reasonIsValid(" test ") && reasonIsValid("tests"));

// ── Who may flag ────────────────────────────────────────────────────────────

check("the COO flags by role", mayFlagTestProjects("COO", false));
check("the retired OPS_MANAGER is the COO", mayFlagTestProjects("OPS_MANAGER", false));
check("the founder may flag", mayFlagTestProjects("SUPER_ADMIN", false));
check("the CFO only when appointed", !mayFlagTestProjects("CO_CEO_CFO", false) && mayFlagTestProjects("CO_CEO_CFO", true));
check("the HOG only when appointed", !mayFlagTestProjects("HOG", false) && mayFlagTestProjects("HOG", true));
check("a worker only when appointed", !mayFlagTestProjects("WORKER", false) && mayFlagTestProjects("WORKER", true));
check("the flagger may unflag their own", mayUnflag("WORKER", "u1", "u1"));
check("another appointee may not unflag it", !mayUnflag("WORKER", "u2", "u1"));
check("the COO and the founder may unflag anything", mayUnflag("COO", "u2", "u1") && mayUnflag("SUPER_ADMIN", "u2", "u1"));

check("email identifier", JSON.stringify(parseFlaggerIdentifier(" Jubilee@Example.com ")) === JSON.stringify({ kind: "email", email: "jubilee@example.com" }));
check("worker ID, typed loosely", JSON.stringify(parseFlaggerIdentifier("ecw 3")) === JSON.stringify({ kind: "worker", code: "ECW-0003" }));
check("old worker ID format", JSON.stringify(parseFlaggerIdentifier("EC-W-00003")) === JSON.stringify({ kind: "worker", code: "ECW-0003" }));
check("ambassador ID", JSON.stringify(parseFlaggerIdentifier("EC-A-30")) === JSON.stringify({ kind: "ambassador", code: "EC-A-00030" }));
check("a client ID is not an identifier", parseFlaggerIdentifier("ECC-0001") === null);
check("nonsense is refused", parseFlaggerIdentifier("jubilee") === null && parseFlaggerIdentifier("") === null);

check("project code typed loosely", normalizeProjectCode("ec 7") === "EC-00007" && normalizeProjectCode("EC-00010") === "EC-00010");
check("QA project code kept", normalizeProjectCode("ec-qa-aim-1") === "EC-QA-AIM-1");
check("not a project code", normalizeProjectCode("ECC-0001") === null && normalizeProjectCode("hello") === null);

// ── Notifications that name a project ───────────────────────────────────────

check("names the project", mentionsProject("Downpayment verified for EC-00001.", "EC-00001"));
check("in a link", mentionsProject("/admin/projects/EC-00001?tab=report", "EC-00001"));
check("not a longer code", !mentionsProject("EC-000012 needs a worker", "EC-00001"));
check("not a QA code that extends it", !mentionsProject("EC-QA-D9-AB stalled", "EC-QA-D9-A"));
check("not a code that merely ends with it", !mentionsProject("XEC-00001", "EC-00001"));
check("empty text", !mentionsProject(null, "EC-00001"));

// ── Summaries ───────────────────────────────────────────────────────────────

const summary: DeletionSummary = {
  payments: [
    { paymentId: "EC-PAY-00007", type: "CLIENT_DOWNPAYMENT", source: "MANUAL", status: "Confirmed", amount: 36000, direction: "INFLOW", reference: "TRF-1" },
    { paymentId: "EC-PAY-00008", type: "CLIENT_BALANCE", source: "PAYSTACK", status: "Pending", amount: 44000, direction: "INFLOW" },
    { paymentId: "EC-PAY-00009", type: "REFUND", source: "SYSTEM", status: "Confirmed", amount: 6000, direction: "OUTFLOW" },
  ],
  buckets: { operationsReserve: 5400, growthFund: 2520, reinvestmentFund: 2520, founderDistribution: 3960, retained: 14400 },
  payouts: [{ leg: "AMBASSADOR", recipientName: "Ada", amount: 3600, status: "PENDING" }],
  expenses: [{ category: "Ambassador commission", amount: 3600 }],
  referral: { ambassadorName: "Ada", status: "CONVERTED", action: "deleted" },
  ambassadors: [],
  files: 2,
  notifications: 4,
  aiSpendKept: 12.5,
};
check("revenue removed = confirmed inflows less refunds (pending ignored)", revenueRemoved(summary) === 30000, revenueRemoved(summary));
check(
  "confirmed Paystack money counts as revenue removed",
  revenueRemoved({ payments: [{ paymentId: "EC-PAY-00004", type: "CLIENT_DOWNPAYMENT", source: "PAYSTACK", status: "Confirmed", amount: 31500, direction: "INFLOW", reference: "INTAKE-x" }] }) === 31500
);
check("summary line names the money", summaryLine(summary).startsWith("Removed ₦30,000 revenue, ₦14,400 from the buckets"), summaryLine(summary));
check(
  "an empty project says so",
  summaryLine({ ...summary, payments: [], buckets: { operationsReserve: 0, growthFund: 0, reinvestmentFund: 0, founderDistribution: 0, retained: 0 }, payouts: [], referral: null, files: 0 }) ===
    "No money was recorded on it."
);

if (failures.length) {
  console.log(`${failures.length} check(s) failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`Cleanup rules: ${passed} checks passed.`);
