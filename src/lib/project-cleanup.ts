/**
 * Test project cleanup: the rules, with no database. The founder (SUPER_ADMIN)
 * alone deletes a project; the COO, and anyone the founder appoints, may flag
 * one as a test so it waits at the top of his list. Browser-safe: the delete
 * dialog uses the confirmation phrase and the wording from here.
 *
 *   npm run check:cleanup
 *
 * A deletion removes the project's whole footprint as if it never existed —
 * payments (Paystack ones included), bucket and pot amounts, payouts,
 * commission expenses, the referral, files — except the AI spend (real money
 * that left the Anthropic balance) and a `DeletedProject` record of what went.
 * Where the money came from never blocks a delete: that only the founder can
 * delete is the safeguard (founder's call, 1 Oct 2026). The service that does
 * it is src/lib/services/project-cleanup.ts.
 */
import { effectiveRole } from "@/lib/rbac";
import { formatNaira } from "@/lib/utils";

// ── What the rules read ─────────────────────────────────────────────────────

/** Everything the rules need about one project, read by the service in one pass. */
export interface CleanupFacts {
  code: string;
  title: string | null;
  status: string;
  isProBono: boolean;
  clientName: string;
  clientEmail: string | null;
  flagged: boolean;
  /** Confirmed or Duplicate PAYSTACK inflows. Shown as a warning, never a block: test checkouts look the same. */
  paystackMoney: number;
  /** Confirmed inflows recorded by hand (a bank transfer finance verified), less refunds. */
  otherMoney: number;
  /** Payout records marked PAID with an amount (pro bono's zero legs never count). */
  paidPayoutAmount: number;
  /** The project's paid flags, which a pro bono job carries without any money moving. */
  paidFlags: { worker: boolean; ambassador: boolean; parent: boolean };
  /** A quarterly bonus (Platinum or challenge) already processed on the quarter this job converted in. */
  bonusCounted: boolean;
  /** Plain names of the runs holding a live lease on the project right now. */
  runningWork: string[];
  /** The orchestrator's state, when it is one that holds a generation slot or waits on the gate. */
  orchestratorBusy: string | null;
}

// ── Refusals ───────────────────────────────────────────────────────────────

/**
 * Why this project can't be deleted, in the founder's words; empty = it can.
 * These protect ledger rows that cannot be cleanly taken back (money already
 * paid out to someone, a bonus already processed) and work in flight; money
 * coming IN, through Paystack or by hand, is only ever a warning.
 */
export function cleanupRefusals(f: CleanupFacts): string[] {
  const out: string[] = [];
  const flagPaid = !f.isProBono && (f.paidFlags.worker || f.paidFlags.ambassador || f.paidFlags.parent);
  if (f.paidPayoutAmount > 0 || flagPaid) {
    const who = [
      f.paidFlags.worker && !f.isProBono ? "the specialist" : null,
      f.paidFlags.ambassador && !f.isProBono ? "the ambassador" : null,
      f.paidFlags.parent && !f.isProBono ? "the Core ambassador" : null,
    ].filter(Boolean);
    const amount = f.paidPayoutAmount > 0 ? ` (${formatNaira(f.paidPayoutAmount)})` : "";
    out.push(`Someone has already been paid for ${f.code}${who.length ? `: ${who.join(", ")}` : ""}${amount}.`);
  }
  if (f.bonusCounted) {
    out.push(`A quarterly ambassador bonus has already counted ${f.code}'s client.`);
  }
  if (f.runningWork.length || f.orchestratorBusy) {
    const what = [...f.runningWork, ...(f.orchestratorBusy ? [f.orchestratorBusy] : [])];
    out.push(`${f.code} is being worked on right now (${[...new Set(what)].join(", ")}). Stop it on the Report tab and try again in a few minutes.`);
  }
  return out;
}

// ── Hints ──────────────────────────────────────────────────────────────────

/**
 * Why a project looks like a test. Only a hint beside the row: nothing is ever
 * deleted because of it, and a project with no signal is still deletable.
 */
export function testSignals(p: { code: string; title: string | null; clientName: string; clientEmail: string | null }): string[] {
  const out: string[] = [];
  if (/^EC-QA-/i.test(p.code)) out.push("QA code");
  if (/\btest(ing)?\b|\bQA TEST\b/i.test(p.title ?? "")) out.push("\"test\" in the title");
  if (/\btest(ing)?\d*\b|\bQA TEST\b/i.test(p.clientName)) out.push("\"test\" in the client's name");
  if (/@example\.(com|org|net)$/i.test(p.clientEmail ?? "")) out.push("example.com email");
  return out;
}

/** Plain warnings for the preview: what else the delete changes. Never blocks. */
export interface CleanupWarningInput {
  code: string;
  status: string;
  flagged: boolean;
  signals: string[];
  otherMoney: number;
  /** Confirmed or held Paystack money on the project. */
  paystackMoney: number;
  /** Pots this selection's deletion leaves below zero. */
  potsGoingNegative: { label: string; from: number; to: number }[];
  hasWorker: boolean;
  hasLineage: boolean;
  aiSpendKept: number;
  tierDrops: { name: string; from: string; to: string }[];
}

export function cleanupWarnings(w: CleanupWarningInput): string[] {
  const out: string[] = [];
  if (!w.flagged && w.signals.length === 0) out.push(CLEANUP_TEXT.noSignal);
  if (w.paystackMoney > 0) {
    out.push(`${formatNaira(w.paystackMoney)} paid through Paystack leaves revenue and the buckets. If any of it was real money, it is still in your Paystack balance.`);
  }
  if (w.otherMoney > 0) out.push(`${formatNaira(w.otherMoney)} recorded as paid by hand leaves revenue and the buckets.`);
  for (const pot of w.potsGoingNegative) out.push(`The ${pot.label} pot goes from ${formatNaira(pot.from)} to ${formatNaira(pot.to)}.`);
  if (["DELIVERED", "COMPLETED", "SUPERVISOR_CORRECTIONS"].includes(w.status)) out.push("It has already been delivered.");
  if (w.hasWorker) out.push("A specialist is assigned to it; it disappears from their list.");
  if (w.hasLineage) out.push("It is linked to another project (a follow-on order); that link is removed.");
  for (const t of w.tierDrops) out.push(`${t.name} drops from ${t.from} to ${t.to}.`);
  if (w.aiSpendKept > 0) out.push(`${formatNaira(w.aiSpendKept, { decimals: true })} of Claude spend stays in AI usage: that money was really spent.`);
  return out;
}

// ── Confirmation ───────────────────────────────────────────────────────────

export const MIN_REASON_LENGTH = 5;

/** What the founder types to confirm: the code for one project, "DELETE 3 PROJECTS" for several. */
export function confirmPhrase(codes: readonly string[]): string {
  return codes.length === 1 ? codes[0] : `DELETE ${codes.length} PROJECTS`;
}

export function confirmMatches(typed: string, codes: readonly string[]): boolean {
  if (codes.length === 0) return false;
  return typed.trim().replace(/\s+/g, " ").toUpperCase() === confirmPhrase(codes).toUpperCase();
}

export function reasonIsValid(reason: string): boolean {
  return reason.trim().length >= MIN_REASON_LENGTH;
}

// ── Who may flag ───────────────────────────────────────────────────────────

/** The COO by role; anyone else only when the founder appointed their login. The founder may too. */
export function mayFlagTestProjects(role: string | null | undefined, appointed: boolean): boolean {
  const r = effectiveRole(role);
  return r === "SUPER_ADMIN" || r === "COO" || appointed;
}

/** The founder, the person who flagged it, or the COO may take a flag off. */
export function mayUnflag(role: string | null | undefined, userId: string, flaggedById: string | null): boolean {
  const r = effectiveRole(role);
  return r === "SUPER_ADMIN" || r === "COO" || (flaggedById != null && flaggedById === userId);
}

export type FlaggerIdentifier =
  | { kind: "email"; email: string }
  | { kind: "worker"; code: string }
  | { kind: "ambassador"; code: string };

/** How the founder names someone to appoint: their login email, worker ID (ECW-0003) or ambassador ID (EC-A-00030). */
export function parseFlaggerIdentifier(raw: string): FlaggerIdentifier | null {
  const s = raw.trim();
  if (!s) return null;
  const worker = /^\s*ECW[\s-]*(\d{1,8})\s*$/i.exec(s) ?? /^\s*EC-W-(\d{1,8})\s*$/i.exec(s);
  if (worker) {
    const n = parseInt(worker[1], 10);
    return n > 0 ? { kind: "worker", code: `ECW-${String(n).padStart(4, "0")}` } : null;
  }
  const ambassador = /^\s*EC-A-?(\d{1,8})\s*$/i.exec(s);
  if (ambassador) {
    const n = parseInt(ambassador[1], 10);
    return n > 0 ? { kind: "ambassador", code: `EC-A-${String(n).padStart(5, "0")}` } : null;
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { kind: "email", email: s.toLowerCase() };
  return null;
}

/** A project code as typed in the flag dialog ("ec 7", "EC-00007", "EC-QA-D9-A"). */
export function normalizeProjectCode(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  const plain = /^EC[\s-]*(\d{1,8})$/.exec(s);
  if (plain) {
    const n = parseInt(plain[1], 10);
    return n > 0 ? `EC-${String(n).padStart(5, "0")}` : null;
  }
  return /^EC-[A-Z0-9-]{1,40}$/.test(s) ? s : null;
}

// ── Notifications that name a project ──────────────────────────────────────

/**
 * Does this text name exactly this project? "EC-00001" must not match
 * "EC-000012" or "EC-QA-D9-A" must not match "EC-QA-D9-AB". Notifications only
 * mention a project in their text, so this is how the delete finds them.
 */
export function mentionsProject(text: string | null | undefined, code: string): boolean {
  if (!text) return false;
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9-])${escaped}(?![A-Za-z0-9])`, "i").test(text);
}

// ── What a deletion removed ────────────────────────────────────────────────

/** Stored on `DeletedProject.summary` and shown in the history. Amounts in naira. */
export interface DeletionSummary {
  /** `reference` is kept so Paystack's own record of a deleted payment can still be matched. */
  payments: { paymentId: string; type: string; source: string; status: string; amount: number; direction: string; reference?: string | null }[];
  buckets: { operationsReserve: number; growthFund: number; reinvestmentFund: number; founderDistribution: number; retained: number };
  /** What left each pot (the bucket's earmarked sub-ledger). */
  pots?: { potKey: string; label: string; amount: number }[];
  payouts: { leg: string; recipientName: string; amount: number; status: string }[];
  expenses: { category: string; amount: number }[];
  referral: { ambassadorName: string; status: string; action: "deleted" | "unlinked" } | null;
  ambassadors: { name: string; tierBefore: string; tierAfter: string; conversionsBefore: number; conversionsAfter: number }[];
  files: number;
  notifications: number;
  aiSpendKept: number;
}

/** Revenue the deletion took out of the books: confirmed inflows less refunds. */
export function revenueRemoved(s: Pick<DeletionSummary, "payments">): number {
  let total = 0;
  for (const p of s.payments) {
    if (p.status !== "Confirmed") continue;
    if (p.direction === "INFLOW") total += p.amount;
    else if (p.type === "REFUND") total -= p.amount;
  }
  return Math.round(total);
}

/** One line for the history row and the finance bell. */
export function summaryLine(s: DeletionSummary): string {
  const parts: string[] = [];
  const revenue = revenueRemoved(s);
  if (revenue) parts.push(`${formatNaira(revenue)} revenue`);
  if (s.buckets.retained) parts.push(`${formatNaira(Math.round(s.buckets.retained))} from the buckets`);
  const payouts = s.payouts.reduce((sum, p) => sum + p.amount, 0);
  if (payouts) parts.push(`${formatNaira(Math.round(payouts))} of unpaid payouts`);
  if (s.referral) parts.push(`${s.referral.ambassadorName}'s referral`);
  if (s.files) parts.push(`${s.files} file${s.files === 1 ? "" : "s"}`);
  return parts.length ? `Removed ${parts.join(", ")}.` : "No money was recorded on it.";
}

// ── Wording ────────────────────────────────────────────────────────────────

export const CLEANUP_TEXT = {
  pageTitle: "Test data",
  pageIntro:
    "Delete projects that were only ever tests, so they stop counting in revenue, the buckets and pots, commissions and ambassador tiers. Only you can delete. A deleted project is gone for good: its payments, bucket and pot amounts, unpaid payouts, commission lines, referral and files go with it. Claude spend stays, because that money was really spent.",
  flaggedHeading: "Flagged as tests",
  flaggedEmpty: "Nobody has flagged a project yet. The COO, and anyone you appoint below, can flag one from its page or the account menu.",
  othersHeading: "All other projects",
  searchHint: "Showing likely tests and the newest projects. Search by code, title or client to find others.",
  noSignal: "Nothing marks this as a test: no flag, no test name. Check it is not a real client's project.",
  reviewButton: (n: number) => `Review deletion (${n})`,
  dialogTitle: (n: number) => (n === 1 ? "Delete this project?" : `Delete ${n} projects?`),
  dialogIntro: "This can't be undone. Read what goes with each project, give a reason, then type the confirmation.",
  reasonLabel: "Why are you deleting this?",
  reasonHint: "Kept with the deletion record. At least 5 characters.",
  confirmLabel: (phrase: string) => `Type ${phrase} to confirm`,
  cannotDelete: "Can't be deleted",
  deleteButton: (n: number) => (n === 1 ? "Delete project" : `Delete ${n} projects`),
  flaggersHeading: "Who can flag test projects",
  flaggersIntro:
    "Flagging only puts a project at the top of this list; nothing is removed until you delete it. The COO can always flag. Add anyone else by their login email, worker ID or ambassador ID.",
  historyHeading: "Deleted projects",
  historyEmpty: "Nothing has been deleted yet.",
  flagDone: "Flagged. The founder will review it.",
  flagMissing: "No project with that code.",
} as const;
