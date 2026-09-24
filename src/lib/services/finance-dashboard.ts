import { db } from "@/lib/db";

/**
 * The business-intelligence half of the Finance page: payment methods this
 * month and lifetime revenue by service, university, worker and ambassador.
 * The month's figures, buckets and alerts live in services/finance/dashboard.ts.
 */

const INFLOW_TYPES = ["CLIENT_DOWNPAYMENT", "CLIENT_BALANCE"] as const;

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

// ── Payment method breakdown (this month) ────────────────────────────

export interface PaymentMethodRow {
  method: string;
  amount: number;
}

export async function getPaymentMethodBreakdown(now: Date = new Date()): Promise<PaymentMethodRow[]> {
  const monthStart = startOfMonth(now);
  const monthEnd = addMonths(monthStart, 1);

  const rows = await db.payment.groupBy({
    by: ["paymentMethod"],
    where: {
      status: "Confirmed",
      direction: "INFLOW",
      type: { in: [...INFLOW_TYPES] },
      date: { gte: monthStart, lt: monthEnd },
    },
    _sum: { amount: true },
  });

  return rows
    .map((r) => ({ method: r.paymentMethod ?? "Unspecified", amount: r._sum.amount ?? 0 }))
    .sort((a, b) => b.amount - a.amount);
}

// ── Business intelligence (lifetime, from completed projects) ────────

export interface RevenueByServiceRow {
  serviceName: string;
  revenue: number;
  projects: number;
}

export interface RevenueByUniversityRow {
  name: string;
  abbreviation: string;
  revenue: number;
  clients: number;
}

export interface TopPerformerRow {
  id: string;
  code: string;
  name: string;
  revenue: number;
  completed: number;
}

export interface BusinessIntelligence {
  byService: RevenueByServiceRow[];
  byUniversity: RevenueByUniversityRow[];
  topWorkers: TopPerformerRow[];
  topAmbassadors: TopPerformerRow[];
}

export async function getBusinessIntelligence(): Promise<BusinessIntelligence> {
  const projects = await db.project.findMany({
    // Pro bono jobs carry no revenue and would only pad the counts.
    where: { status: "COMPLETED", isProBono: false },
    select: {
      price: true,
      service: { select: { serviceName: true } },
      client: {
        select: {
          id: true,
          universityId: true,
          university: { select: { name: true, abbreviation: true } },
        },
      },
      worker: { select: { id: true, workerId: true, fullName: true } },
      ambassador: { select: { id: true, ambassadorId: true, fullName: true } },
    },
  });

  const svcMap = new Map<string, RevenueByServiceRow>();
  const uniMap = new Map<string, RevenueByUniversityRow & { clientIds: Set<string> }>();
  const workerMap = new Map<string, TopPerformerRow>();
  const ambassadorMap = new Map<string, TopPerformerRow>();

  for (const p of projects) {
    const svc = svcMap.get(p.service.serviceName) ?? { serviceName: p.service.serviceName, revenue: 0, projects: 0 };
    svc.revenue += p.price;
    svc.projects += 1;
    svcMap.set(p.service.serviceName, svc);

    const uni = uniMap.get(p.client.universityId) ?? {
      name: p.client.university.name,
      abbreviation: p.client.university.abbreviation,
      revenue: 0,
      clients: 0,
      clientIds: new Set<string>(),
    };
    uni.revenue += p.price;
    uni.clientIds.add(p.client.id);
    uniMap.set(p.client.universityId, uni);

    if (p.worker) {
      const w = workerMap.get(p.worker.id) ?? { id: p.worker.id, code: p.worker.workerId, name: p.worker.fullName, revenue: 0, completed: 0 };
      w.revenue += p.price;
      w.completed += 1;
      workerMap.set(p.worker.id, w);
    }

    if (p.ambassador) {
      const a = ambassadorMap.get(p.ambassador.id) ?? { id: p.ambassador.id, code: p.ambassador.ambassadorId, name: p.ambassador.fullName, revenue: 0, completed: 0 };
      a.revenue += p.price;
      a.completed += 1;
      ambassadorMap.set(p.ambassador.id, a);
    }
  }

  return {
    byService: [...svcMap.values()].sort((a, b) => b.revenue - a.revenue),
    byUniversity: [...uniMap.values()]
      .map(({ clientIds, ...rest }) => ({ ...rest, clients: clientIds.size }))
      .sort((a, b) => b.revenue - a.revenue),
    topWorkers: [...workerMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    topAmbassadors: [...ambassadorMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
  };
}
