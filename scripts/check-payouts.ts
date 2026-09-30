/**
 * Proves the commission state machine (src/lib/finance/payout-status.ts) with no
 * database: which trigger fires when, what reconcile does to each existing row,
 * and that the status sets never let a reversed or cancelled row count as owed
 * or paid (so money is never double counted).
 *
 *   npm run check:payouts
 */
import type { PersonTrigger } from "../src/lib/finance/cashflow-types";
import {
  CANCELLABLE_STATUSES,
  CREATE_STATUS,
  NOT_OWED,
  OWED_STATUSES,
  PAID_STATUSES,
  SETTLED_STATUSES,
  UNPAID_STATUSES,
  isCancellable,
  isOwed,
  isPaid,
  isSettled,
  isUnpaid,
  reconcileAction,
  triggerFired,
  type PayoutStatus,
  type ReconcileAction,
  type TriggerState,
} from "../src/lib/finance/payout-status";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}

const ALL_STATUSES: PayoutStatus[] = ["PENDING", "ACCRUED", "PAID", "REVERSED", "CANCELLED"];

// ── The created state ──────────────────────────────────────────────────────
expect("a fresh leg is created ACCRUED", CREATE_STATUS, "ACCRUED");

// ── triggerFired ───────────────────────────────────────────────────────────
const triggers: PersonTrigger[] = ["downpayment", "full_payment", "completion"];
// A dead project fires nothing, whatever else is true.
const deadAllTrue: TriggerState = { alive: false, downpaymentVerified: true, balanceVerified: true, completed: true };
for (const t of triggers) expect(`dead project fires no ${t}`, triggerFired(t, deadAllTrue), false);

// downpayment fires iff the downpayment is verified (project alive).
expect("downpayment fires when verified", triggerFired("downpayment", { alive: true, downpaymentVerified: true, balanceVerified: false, completed: false }), true);
expect("downpayment does not fire before verification", triggerFired("downpayment", { alive: true, downpaymentVerified: false, balanceVerified: true, completed: true }), false);

// full_payment fires iff the balance is verified OR the project completed.
expect("full_payment fires when the balance is verified", triggerFired("full_payment", { alive: true, downpaymentVerified: true, balanceVerified: true, completed: false }), true);
expect("full_payment fires when completed (even if the balance leg was never verified)", triggerFired("full_payment", { alive: true, downpaymentVerified: true, balanceVerified: false, completed: true }), true);
expect("full_payment does not fire on the downpayment alone", triggerFired("full_payment", { alive: true, downpaymentVerified: true, balanceVerified: false, completed: false }), false);

// completion fires iff completed.
expect("completion fires when completed", triggerFired("completion", { alive: true, downpaymentVerified: true, balanceVerified: true, completed: true }), true);
expect("completion does not fire before completion", triggerFired("completion", { alive: true, downpaymentVerified: true, balanceVerified: true, completed: false }), false);

// ── reconcileAction truth table ────────────────────────────────────────────
const action = (existingStatus: PayoutStatus | null, produced: boolean, changed: boolean): ReconcileAction => reconcileAction({ existingStatus, produced, changed });

// No row yet.
expect("no row + produced → create", action(null, true, false), "create");
expect("no row + not produced → skip", action(null, false, false), "skip");

// Settled rows are immutable, produced or not, changed or not.
for (const settled of ["PAID", "REVERSED"] as PayoutStatus[]) {
  expect(`${settled} produced+unchanged → skip`, action(settled, true, false), "skip");
  expect(`${settled} produced+changed → skip`, action(settled, true, true), "skip");
  expect(`${settled} not produced → skip`, action(settled, false, false), "skip");
}

// ACCRUED (owed).
expect("ACCRUED produced+changed → update", action("ACCRUED", true, true), "update");
expect("ACCRUED produced+unchanged → keep", action("ACCRUED", true, false), "keep");
expect("ACCRUED not produced → cancel", action("ACCRUED", false, false), "cancel");

// PENDING (legacy, treated like ACCRUED).
expect("PENDING produced+unchanged → keep", action("PENDING", true, false), "keep");
expect("PENDING produced+changed → update", action("PENDING", true, true), "update");
expect("PENDING not produced → cancel", action("PENDING", false, false), "cancel");

// CANCELLED revives when produced again, stays put otherwise.
expect("CANCELLED produced → update (revive)", action("CANCELLED", true, false), "update");
expect("CANCELLED produced+changed → update", action("CANCELLED", true, true), "update");
expect("CANCELLED not produced → skip", action("CANCELLED", false, false), "skip");

// A refund's reversal is never revived or re-cancelled by reconcile.
expect("REVERSED is never revived when produced", action("REVERSED", true, false), "skip");
expect("REVERSED is never cancelled when not produced", action("REVERSED", false, false), "skip");

// ── Status-set invariants ──────────────────────────────────────────────────
expect("OWED = PENDING, ACCRUED, PAID", [...OWED_STATUSES], ["PENDING", "ACCRUED", "PAID"]);
expect("UNPAID = PENDING, ACCRUED", [...UNPAID_STATUSES], ["PENDING", "ACCRUED"]);
expect("PAID = PAID", [...PAID_STATUSES], ["PAID"]);
expect("SETTLED = PAID, REVERSED", [...SETTLED_STATUSES], ["PAID", "REVERSED"]);
expect("CANCELLABLE = PENDING, ACCRUED", [...CANCELLABLE_STATUSES], ["PENDING", "ACCRUED"]);
expect("NOT_OWED = CANCELLED, REVERSED", [...NOT_OWED], ["CANCELLED", "REVERSED"]);

// A reversed or cancelled row is neither owed nor paid nor unpaid — it can never be double counted.
for (const gone of ["REVERSED", "CANCELLED"] as PayoutStatus[]) {
  expect(`${gone} is not owed`, isOwed(gone), false);
  expect(`${gone} is not unpaid`, isUnpaid(gone), false);
  expect(`${gone} is not paid`, isPaid(gone), false);
}

// UNPAID and PAID are disjoint, and both are subsets of OWED.
expect("UNPAID ∩ PAID = ∅", UNPAID_STATUSES.filter((s) => (PAID_STATUSES as readonly string[]).includes(s)), []);
expect("every UNPAID status is OWED", UNPAID_STATUSES.every((s) => isOwed(s)), true);
expect("every PAID status is OWED", PAID_STATUSES.every((s) => isOwed(s)), true);

// NOT_OWED is exactly the complement of OWED among the five statuses.
expect("NOT_OWED complements OWED", ALL_STATUSES.filter((s) => !isOwed(s)).sort(), [...NOT_OWED].sort());

// The helper predicates agree with the sets, for every status.
for (const s of ALL_STATUSES) {
  expect(`isOwed(${s})`, isOwed(s), (OWED_STATUSES as readonly string[]).includes(s));
  expect(`isUnpaid(${s})`, isUnpaid(s), (UNPAID_STATUSES as readonly string[]).includes(s));
  expect(`isPaid(${s})`, isPaid(s), (PAID_STATUSES as readonly string[]).includes(s));
  expect(`isSettled(${s})`, isSettled(s), (SETTLED_STATUSES as readonly string[]).includes(s));
  expect(`isCancellable(${s})`, isCancellable(s), (CANCELLABLE_STATUSES as readonly string[]).includes(s));
}

// ── owed − paid = unpaid, and reversed/cancelled contribute to nothing ──────
const rows: { status: PayoutStatus; amount: number }[] = [
  { status: "ACCRUED", amount: 10_500 },
  { status: "ACCRUED", amount: 4_900 },
  { status: "PAID", amount: 7_700 },
  { status: "REVERSED", amount: 3_000 }, // a refund took this one back — counts nowhere
  { status: "CANCELLED", amount: 9_000 }, // never really owed — counts nowhere
];
const owed = rows.filter((r) => isOwed(r.status)).reduce((s, r) => s + r.amount, 0);
const paid = rows.filter((r) => isPaid(r.status)).reduce((s, r) => s + r.amount, 0);
const unpaid = rows.filter((r) => isUnpaid(r.status)).reduce((s, r) => s + r.amount, 0);
expect("owed = the two ACCRUED + the PAID", owed, 10_500 + 4_900 + 7_700);
expect("paid = the PAID row", paid, 7_700);
expect("unpaid = the two ACCRUED", unpaid, 10_500 + 4_900);
expect("owed − paid = unpaid (no PENDING in the set)", owed - paid, unpaid);
expect("the reversed and cancelled amounts count nowhere", owed + paid + unpaid - (10_500 + 4_900 + 7_700 + 7_700 + 10_500 + 4_900), 0);

if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("check:payouts — the commission state machine holds.");
