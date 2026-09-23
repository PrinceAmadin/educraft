/**
 * Checks the client download rules against the founder's table, with no
 * database: which documents each kind of order gets, and when each one opens.
 *
 *   npm run check:client-access
 *
 * Fails (exit 1) on any mismatch. Run it after touching src/lib/deliverables.ts
 * or src/lib/files/policy.ts.
 */
import { deliverableTemplate } from "../src/lib/deliverables";
import { deliverableGate, magicMatches, type AccessName, type GateProject } from "../src/lib/files/policy";
import { parsePrivatePath, buildPrivatePath } from "../src/lib/files/paths";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}

const state = (released: boolean, access: AccessName, p: GateProject) => {
  const g = deliverableGate(released, access, p);
  return g.state === "locked" ? `locked:${g.reason}` : g.state;
};

const NEW: GateProject = { status: "NEW", downpaymentStatus: "Unpaid", balanceStatus: "Unpaid" };
const DOWN: GateProject = { status: "IN_PROGRESS", downpaymentStatus: "Verified", balanceStatus: "Unpaid" };
const PAID: GateProject = { status: "IN_PROGRESS", downpaymentStatus: "Verified", balanceStatus: "Verified" };
const PRO_BONO: GateProject = { status: "DOWNPAYMENT_VERIFIED", downpaymentStatus: "Verified", balanceStatus: "Verified" };
const CANCELLED: GateProject = { status: "CANCELLED", downpaymentStatus: "Verified", balanceStatus: "Verified" };
const REFUNDED: GateProject = { status: "REFUNDED", downpaymentStatus: "Verified", balanceStatus: "Verified" };

// ── Which documents each order gets ──
const keys = (code: string, chapterCount: number | null = null, chapters: number[] = []) =>
  deliverableTemplate({ serviceCode: code, serviceName: "Service", chapterCount, chapters }).map((d) => `${d.key}:${d.access}`);

expect("FYP-FULL, default 5 chapters", keys("FYP-FULL"), [
  "ch1:DOWNPAYMENT",
  "ch2:DOWNPAYMENT",
  "ch3:BALANCE",
  "ch4:BALANCE",
  "ch5:BALANCE",
  "final:BALANCE",
]);
expect("THESIS with 6 chapters", keys("THESIS", 6).length, 7);
expect("COMBO-PR has a proposal that opens with the downpayment", keys("COMBO-PR")[0], "proposal:DOWNPAYMENT");
expect("COMBO-PRDS ends with slides after the balance", keys("COMBO-PRDS").slice(-1), ["slides:BALANCE"]);
expect("COMBO-RS has no proposal", keys("COMBO-RS").some((k) => k.startsWith("proposal")), false);
expect("FYP-CHAPTERS 1,2: all on the balance, plus the complete document", keys("FYP-CHAPTERS", 2, [1, 2]), [
  "ch1:BALANCE",
  "ch2:BALANCE",
  "final:BALANCE",
]);
expect("FYP-CHAPTERS single chapter is the whole order", keys("FYP-CHAPTERS", 1, [3]), ["final:BALANCE"]);
expect("FYP-CH4", keys("FYP-CH4"), ["final:BALANCE"]);
expect("FYP-PROP", keys("FYP-PROP"), ["final:BALANCE"]);
expect("IT-PPT", keys("IT-PPT"), ["final:BALANCE", "slides:BALANCE"]);
expect("CV (everything else)", keys("CV"), ["final:BALANCE"]);

// ── When a released document opens ──
expect("unreleased is hidden", state(false, "DOWNPAYMENT", PAID), "hidden");
expect("chapter 1 before any payment", state(true, "DOWNPAYMENT", NEW), "locked:downpayment");
expect("chapter 1 after the downpayment", state(true, "DOWNPAYMENT", DOWN), "open");
expect("chapter 3 after only the downpayment", state(true, "BALANCE", DOWN), "locked:balance");
expect("chapter 3 once the balance is paid (early)", state(true, "BALANCE", PAID), "open");
expect("pro bono opens everything", state(true, "BALANCE", PRO_BONO), "open");
expect("withheld stays locked even when paid", state(true, "WITHHELD", PAID), "locked:withheld");
expect("released early by a super admin", state(true, "ALWAYS", NEW), "open");
expect("cancelled locks paid documents", state(true, "BALANCE", CANCELLED), "locked:closed");
expect("cancelled keeps an early release open", state(true, "ALWAYS", CANCELLED), "open");
expect("refunded locks even an early release", state(true, "ALWAYS", REFUNDED), "locked:closed");

// ── Upload paths and file checks ──
const path = buildPrivatePath({
  projectDbId: "cmabc123def456ghi789",
  purpose: "deliverable",
  targetId: "cmxyz987",
  random: "a".repeat(24),
  ext: "docx",
});
expect("a built path parses back", parsePrivatePath(path)?.targetId, "cmxyz987");
expect("a path with ../ is refused", parsePrivatePath("projects/../x/deliverable/abc/" + "a".repeat(24) + ".pdf"), null);
expect("an unknown purpose is refused", parsePrivatePath(path.replace("deliverable", "public")), null);
expect("a real PDF passes", magicMatches("a.pdf", new TextEncoder().encode("%PDF-1.7 ....")), true);
expect("HTML renamed to .pdf fails", magicMatches("a.pdf", new TextEncoder().encode("<html><script>")), false);
expect("a .docx is a zip", magicMatches("a.docx", Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0])), true);

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("Client access rules match the table.");
