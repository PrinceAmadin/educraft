import type { Prisma, ProjectUpdateKind } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * The client's activity feed (ProjectUpdate rows). Only client-safe wording is
 * ever written here; the page reads nothing else.
 */

type Client = Prisma.TransactionClient | typeof db;

export interface UpdateInput {
  projectId: string;
  kind: ProjectUpdateKind;
  title: string;
  body?: string | null;
  /**
   * For system events: the same key twice is a no-op, so a webhook retry, a
   * double click or two racing callers can never write a line twice.
   */
  dedupeKey?: string;
  createdById?: string | null;
}

/** Works inside a transaction (pass `tx`) or on its own (pass `db`). Never throws on a repeat. */
export function recordUpdate(client: Client, input: UpdateInput) {
  return client.projectUpdate.createMany({
    data: [
      {
        projectId: input.projectId,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        dedupeKey: input.dedupeKey ?? null,
        createdById: input.createdById ?? null,
      },
    ],
    skipDuplicates: true,
  });
}

export interface ClientUpdateRow {
  id: string;
  kind: ProjectUpdateKind;
  title: string;
  body: string | null;
  createdAt: string;
  /** Admin view only: posted by hand (can be hidden). */
  manual: boolean;
  hidden: boolean;
}

export async function listUpdates(
  projectDbId: string,
  opts: { includeHidden?: boolean; take?: number } = {}
): Promise<ClientUpdateRow[]> {
  const rows = await db.projectUpdate.findMany({
    where: { projectId: projectDbId, ...(opts.includeHidden ? {} : { hiddenAt: null }) },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 60,
    select: { id: true, kind: true, title: true, body: true, createdAt: true, hiddenAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    manual: r.kind === "MANUAL",
    hidden: Boolean(r.hiddenAt),
  }));
}
