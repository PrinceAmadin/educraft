import type { AmbassadorTier } from "@prisma/client";
import { db } from "@/lib/db";
import { activityStatus, type ActivityStatus } from "@/lib/ambassadors/tier-utils";
import { MAX_SUB_AMBASSADORS } from "@/lib/commission";

/**
 * The Network Map (Phase 3 Section 3): the Core/Sub structure as a card tree.
 * Every ambassador who has not been terminated appears once — a Core with
 * their Sub-team under them, or a solo ambassador. A Sub whose Core has left
 * (terminated) is shown as solo with a note, so nobody disappears.
 */

export interface NetworkPerson {
  id: string;
  code: string;
  fullName: string;
  tier: AmbassadorTier;
  schoolId: string;
  school: string | null;
  conversions: number;
  activity: ActivityStatus;
  /** Account state when it is not Active (Suspended, Paused, Lapsed). */
  accountStatus: string | null;
}

export interface NetworkCluster extends NetworkPerson {
  subs: NetworkPerson[];
  atCapacity: boolean;
}

export interface NetworkSolo extends NetworkPerson {
  /** Their Core was terminated; the link is kept for history. */
  formerCore: string | null;
}

export interface NetworkMap {
  clusters: NetworkCluster[];
  solos: NetworkSolo[];
  stats: { ambassadors: number; clusters: number; subs: number; averageSubs: number; atCapacity: number; maxSubs: number };
  schools: { id: string; abbreviation: string }[];
}

export async function getNetworkMap(now: Date = new Date()): Promise<NetworkMap> {
  const rows = await db.ambassador.findMany({
    where: { status: { not: "Terminated" } },
    select: {
      id: true,
      ambassadorId: true,
      fullName: true,
      tier: true,
      status: true,
      universityId: true,
      university: { select: { abbreviation: true } },
      lifetimeConversions: true,
      lastConversionAt: true,
      lastReferralAt: true,
      createdAt: true,
      parentId: true,
      parent: { select: { fullName: true, status: true } },
    },
  });
  const person = (a: (typeof rows)[number]): NetworkPerson => ({
    id: a.id,
    code: a.ambassadorId,
    fullName: a.fullName,
    tier: a.tier,
    schoolId: a.universityId,
    school: a.university?.abbreviation ?? null,
    conversions: a.lifetimeConversions,
    activity: activityStatus(a, now),
    accountStatus: a.status === "Active" ? null : a.status,
  });
  const present = new Set(rows.map((r) => r.id));
  const byParent = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) if (r.parentId && present.has(r.parentId)) byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r]);

  const bestFirst = (x: NetworkPerson, y: NetworkPerson) => y.conversions - x.conversions || x.fullName.localeCompare(y.fullName);
  const clusters: NetworkCluster[] = [];
  const solos: NetworkSolo[] = [];
  for (const r of rows) {
    if (r.parentId && present.has(r.parentId)) continue; // shown under their Core
    const kids = byParent.get(r.id) ?? [];
    if (kids.length > 0) {
      clusters.push({ ...person(r), subs: kids.map(person).sort(bestFirst), atCapacity: kids.length >= MAX_SUB_AMBASSADORS });
    } else {
      solos.push({ ...person(r), formerCore: r.parentId && !present.has(r.parentId) ? (r.parent?.fullName ?? "their Core") : null });
    }
  }
  clusters.sort(bestFirst);
  solos.sort(bestFirst);
  const subs = clusters.reduce((s, c) => s + c.subs.length, 0);
  const schoolMap = new Map<string, string>();
  for (const r of rows) if (r.university?.abbreviation) schoolMap.set(r.universityId, r.university.abbreviation);
  return {
    clusters,
    solos,
    stats: {
      ambassadors: rows.length,
      clusters: clusters.length,
      subs,
      averageSubs: clusters.length ? Math.round((subs / clusters.length) * 10) / 10 : 0,
      atCapacity: clusters.filter((c) => c.atCapacity).length,
      maxSubs: MAX_SUB_AMBASSADORS,
    },
    schools: [...schoolMap.entries()].map(([id, abbreviation]) => ({ id, abbreviation })).sort((a, b) => a.abbreviation.localeCompare(b.abbreviation)),
  };
}
