import { db } from "@/lib/db";
import { NOT_OWED, isPaid, type PayoutStatus } from "@/lib/finance/payout-status";
import { execNames, type ExecRecipient } from "@/lib/services/finance/payouts-engine";
import { monthKeyOf } from "@/lib/services/finance/buckets";
import { monthLabel } from "@/lib/services/finance/surplus";

/**
 * An executive's own money, from the payout ledger (Phase 3). The HOG and COO
 * each earn a commission leg (2.5% in v1) and any performance bonus, both owed
 * as BONUS/role records under `recipientType: "EXECUTIVE"` keyed by the role
 * string. Their login is resolved from the role the same way the payout engine
 * pays them, so a hand-over between logins keeps one history.
 */

export interface ExecutiveEarningsMonth {
  month: string;
  label: string;
  commission: number;
  bonus: number;
  owed: number;
  paid: number;
  status: "PAID" | "PARTLY" | "PENDING";
  paidAt: string | null;
}

export interface ExecutiveEarningsLine {
  id: string;
  month: string;
  leg: string;
  isBonus: boolean;
  amount: number;
  basis: string;
  status: PayoutStatus;
  accruedOn: string | null;
  paidOn: string | null;
  projectCode: string | null;
}

export interface ExecutiveEarnings {
  role: ExecRecipient;
  name: string;
  currentMonth: string;
  owedThisMonth: number;
  lifetimeOwed: number;
  lifetimePaid: number;
  balance: number;
  months: ExecutiveEarningsMonth[];
  lines: ExecutiveEarningsLine[];
}

export async function getExecutiveEarnings(role: ExecRecipient): Promise<ExecutiveEarnings> {
  const [records, execs] = await Promise.all([
    db.payoutRecord.findMany({
      where: { recipientType: "EXECUTIVE", recipientId: role, status: { notIn: [...NOT_OWED] } },
      orderBy: [{ month: "desc" }, { accruedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        month: true,
        leg: true,
        amount: true,
        basis: true,
        status: true,
        accruedAt: true,
        createdAt: true,
        paidAt: true,
        project: { select: { projectId: true } },
      },
    }),
    execNames(),
  ]);

  const byMonth = new Map<string, ExecutiveEarningsMonth & { paidDates: string[] }>();
  for (const r of records) {
    const cur =
      byMonth.get(r.month) ?? { month: r.month, label: monthLabel(r.month), commission: 0, bonus: 0, owed: 0, paid: 0, status: "PENDING" as const, paidAt: null, paidDates: [] };
    const amt = Math.round(r.amount);
    cur.owed += amt;
    if (r.leg === "BONUS") cur.bonus += amt;
    else cur.commission += amt;
    if (isPaid(r.status)) {
      cur.paid += amt;
      if (r.paidAt) cur.paidDates.push(r.paidAt.toISOString());
    }
    byMonth.set(r.month, cur);
  }

  const months: ExecutiveEarningsMonth[] = [...byMonth.values()]
    .map((m) => ({
      month: m.month,
      label: m.label,
      commission: m.commission,
      bonus: m.bonus,
      owed: m.owed,
      paid: m.paid,
      status: (m.paid >= m.owed ? "PAID" : m.paid > 0 ? "PARTLY" : "PENDING") as ExecutiveEarningsMonth["status"],
      paidAt: m.paidDates.length ? m.paidDates.sort().at(-1)! : null,
    }))
    .sort((a, b) => b.month.localeCompare(a.month));

  const lines: ExecutiveEarningsLine[] = records.map((r) => ({
    id: r.id,
    month: r.month,
    leg: r.leg,
    isBonus: r.leg === "BONUS",
    amount: Math.round(r.amount),
    basis: r.basis,
    status: r.status as PayoutStatus,
    accruedOn: (r.accruedAt ?? r.createdAt)?.toISOString() ?? null,
    paidOn: r.paidAt?.toISOString() ?? null,
    projectCode: r.project?.projectId ?? null,
  }));

  const lifetimeOwed = Math.round(records.reduce((s, r) => s + r.amount, 0));
  const lifetimePaid = Math.round(records.filter((r) => isPaid(r.status)).reduce((s, r) => s + r.amount, 0));
  const currentMonth = monthKeyOf(new Date());
  const owedThisMonth = months.find((m) => m.month === currentMonth)?.owed ?? 0;

  return {
    role,
    name: execs[role].name,
    currentMonth,
    owedThisMonth,
    lifetimeOwed,
    lifetimePaid,
    balance: lifetimeOwed - lifetimePaid,
    months,
    lines,
  };
}
