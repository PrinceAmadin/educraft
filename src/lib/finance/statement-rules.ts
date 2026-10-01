/**
 * The weekly financial statement's arithmetic (Phase 7), pure so it can be
 * checked without a database. The service gathers the raw week aggregates and
 * hands them here; this computes the totals, the pot opening→closing walk and
 * the cash position. The PDF and the spreadsheet both render the result of this.
 */

export interface StatementInput {
  weekStart: Date;
  weekEnd: Date;
  isoWeek: string;
  revenue: { downpayments: number; balances: number; refundsOut: number; byProject: { projectCode: string; clientName: string; amount: number }[] };
  commissionGroups: { leg: string; amount: number; count: number }[];
  payouts: { batches: { cohort: string; periodKey: string; amount: number; recipientCount: number }[]; founderDraws: { recipient: string; drawType: string; amount: number }[] };
  pots: { key: string; label: string; opening: number; in: number; out: number }[];
  refunds: { projectCode: string; amount: number; reason: string; stage: number }[];
  buckets: { bucket: string; label: string; balance: number; health: { level: string; percent: number; target: number; rule: string } }[];
  outstanding: number;
  notes: string | null;
}

export interface WeeklyStatement {
  weekStart: string;
  weekEnd: string;
  /** The inclusive last day shown to people (weekEnd is the exclusive next Monday). */
  weekEndInclusive: string;
  isoWeek: string;
  label: string;
  revenue: { downpayments: number; balances: number; gross: number; refundsOut: number; net: number; byProject: { projectCode: string; clientName: string; amount: number }[] };
  commissions: { groups: { leg: string; label: string; amount: number; count: number }[]; total: number };
  payouts: { batches: { cohort: string; periodKey: string; amount: number; recipientCount: number }[]; founderDraws: { recipient: string; drawType: string; amount: number }[]; total: number };
  pots: { byPot: { key: string; label: string; opening: number; in: number; out: number; closing: number }[]; opening: number; in: number; out: number; closing: number };
  refunds: { items: { projectCode: string; amount: number; reason: string; stage: number }[]; count: number; amount: number };
  buckets: { bucket: string; label: string; balance: number; health: { level: string; percent: number; target: number; rule: string } }[];
  outstanding: number;
  /** Cash position for the week: net revenue − commissions accrued − pot spends. */
  position: number;
  notes: string | null;
}

const LEG_LABEL: Record<string, string> = {
  WORKER: "Workers",
  AMBASSADOR: "Ambassadors",
  PARENT: "Core overrides",
  HOG: "Head of Growth",
  COO: "COO",
  BONUS: "Bonuses",
};
const r = (n: number) => Math.round(n);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function watParts(d: Date): { day: number; month: number; year: number } {
  const w = new Date(d.getTime() + 60 * 60 * 1000); // WAT = UTC+1
  return { day: w.getUTCDate(), month: w.getUTCMonth(), year: w.getUTCFullYear() };
}

/** "15–21 Sep 2026" (or spanning months/years when the week straddles them). */
export function weekLabel(weekStart: Date, weekEndInclusive: Date): string {
  const a = watParts(weekStart);
  const b = watParts(weekEndInclusive);
  const left = a.year !== b.year ? `${a.day} ${MONTHS[a.month]} ${a.year}` : a.month !== b.month ? `${a.day} ${MONTHS[a.month]}` : `${a.day}`;
  return `${left}–${b.day} ${MONTHS[b.month]} ${b.year}`;
}

export function assembleStatement(input: StatementInput): WeeklyStatement {
  const weekEndInclusive = new Date(input.weekEnd.getTime() - 24 * 60 * 60 * 1000);
  const gross = r(input.revenue.downpayments + input.revenue.balances);
  const net = r(gross - input.revenue.refundsOut);
  const commissionTotal = r(input.commissionGroups.reduce((s, g) => s + g.amount, 0));
  const payoutsTotal = r(input.payouts.batches.reduce((s, b) => s + b.amount, 0) + input.payouts.founderDraws.reduce((s, d) => s + d.amount, 0));

  const byPot = input.pots.map((p) => ({ key: p.key, label: p.label, opening: r(p.opening), in: r(p.in), out: r(p.out), closing: r(p.opening + p.in - p.out) }));
  const potIn = r(byPot.reduce((s, p) => s + p.in, 0));
  const potOut = r(byPot.reduce((s, p) => s + p.out, 0));
  const potOpening = r(byPot.reduce((s, p) => s + p.opening, 0));

  const refundAmount = r(input.refunds.reduce((s, x) => s + x.amount, 0));

  return {
    weekStart: input.weekStart.toISOString(),
    weekEnd: input.weekEnd.toISOString(),
    weekEndInclusive: weekEndInclusive.toISOString(),
    isoWeek: input.isoWeek,
    label: weekLabel(input.weekStart, weekEndInclusive),
    revenue: {
      downpayments: r(input.revenue.downpayments),
      balances: r(input.revenue.balances),
      gross,
      refundsOut: r(input.revenue.refundsOut),
      net,
      byProject: input.revenue.byProject.map((p) => ({ ...p, amount: r(p.amount) })).sort((a, b) => b.amount - a.amount),
    },
    commissions: {
      groups: input.commissionGroups.map((g) => ({ leg: g.leg, label: LEG_LABEL[g.leg] ?? g.leg, amount: r(g.amount), count: g.count })).sort((a, b) => b.amount - a.amount),
      total: commissionTotal,
    },
    payouts: {
      batches: input.payouts.batches.map((b) => ({ ...b, amount: r(b.amount) })),
      founderDraws: input.payouts.founderDraws.map((d) => ({ ...d, amount: r(d.amount) })),
      total: payoutsTotal,
    },
    pots: { byPot, opening: potOpening, in: potIn, out: potOut, closing: r(potOpening + potIn - potOut) },
    refunds: { items: input.refunds.map((x) => ({ ...x, amount: r(x.amount) })), count: input.refunds.length, amount: refundAmount },
    buckets: input.buckets,
    outstanding: r(input.outstanding),
    position: r(net - commissionTotal - potOut),
    notes: input.notes,
  };
}
