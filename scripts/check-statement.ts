/**
 * Phase 7 weekly statement arithmetic, no database: the totals, the pot
 * opening→closing walk, the cash position, and the week label.
 *
 *   npm run check:statement
 */
import { assembleStatement, weekLabel, type StatementInput } from "../src/lib/finance/statement-rules";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}

const input: StatementInput = {
  weekStart: new Date("2026-09-14T00:00:00+01:00"),
  weekEnd: new Date("2026-09-21T00:00:00+01:00"),
  isoWeek: "2026-W38",
  revenue: {
    downpayments: 45_000,
    balances: 55_000,
    refundsOut: 10_000,
    byProject: [
      { projectCode: "EC-00001", clientName: "A", amount: 30_000 },
      { projectCode: "EC-00002", clientName: "B", amount: 70_000 },
    ],
  },
  commissionGroups: [
    { leg: "WORKER", amount: 40_000, count: 2 },
    { leg: "AMBASSADOR", amount: 15_000, count: 3 },
  ],
  payouts: {
    batches: [{ cohort: "AMBASSADORS", periodKey: "2026-W38", amount: 15_000, recipientCount: 3 }],
    founderDraws: [{ recipient: "CEO", drawType: "MONTHLY", amount: 25_000 }],
  },
  pots: [{ key: "claude_api", label: "Claude API", opening: 8_000, in: 2_000, out: 5_000 }],
  refunds: [{ projectCode: "EC-00003", amount: 10_000, reason: "Client refunded before Chapter 1", stage: 1 }],
  buckets: [{ bucket: "operationsReserve", label: "Operations Reserve", balance: 12_000, health: { level: "monitor", percent: 60, target: 20_000, rule: "3 months of cost" } }],
  outstanding: 30_000,
  notes: "A quiet week.",
};

const st = assembleStatement(input);

// Revenue
expect("gross = downpayments + balances", st.revenue.gross, 100_000);
expect("net = gross − refunds", st.revenue.net, 90_000);
expect("byProject sorted desc", st.revenue.byProject.map((p) => p.amount), [70_000, 30_000]);

// Commissions
expect("commission total", st.commissions.total, 55_000);
expect("commission group labels", st.commissions.groups.map((g) => g.label), ["Workers", "Ambassadors"]);

// Payouts
expect("payouts total = batches + draws", st.payouts.total, 40_000);

// Pots walk
expect("pot closing = opening + in − out", st.pots.byPot[0].closing, 5_000);
expect("pots opening total", st.pots.opening, 8_000);
expect("pots in total", st.pots.in, 2_000);
expect("pots out total", st.pots.out, 5_000);
expect("pots closing total", st.pots.closing, 5_000);

// Refunds
expect("refund count", st.refunds.count, 1);
expect("refund amount", st.refunds.amount, 10_000);

// Outstanding
expect("outstanding passes through", st.outstanding, 30_000);

// Position = net − commissions − pot out
expect("cash position", st.position, 90_000 - 55_000 - 5_000);

// Labels
expect("week label", st.label, "14–20 Sep 2026");
expect("weekEndInclusive is the Sunday", st.weekEndInclusive, new Date("2026-09-20T00:00:00+01:00").toISOString());
expect("cross-month label", weekLabel(new Date("2026-09-28T00:00:00+01:00"), new Date("2026-10-04T00:00:00+01:00")), "28 Sep–4 Oct 2026");
expect("cross-year label", weekLabel(new Date("2026-12-28T00:00:00+01:00"), new Date("2027-01-03T00:00:00+01:00")), "28 Dec 2026–3 Jan 2027");

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("check:statement — the weekly statement rules hold.");
