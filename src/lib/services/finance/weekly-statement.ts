import { db } from "@/lib/db";
import { BUCKET_TYPES, BUCKET_KEY, bucketHealth, bucketLabel } from "@/lib/finance/commission-config";
import { NOT_OWED, UNPAID_STATUSES } from "@/lib/finance/payout-status";
import { assembleStatement, type WeeklyStatement } from "@/lib/finance/statement-rules";
import { isoWeekKey, weekEnd, weekStart } from "@/lib/ambassadors/weeks";
import { getActiveCashflow } from "@/lib/services/cashflow";
import { getFinanceSettings } from "@/lib/services/finance/settings";

/**
 * The weekly financial statement (Phase 7, super admin + CFO). Monday–Sunday in
 * WAT. The assembled figures are stored as JSON; the PDF and spreadsheet are
 * rendered from them on demand. The Sunday/weekly email is a once-a-week duty on
 * the cashflow tick.
 */

const CLIENT_INFLOW = ["CLIENT_DOWNPAYMENT", "CLIENT_BALANCE"] as const;

/** Gather and assemble one week's figures. */
export async function getStatementData(weekStartD: Date, weekEndD: Date, notes: string | null): Promise<WeeklyStatement> {
  const inWeek = { gte: weekStartD, lt: weekEndD };
  const [active, settings] = await Promise.all([getActiveCashflow(), getFinanceSettings()]);
  const s = active.structure;

  const [byLeg, byProject, refundsOutAgg, commGroups, batches, draws, potOpening, potWeek, bucketAsOf, outstandingAgg, refundRows] = await Promise.all([
    db.payment.groupBy({ by: ["type"], where: { status: "Confirmed", direction: "INFLOW", type: { in: [...CLIENT_INFLOW] }, date: inWeek }, _sum: { amount: true } }),
    db.payment.groupBy({ by: ["projectId"], where: { status: "Confirmed", direction: "INFLOW", type: { in: [...CLIENT_INFLOW] }, date: inWeek }, _sum: { amount: true } }),
    db.payment.aggregate({ where: { status: "Confirmed", direction: "OUTFLOW", type: "REFUND", date: inWeek }, _sum: { amount: true } }),
    db.payoutRecord.groupBy({ by: ["leg"], where: { accruedAt: inWeek, status: { notIn: [...NOT_OWED] } }, _sum: { amount: true }, _count: true }),
    db.payoutBatch.findMany({ where: { clearedAt: inWeek, status: { in: ["CLEARED", "FINALIZED"] } }, select: { cohort: true, periodKey: true, totalAmount: true, recipientCount: true }, orderBy: { clearedAt: "asc" } }),
    db.founderDraw.findMany({ where: { distributedAt: inWeek, status: "DISTRIBUTED" }, select: { recipient: true, drawType: true, amount: true } }),
    db.potTransaction.groupBy({ by: ["potKey"], where: { createdAt: { lt: weekStartD } }, _sum: { amount: true } }),
    db.potTransaction.findMany({ where: { createdAt: inWeek }, select: { potKey: true, amount: true } }),
    db.bucketTransaction.groupBy({ by: ["bucketType"], where: { createdAt: { lt: weekEndD } }, _sum: { amount: true } }),
    db.payoutRecord.aggregate({ where: { status: { in: [...UNPAID_STATUSES] } }, _sum: { amount: true } }),
    db.refundRecord.findMany({ where: { createdAt: inWeek }, select: { projectId: true, refundAmount: true, reason: true, stage: true } }),
  ]);

  // Revenue by project needs project codes/names.
  const projIds = [...new Set([...byProject.map((p) => p.projectId), ...refundRows.map((r) => r.projectId)].filter((x): x is string => Boolean(x)))];
  const projects = projIds.length ? await db.project.findMany({ where: { id: { in: projIds } }, select: { id: true, projectId: true, client: { select: { fullName: true } } } }) : [];
  const projMap = new Map(projects.map((p) => [p.id, p]));
  const code = (id: string | null) => (id ? projMap.get(id)?.projectId ?? "—" : "—");
  const clientName = (id: string | null) => (id ? projMap.get(id)?.client.fullName ?? "—" : "—");

  const downpayments = byLeg.find((x) => x.type === "CLIENT_DOWNPAYMENT")?._sum.amount ?? 0;
  const balances = byLeg.find((x) => x.type === "CLIENT_BALANCE")?._sum.amount ?? 0;

  // Pot movements: opening before Monday, in/out within the week.
  const openingByPot = new Map(potOpening.map((p) => [p.potKey, p._sum.amount ?? 0]));
  const inByPot = new Map<string, number>();
  const outByPot = new Map<string, number>();
  for (const t of potWeek) {
    if (t.amount >= 0) inByPot.set(t.potKey, (inByPot.get(t.potKey) ?? 0) + t.amount);
    else outByPot.set(t.potKey, (outByPot.get(t.potKey) ?? 0) + -t.amount);
  }
  const pots = s.level3
    .filter((p) => p.isTrackedAsPot)
    .map((p) => ({ key: p.key, label: p.label, opening: openingByPot.get(p.key) ?? 0, in: inByPot.get(p.key) ?? 0, out: outByPot.get(p.key) ?? 0 }));

  // Bucket health at week end.
  const healthSettings = { operatingBaseline: settings.operatingCostMonthlyBaseline, referenceRevenue: settings.bucketReferenceRevenue };
  const balByBucket = Object.fromEntries(bucketAsOf.map((b) => [b.bucketType, b._sum.amount ?? 0]));
  const buckets = BUCKET_TYPES.map((b) => {
    const balance = Math.round(balByBucket[b] ?? 0);
    const h = bucketHealth(b, balance, healthSettings, s);
    return { bucket: BUCKET_KEY[b], label: bucketLabel(b, s), balance, health: { level: h.level, percent: h.percent, target: h.target, rule: h.rule } };
  });

  return assembleStatement({
    weekStart: weekStartD,
    weekEnd: weekEndD,
    isoWeek: isoWeekKey(weekStartD),
    revenue: {
      downpayments,
      balances,
      refundsOut: refundsOutAgg._sum.amount ?? 0,
      byProject: byProject.filter((p) => p.projectId).map((p) => ({ projectCode: code(p.projectId), clientName: clientName(p.projectId), amount: p._sum.amount ?? 0 })),
    },
    commissionGroups: commGroups.map((g) => ({ leg: g.leg, amount: g._sum.amount ?? 0, count: g._count })),
    payouts: {
      batches: batches.map((b) => ({ cohort: b.cohort, periodKey: b.periodKey, amount: b.totalAmount, recipientCount: b.recipientCount })),
      founderDraws: draws.map((d) => ({ recipient: d.recipient, drawType: d.drawType, amount: d.amount })),
    },
    pots,
    refunds: refundRows.map((r) => ({ projectCode: code(r.projectId), amount: r.refundAmount, reason: r.reason, stage: r.stage })),
    buckets,
    outstanding: outstandingAgg._sum.amount ?? 0,
    notes,
  });
}

/** The Monday that starts the week being reported, from any anchor date. */
export function weekBounds(anchor: Date): { start: Date; end: Date; isoWeek: string } {
  const start = weekStart(anchor);
  return { start, end: weekEnd(anchor), isoWeek: isoWeekKey(anchor) };
}

/** Generate (or regenerate) the statement for the week containing `anchor`. One per ISO week. */
export async function generateWeeklyStatement(input: { anchor: Date; by: string; notes?: string | null }): Promise<{ id: string; data: WeeklyStatement }> {
  const { start, end, isoWeek } = weekBounds(input.anchor);
  const data = await getStatementData(start, end, input.notes?.trim() || null);
  const row = await db.financialStatement.upsert({
    where: { isoWeek },
    create: { isoWeek, weekStart: start, weekEnd: end, generatedById: input.by, notes: input.notes?.trim() || null, data: data as unknown as object },
    update: { generatedById: input.by, generatedAt: new Date(), notes: input.notes?.trim() || null, data: data as unknown as object },
    select: { id: true },
  });
  return { id: row.id, data };
}

export interface StatementRow {
  id: string;
  isoWeek: string;
  label: string;
  generatedAt: string;
  net: number;
  position: number;
  autoEmailed: boolean;
}

/** Recent statements, newest first. */
export async function listStatements(limit = 26): Promise<StatementRow[]> {
  const rows = await db.financialStatement.findMany({ orderBy: { weekStart: "desc" }, take: limit, select: { id: true, isoWeek: true, generatedAt: true, autoEmailedAt: true, data: true } });
  return rows.map((r) => {
    const d = r.data as unknown as WeeklyStatement;
    return { id: r.id, isoWeek: r.isoWeek, label: d.label, generatedAt: r.generatedAt.toISOString(), net: d.revenue.net, position: d.position, autoEmailed: r.autoEmailedAt != null };
  });
}

export async function getStatement(id: string): Promise<{ id: string; data: WeeklyStatement } | null> {
  const row = await db.financialStatement.findUnique({ where: { id }, select: { id: true, data: true } });
  return row ? { id: row.id, data: row.data as unknown as WeeklyStatement } : null;
}

const naira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");

/**
 * Once a week (self-gated), generate the just-completed week's statement and email
 * finance a headline digest with a link. Runs from the cashflow tick; dormant
 * until the scheduler is switched on.
 */
export async function sendWeeklyStatement(now: Date = new Date()): Promise<{ sent: number }> {
  const { getAlertEmails } = await import("@/lib/services/settings");
  const { mergeAlertRecipients } = await import("@/lib/services/team-alerts");
  const { sendMail } = await import("@/lib/mailer");
  const { mayNotify } = await import("@/lib/qa-scope");
  const { siteUrl } = await import("@/lib/site-url");

  // The last completed week: the one ending at this week's Monday.
  const thisMonday = weekStart(now);
  const completedStart = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
  const isoWeek = isoWeekKey(completedStart);

  const gateKey = `weekly_statement_ran:${isoWeek}`;
  if (await db.setting.findUnique({ where: { key: gateKey }, select: { key: true } })) return { sent: 0 };
  await db.setting.create({ data: { key: gateKey, value: now.toISOString() } }).catch(() => undefined);

  const { id, data } = await generateWeeklyStatement({ anchor: completedStart, by: "system" });

  const founder = await getAlertEmails();
  const cfos = (await db.user.findMany({ where: { role: "CO_CEO_CFO", isActive: true }, orderBy: { createdAt: "asc" }, select: { email: true } })).map((u) => u.email);
  const recipients = mergeAlertRecipients(founder, cfos).to.filter((e) => mayNotify(e));
  if (!recipients.length) return { sent: 0 };

  const url = `${siteUrl()}/admin/finance/statements?id=${id}`;
  const lines = [
    `Revenue (net): ${naira(data.revenue.net)}`,
    `Commissions accrued: ${naira(data.commissions.total)}`,
    `Paid out: ${naira(data.payouts.total)}`,
    `Cash position: ${naira(data.position)}`,
    `Outstanding owed: ${naira(data.outstanding)}`,
  ];
  const text = [`EduCraft weekly financial statement — ${data.label}`, "", ...lines, "", `Full statement: ${url}`].join("\n");
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0F172A;"><h2 style="font-size:17px;">Weekly financial statement — ${data.label}</h2><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul><p><a href="${url}" style="color:#0D9488;">Open the full statement</a></p></div>`;
  const res = await sendMail({ to: recipients.join(", "), subject: `EduCraft weekly statement — ${data.label}`, html, text });
  if (res.ok) await db.financialStatement.update({ where: { id }, data: { autoEmailedAt: now } }).catch(() => undefined);
  await db.emailLog.create({ data: { kind: `weekly-statement:${isoWeek}`, to: recipients.join(", "), ok: res.ok, error: res.error ?? null } }).catch(() => undefined);
  return { sent: res.ok ? 1 : 0 };
}
