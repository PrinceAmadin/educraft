/**
 * Phase 4 pot rules, no database:
 *   - potSplit divides a bucket delta across its tracked pots exactly (parts
 *     sum to the delta), remainder to the absorber, correct for negatives;
 *   - a bucket with no tracked pots yields nothing;
 *   - the category -> pot map and the "you can top up $X" = pot / rate maths;
 *   - the money model (claude_api fills by allocation, drains by top-up; per-call
 *     usage is not a pot movement) as an explicit table.
 *
 *   npm run check:pots
 */
import { potSplit } from "../src/lib/finance/commission-config";
import { potsOf, BUCKET_KEYS } from "../src/lib/finance/cashflow-types";
import { DEFAULT_CASHFLOW } from "../src/lib/finance/cashflow-default";
import { DEFAULT_POT_FOR_CATEGORY } from "../src/lib/validations/expenses";

const S = DEFAULT_CASHFLOW;
let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}
const obj = (m: Map<string, number>) => Object.fromEntries([...m.entries()].sort());
const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);

// ── The default pots (Operations Reserve): claude_api 40, data 20, software 15, emergencies 25 (absorber) ──
const OPS = "OPERATIONS_RESERVE" as const;
expect("Operations Reserve has four tracked pots", potsOf(S, OPS).filter((p) => p.isTrackedAsPot).map((p) => p.key).sort(), ["claude_api", "data", "emergencies", "software"]);
expect("the absorber pot is emergencies", potsOf(S, OPS).find((p) => p.isAbsorber)?.key, "emergencies");

// ── Exact split, clean divide ──
expect("split ₦1000 across the pots", obj(potSplit(1000, OPS, S)), { claude_api: 400, data: 200, emergencies: 250, software: 150 });
expect("₦1000 split sums to ₦1000", sum(potSplit(1000, OPS, S)), 1000);

// ── Remainder to the absorber ──
const odd = potSplit(1001, OPS, S);
expect("₦1001 split sums to exactly ₦1001 (remainder absorbed)", sum(odd), 1001);
expect("₦1001: non-absorber pots take their floor share", { claude_api: odd.get("claude_api"), data: odd.get("data"), software: odd.get("software") }, { claude_api: 400, data: 200, software: 150 });
expect("₦1001: the absorber (emergencies) takes the remainder", odd.get("emergencies"), 251);

// ── Negative delta (a refund / true-up) splits and sums exactly ──
expect("−₦1000 split", obj(potSplit(-1000, OPS, S)), { claude_api: -400, data: -200, emergencies: -250, software: -150 });
expect("−₦1001 split sums to exactly −₦1001", sum(potSplit(-1001, OPS, S)), -1001);

// ── A bucket with no tracked pots yields nothing ──
for (const bucket of BUCKET_KEYS.filter((b) => b !== OPS)) {
  expect(`${bucket} has no pot split`, potSplit(1000, bucket, S).size, 0);
}
expect("a zero delta yields no non-zero pot rows", [...potSplit(0, OPS, S).values()].filter((v) => v !== 0).length, 0);

// ── The category -> pot map (the form pre-selects; only these four have a default) ──
expect("API cost -> claude_api", DEFAULT_POT_FOR_CATEGORY["API cost"], "claude_api");
expect("Internet/Data -> data", DEFAULT_POT_FOR_CATEGORY["Internet/Data"], "data");
expect("Hosting -> data", DEFAULT_POT_FOR_CATEGORY["Hosting"], "data");
expect("Software -> software", DEFAULT_POT_FOR_CATEGORY["Software"], "software");
expect("Paystack fees has no default pot (general)", DEFAULT_POT_FOR_CATEGORY["Paystack fees"], undefined);
expect("Sponsorship has no default pot (Growth Fund, no pots)", DEFAULT_POT_FOR_CATEGORY["Sponsorship"], undefined);

// ── "You can top up about $X" = pot balance / the ₦/$ rate ──
const canTopUp = (balanceNaira: number, rate: number) => (rate > 0 ? Math.max(0, Math.round(balanceNaira / rate)) : 0);
expect("₦150,000 at ₦1500/$ -> $100", canTopUp(150_000, 1500), 100);
expect("₦0 -> $0", canTopUp(0, 1500), 0);
expect("a zero rate -> $0 (never divide by zero)", canTopUp(150_000, 0), 0);
expect("a negative pot (over-topped) never shows negative buyable credit", canTopUp(-5000, 1500), 0);

// ── The money model, asserted as a table (decision 5) ──
// claude_api: INFLOW = its 40% allocation share; OUTFLOW = a top-up. Per-call usage moves NEITHER.
expect("claude_api takes 40% of the Operations Reserve delta", potSplit(1000, OPS, S).get("claude_api"), 400);
expect("claude_api is a tracked pot (it accrues from the allocation)", Boolean(potsOf(S, OPS).find((p) => p.key === "claude_api")?.isTrackedAsPot), true);
expect("a top-up is the only category that debits claude_api", Object.entries(DEFAULT_POT_FOR_CATEGORY).filter(([, v]) => v === "claude_api").map(([k]) => k), ["API cost"]);

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("check:pots — the pot ledger rules hold.");
