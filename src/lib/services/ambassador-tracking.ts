import type { AmbassadorTier } from "@prisma/client";
import { db } from "@/lib/db";
import { redisConfigured, withRedis } from "@/lib/ambassador-panel/redis";

/**
 * The Tracking view — the original panel's leaderboard, rebuilt on HQ's own
 * data. Jobs and commission come from Postgres (a job counts once it has been
 * allocated to the ambassador). Link clicks still come from Redis, because the
 * old /EduCraftA/{slot} links that ambassadors already shared are counted
 * there; they're matched to an ambassador through `legacySlotId`.
 */

const DEAD_STATUSES = ["CANCELLED", "REFUNDED"];
const REDIS_TIMEOUT_MS = 2500;

export interface TrackingRow {
  id: string;
  code: string;
  name: string;
  university: string | null;
  tier: AmbassadorTier;
  status: string;
  email: string | null;
  legacySlotId: string | null;
  /** Clicks on their original panel link; null when Redis is unreachable or they have no old link. */
  clicks: number | null;
  jobs: number;
  commissionLogged: number;
  commissionPaid: number;
}

export interface RecentCommission {
  projectDbId: string;
  projectCode: string;
  ambassadorId: string;
  ambassadorName: string;
  rate: number;
  commission: number;
  allocatedAt: Date;
  notifiedAt: Date | null;
}

export interface OpenJob {
  id: string;
  code: string;
  title: string;
  service: string;
  client: string;
  price: number;
  workerPayout: number;
  downpaymentVerified: boolean;
}

export interface AmbassadorTracking {
  rows: TrackingRow[];
  totals: {
    jobs: number;
    commissionLogged: number;
    clicks: number | null;
    withEmail: number;
    ambassadors: number;
  };
  recent: RecentCommission[];
  openJobs: OpenJob[];
}

/** One mGet for every old slot link, capped so a slow Redis can't stall the page. */
export async function readClicks(slotIds: string[]): Promise<Map<string, number> | null> {
  if (!redisConfigured() || slotIds.length === 0) return null;
  // The old app keyed general slots zero-padded ("006"), but a hand-typed
  // link may have counted under "6" — read both and add them up.
  const keysFor = (slot: string) => {
    const unpadded = /^\d+$/.test(slot) ? String(Number(slot)) : slot;
    return unpadded === slot ? [`clicks:${slot}`] : [`clicks:${slot}`, `clicks:${unpadded}`];
  };
  const plan = slotIds.map((slot) => ({ slot, keys: keysFor(slot) }));
  const keys = plan.flatMap((p) => p.keys);

  try {
    const values = await Promise.race([
      withRedis((client) => client.mGet(keys)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), REDIS_TIMEOUT_MS)),
    ]);
    if (!values) return null;
    const byKey = new Map(keys.map((k, i) => [k, Number(values[i] ?? 0) || 0]));
    return new Map(plan.map((p) => [p.slot, p.keys.reduce((n, k) => n + (byKey.get(k) ?? 0), 0)]));
  } catch {
    return null;
  }
}

export async function getAmbassadorTracking(): Promise<AmbassadorTracking> {
  const [ambassadors, recentProjects, open] = await Promise.all([
    db.ambassador.findMany({
      where: { status: { not: "Terminated" } },
      select: {
        id: true,
        ambassadorId: true,
        fullName: true,
        email: true,
        tier: true,
        status: true,
        legacySlotId: true,
        university: { select: { abbreviation: true } },
        projects: {
          where: { status: { notIn: DEAD_STATUSES as never[] }, ambassadorCommission: { not: null } },
          select: { ambassadorCommission: true, ambassadorCommPaid: true },
        },
      },
    }),
    db.project.findMany({
      where: { ambassadorAllocatedAt: { not: null }, ambassadorId: { not: null } },
      orderBy: { ambassadorAllocatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        projectId: true,
        ambassadorCommRate: true,
        ambassadorCommission: true,
        ambassadorAllocatedAt: true,
        ambassadorNotifiedAt: true,
        ambassador: { select: { id: true, fullName: true } },
      },
    }),
    db.project.findMany({
      where: {
        ambassadorId: null,
        status: { notIn: ["CANCELLED", "REFUNDED", "COMPLETED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        projectId: true,
        projectTitle: true,
        price: true,
        workerPayout: true,
        workerPayoutRate: true,
        downpaymentStatus: true,
        service: { select: { serviceName: true } },
        client: { select: { fullName: true } },
      },
    }),
  ]);

  const clicks = await readClicks(
    ambassadors.map((a) => a.legacySlotId).filter((s): s is string => Boolean(s))
  );

  const rows: TrackingRow[] = ambassadors
    .map((a) => ({
      id: a.id,
      code: a.ambassadorId,
      name: a.fullName,
      university: a.university?.abbreviation ?? null,
      tier: a.tier,
      status: a.status,
      email: a.email,
      legacySlotId: a.legacySlotId,
      clicks: clicks && a.legacySlotId ? (clicks.get(a.legacySlotId) ?? 0) : null,
      jobs: a.projects.length,
      commissionLogged: a.projects.reduce((s, p) => s + (p.ambassadorCommission ?? 0), 0),
      commissionPaid: a.projects
        .filter((p) => p.ambassadorCommPaid)
        .reduce((s, p) => s + (p.ambassadorCommission ?? 0), 0),
    }))
    .sort(
      (x, y) =>
        y.commissionLogged - x.commissionLogged ||
        y.jobs - x.jobs ||
        (y.clicks ?? 0) - (x.clicks ?? 0) ||
        x.name.localeCompare(y.name)
    );

  return {
    rows,
    totals: {
      jobs: rows.reduce((n, r) => n + r.jobs, 0),
      commissionLogged: rows.reduce((n, r) => n + r.commissionLogged, 0),
      clicks: clicks ? [...clicks.values()].reduce((n, c) => n + c, 0) : null,
      withEmail: rows.filter((r) => r.email).length,
      ambassadors: rows.length,
    },
    recent: recentProjects
      .filter((p) => p.ambassador && p.ambassadorAllocatedAt && p.ambassadorCommission != null)
      .map((p) => ({
        projectDbId: p.id,
        projectCode: p.projectId,
        ambassadorId: p.ambassador!.id,
        ambassadorName: p.ambassador!.fullName,
        rate: p.ambassadorCommRate ?? 0,
        commission: p.ambassadorCommission ?? 0,
        allocatedAt: p.ambassadorAllocatedAt!,
        notifiedAt: p.ambassadorNotifiedAt,
      })),
    openJobs: open.map((p) => ({
      id: p.id,
      code: p.projectId,
      title: p.projectTitle?.trim() || "Untitled",
      service: p.service.serviceName,
      client: p.client.fullName,
      price: p.price,
      workerPayout: p.workerPayout ?? Math.round((p.price * (p.workerPayoutRate || 40)) / 100),
      downpaymentVerified: p.downpaymentStatus === "Verified",
    })),
  };
}
