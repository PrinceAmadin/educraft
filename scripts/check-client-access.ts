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
import { deliverableGate, isFullyPaid, LOCK_TEXT, magicMatches, type AccessName, type GateProject } from "../src/lib/files/policy";
import { notReadyHint, releaseAnnouncement } from "../src/lib/client-document-text";
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

// Founder, 30 Sept 2026: Chapters 1 and 2 after approval and the downpayment; Chapter 3 onwards only
// inside the complete project; the complete project at 100% payment.
expect("FYP-FULL, default 5 chapters", keys("FYP-FULL"), [
  "ch1:DOWNPAYMENT",
  "ch2:DOWNPAYMENT",
  "ch3:WITH_COMPLETE",
  "ch4:WITH_COMPLETE",
  "ch5:WITH_COMPLETE",
  "final:BALANCE",
]);
expect("THESIS chapters 3+ only in the complete project", keys("THESIS").filter((k) => k.endsWith(":WITH_COMPLETE")), ["ch3:WITH_COMPLETE", "ch4:WITH_COMPLETE", "ch5:WITH_COMPLETE"]);
expect("combos too: COMBO-RS-DA chapter 4", keys("COMBO-RS-DA").find((k) => k.startsWith("ch4")), "ch4:WITH_COMPLETE");
// Five chapters at most in every report (founder, 26 Sept 2026): an order for 6 gets 5 chapters + the complete document.
expect("THESIS asked for 6 chapters is capped at 5", keys("THESIS", 6).length, 6);
expect("COMBO-PR has a proposal that opens with the downpayment", keys("COMBO-PR")[0], "proposal:DOWNPAYMENT");
expect("COMBO-PRDS ends with slides after the balance", keys("COMBO-PRDS").slice(-1), ["slides:BALANCE"]);
expect("COMBO-RS has no proposal", keys("COMBO-RS").some((k) => k.startsWith("proposal")), false);
expect("FYP-CHAPTERS 1,2: all on the balance, plus the complete document", keys("FYP-CHAPTERS", 2, [1, 2]), [
  "ch1:BALANCE",
  "ch2:BALANCE",
  "final:BALANCE",
]);
expect("FYP-CHAPTERS single chapter is the whole order", keys("FYP-CHAPTERS", 1, [3]), ["final:BALANCE"]);
// Chapter 1 alone is written by the pipeline: a chapter item for the COO's approval, never listed for the client.
const one = deliverableTemplate({ serviceCode: "FYP-CHAPTERS", serviceName: "S", chapterCount: 1, chapters: [1] });
expect("FYP-CHAPTERS [1]: a hidden chapter item, then the complete document", one.map((d) => `${d.key}:${d.access}:${d.clientHidden ? "hidden" : "listed"}`), [
  "ch1:BALANCE:hidden",
  "final:BALANCE:listed",
]);
expect("chapter orders never use WITH_COMPLETE", keys("FYP-CHAPTERS", 5, [1, 2, 3, 4, 5]).some((k) => k.includes("WITH_COMPLETE")), false);
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
// Chapter 3 onwards of a full report: never on its own, whatever is paid; the founder's early release still opens it.
expect("chapter 3 with the downpayment only", state(true, "WITH_COMPLETE", DOWN), "locked:with_complete");
expect("chapter 3 even at 100% paid", state(true, "WITH_COMPLETE", PAID), "locked:with_complete");
expect("chapter 3 for pro bono", state(true, "WITH_COMPLETE", PRO_BONO), "locked:with_complete");
expect("chapter 3 before any payment says why", state(true, "WITH_COMPLETE", NEW), "locked:with_complete");
expect("chapter 3 not approved yet is hidden", state(false, "WITH_COMPLETE", PAID), "hidden");
expect("the founder's early release opens chapter 3", state(true, "ALWAYS", DOWN), "open");
expect("a withheld chapter stays locked", state(true, "WITHHELD", DOWN), "locked:withheld");
expect("the complete project waits for 100%", state(true, "BALANCE", DOWN), "locked:balance");
expect("isFullyPaid: both legs", [isFullyPaid(DOWN), isFullyPaid(PAID), isFullyPaid(PRO_BONO)], [false, true, true]);

// ── What the client reads ──
expect("lock text for chapter 3", LOCK_TEXT.with_complete, "Included in your complete project");
expect("not-ready hint for chapter 3", notReadyHint("WITH_COMPLETE", DOWN), "Comes in your complete project");
const ann = (access: AccessName, p: GateProject, isFinal = false) => releaseAnnouncement({ title: isFinal ? "Complete project" : "Chapter 3", isFinal, releaseNo: 1, gate: deliverableGate(true, access, p) });
expect("approving chapter 3 tells the client nothing", ann("WITH_COMPLETE", PAID), null);
expect("approving chapter 1 tells the client to download it", ann("DOWNPAYMENT", DOWN)?.notifyMessage("EC-1"), "EC-1: download it from Documents.");
expect("the complete project before the balance points to Payments", ann("BALANCE", DOWN, true)?.tab, "payments");
expect("a withheld release is not announced", ann("WITHHELD", PAID), null);

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
