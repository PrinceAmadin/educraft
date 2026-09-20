import { db } from "@/lib/db";

/** The other record of a person who is both a worker and an ambassador on one login. */
export interface LinkedProfile {
  kind: "worker" | "ambassador";
  id: string;
  publicId: string;
  href: string;
}

export async function getLinkedAmbassador(userId: string | null): Promise<LinkedProfile | null> {
  if (!userId) return null;
  const row = await db.ambassador.findUnique({ where: { userId }, select: { id: true, ambassadorId: true } });
  return row ? { kind: "ambassador", id: row.id, publicId: row.ambassadorId, href: `/admin/ambassadors/${row.id}` } : null;
}

export async function getLinkedWorker(userId: string | null): Promise<LinkedProfile | null> {
  if (!userId) return null;
  const row = await db.worker.findUnique({ where: { userId }, select: { id: true, workerId: true } });
  return row ? { kind: "worker", id: row.id, publicId: row.workerId, href: `/admin/workers/${row.id}` } : null;
}
