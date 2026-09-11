import { db } from "@/lib/db";

export interface MonthlyReport {
  month: string; // "2026-09"
  monthLabel: string; // "September 2026"
  revenue: {
    totalRevenue: number;
    workerPayouts: number;
    ambassadorCommissions: number;
    /** totalRevenue - workerPayouts - ambassadorCommissions */
    educraftShare: number;
    expenses: number;
    /** educraftShare - expenses */
    netProfit: number;
  };
  projects: {
    created: number;
    completed: number;
    cancelled: number;
    avgDeliveryDays: number | null;
    /** % of projects approved this period that needed zero revisions. Null if none were approved. */
    qaFirstPassRate: number | null;
  };
  people: {
    activeWorkers: number;
    topWorker: { name: string; code: string; amount: number } | null;
    activeAmbassadors: number;
    topAmbassador: { name: string; code: string; amount: number } | null;
    newClients: number;
  };
}

const MONTH_RE = /^\d{4}-\d{2}$/;

/** Resolves a `?month=YYYY-MM` param to its UTC month bounds, defaulting to the current month. */
export function resolveMonth(raw: string | undefined, now: Date = new Date()) {
  const month =
    raw && MONTH_RE.test(raw)
      ? raw
      : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { month, start, end };
}

export async function getMonthlyReport(rawMonth?: string): Promise<MonthlyReport> {
  const { month, start, end } = resolveMonth(rawMonth);
  const monthLabel = new Intl.DateTimeFormat("en-NG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(start);
  const inRange = { gte: start, lt: end };

  const [
    revenueAgg,
    workerPayoutAgg,
    ambCommAgg,
    expenseAgg,
    createdCount,
    completedLogs,
    cancelledLogs,
    deliveredLogs,
    approvedLogs,
    activeWorkers,
    activeAmbassadors,
    newClients,
  ] = await Promise.all([
    db.payment.aggregate({
      where: {
        status: "Confirmed",
        direction: "INFLOW",
        type: { in: ["CLIENT_DOWNPAYMENT", "CLIENT_BALANCE"] },
        date: inRange,
      },
      _sum: { amount: true },
    }),
    db.payment.aggregate({
      where: { status: "Confirmed", direction: "OUTFLOW", type: "WORKER_PAYOUT", date: inRange },
      _sum: { amount: true },
    }),
    db.payment.aggregate({
      where: { status: "Confirmed", direction: "OUTFLOW", type: "AMBASSADOR_COMMISSION", date: inRange },
      _sum: { amount: true },
    }),
    db.expense.aggregate({ where: { date: inRange }, _sum: { amount: true } }),
    db.project.count({ where: { createdAt: inRange } }),
    db.projectStatusLog.findMany({
      where: { toStatus: "COMPLETED", createdAt: inRange },
      select: { projectId: true },
    }),
    db.projectStatusLog.findMany({
      where: { toStatus: "CANCELLED", createdAt: inRange },
      select: { projectId: true },
    }),
    db.projectStatusLog.findMany({
      where: { toStatus: "DELIVERED", createdAt: inRange },
      select: { projectId: true, createdAt: true, project: { select: { createdAt: true } } },
    }),
    db.projectStatusLog.findMany({
      where: { toStatus: "APPROVED", createdAt: inRange },
      select: { projectId: true },
    }),
    db.worker.count({ where: { status: "Active" } }),
    db.ambassador.count({ where: { status: "Active" } }),
    db.client.count({ where: { createdAt: inRange } }),
  ]);

  const totalRevenue = revenueAgg._sum.amount ?? 0;
  const workerPayouts = workerPayoutAgg._sum.amount ?? 0;
  const ambassadorCommissions = ambCommAgg._sum.amount ?? 0;
  const expenses = expenseAgg._sum.amount ?? 0;
  const educraftShare = totalRevenue - workerPayouts - ambassadorCommissions;
  const netProfit = educraftShare - expenses;

  const completedProjectIds = [...new Set(completedLogs.map((l) => l.projectId))];
  const completed = completedProjectIds.length;
  const cancelled = new Set(cancelledLogs.map((l) => l.projectId)).size;

  // Payout/commission Payment rows are one lump sum per payout run (no
  // projectId) — "top performer" instead comes from what each person's
  // completed projects were worth this period, whether or not paid out yet.
  let topWorker: { name: string; code: string; amount: number } | null = null;
  let topAmbassador: { name: string; code: string; amount: number } | null = null;
  if (completedProjectIds.length > 0) {
    const completedProjects = await db.project.findMany({
      where: { id: { in: completedProjectIds } },
      select: {
        workerPayout: true,
        worker: { select: { id: true, workerId: true, fullName: true } },
        ambassadorCommission: true,
        ambassador: { select: { id: true, ambassadorId: true, fullName: true } },
      },
    });
    topWorker = topEarner(
      completedProjects.map((p) => ({
        id: p.worker?.id,
        code: p.worker?.workerId,
        name: p.worker?.fullName,
        amount: p.workerPayout ?? 0,
      }))
    );
    topAmbassador = topEarner(
      completedProjects.map((p) => ({
        id: p.ambassador?.id,
        code: p.ambassador?.ambassadorId,
        name: p.ambassador?.fullName,
        amount: p.ambassadorCommission ?? 0,
      }))
    );
  }

  const avgDeliveryDays =
    deliveredLogs.length > 0
      ? Math.round(
          (deliveredLogs.reduce(
            (sum, l) => sum + (l.createdAt.getTime() - l.project.createdAt.getTime()) / 86_400_000,
            0
          ) /
            deliveredLogs.length) *
            10
        ) / 10
      : null;

  const approvedProjectIds = [...new Set(approvedLogs.map((l) => l.projectId))];
  let qaFirstPassRate: number | null = null;
  if (approvedProjectIds.length > 0) {
    const approvedProjects = await db.project.findMany({
      where: { id: { in: approvedProjectIds } },
      select: { revisionCount: true },
    });
    const firstPass = approvedProjects.filter((p) => p.revisionCount === 0).length;
    qaFirstPassRate = Math.round((firstPass / approvedProjects.length) * 100);
  }

  return {
    month,
    monthLabel,
    revenue: { totalRevenue, workerPayouts, ambassadorCommissions, educraftShare, expenses, netProfit },
    projects: { created: createdCount, completed, cancelled, avgDeliveryDays, qaFirstPassRate },
    people: { activeWorkers, topWorker, activeAmbassadors, topAmbassador, newClients },
  };
}

function topEarner(
  rows: { id: string | undefined; code: string | undefined; name: string | undefined; amount: number }[]
): { name: string; code: string; amount: number } | null {
  const byId = new Map<string, { code: string; name: string; amount: number }>();
  for (const r of rows) {
    if (!r.id || !r.code || !r.name) continue;
    const cur = byId.get(r.id) ?? { code: r.code, name: r.name, amount: 0 };
    cur.amount += r.amount;
    byId.set(r.id, cur);
  }
  let top: { name: string; code: string; amount: number } | null = null;
  for (const v of byId.values()) {
    if (!top || v.amount > top.amount) top = v;
  }
  return top;
}
