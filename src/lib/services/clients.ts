import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { TransitionError } from "@/lib/services/projects";

export const CLIENT_PAGE_SIZE = 20;

/** "Total spent" = every confirmed inbound payment on the client's projects. */
function spentFilter(): Prisma.PaymentWhereInput {
  return { direction: "INFLOW", status: "Confirmed" };
}

export interface ClientListRow {
  id: string;
  clientId: string;
  fullName: string;
  phone: string;
  university: string | null;
  department: string;
  projectsCount: number;
  totalSpent: number;
  lastActive: string | null;
}

export interface ClientListResult {
  rows: ClientListRow[];
  total: number;
  page: number;
  pageCount: number;
}

export async function listClients(params: {
  q?: string;
  page?: number;
}): Promise<ClientListResult> {
  const page = Math.max(1, params.page ?? 1);

  const where: Prisma.ClientWhereInput = params.q?.trim()
    ? {
        OR: [
          { fullName: { contains: params.q.trim(), mode: "insensitive" } },
          { phone: { contains: params.q.trim(), mode: "insensitive" } },
          { clientId: { contains: params.q.trim(), mode: "insensitive" } },
          { university: { name: { contains: params.q.trim(), mode: "insensitive" } } },
          { university: { abbreviation: { contains: params.q.trim(), mode: "insensitive" } } },
        ],
      }
    : {};

  const [clients, total] = await db.$transaction([
    db.client.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * CLIENT_PAGE_SIZE,
      take: CLIENT_PAGE_SIZE,
      select: {
        id: true,
        clientId: true,
        fullName: true,
        phone: true,
        department: true,
        university: { select: { abbreviation: true } },
        projects: { select: { id: true, updatedAt: true, createdAt: true } },
      },
    }),
    db.client.count({ where }),
  ]);

  // Total spent per client — one grouped payment query for the whole page.
  const clientIds = clients.map((c) => c.id);
  const spentByClient = new Map<string, number>();

  if (clientIds.length > 0) {
    const grouped = await db.payment.groupBy({
      by: ["projectId"],
      where: { ...spentFilter(), project: { clientId: { in: clientIds } } },
      _sum: { amount: true },
    });

    // Map projectId → clientId
    const projects = await db.project.findMany({
      where: { id: { in: grouped.map((g) => g.projectId).filter((x): x is string => x != null) } },
      select: { id: true, clientId: true },
    });
    const projectToClient = new Map(projects.map((p) => [p.id, p.clientId]));

    for (const g of grouped) {
      if (!g.projectId) continue;
      const clientId = projectToClient.get(g.projectId);
      if (!clientId) continue;
      spentByClient.set(clientId, (spentByClient.get(clientId) ?? 0) + (g._sum.amount ?? 0));
    }
  }

  const rows: ClientListRow[] = clients.map((c) => {
    const timestamps = c.projects.map((p) => p.updatedAt.getTime());
    const lastActive =
      timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;

    return {
      id: c.id,
      clientId: c.clientId,
      fullName: c.fullName,
      phone: c.phone,
      university: c.university?.abbreviation ?? null,
      department: c.department,
      projectsCount: c.projects.length,
      totalSpent: spentByClient.get(c.id) ?? 0,
      lastActive,
    };
  });

  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / CLIENT_PAGE_SIZE)) };
}

const clientDetailInclude = {
  university: true,
  referredBy: { select: { id: true, ambassadorId: true, fullName: true, tier: true } },
  projects: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      projectId: true,
      projectTitle: true,
      status: true,
      price: true,
      downpaymentStatus: true,
      balanceStatus: true,
      internalDeadline: true,
      clientDeadline: true,
      createdAt: true,
      service: { select: { serviceName: true } },
      worker: { select: { fullName: true } },
    },
  },
} satisfies Prisma.ClientInclude;

export type ClientDetail = Prisma.ClientGetPayload<{ include: typeof clientDetailInclude }>;

export interface ClientDetailWithStats {
  client: ClientDetail;
  stats: {
    totalProjects: number;
    totalSpent: number;
    firstOrderDate: string | null;
  };
}

export async function getClientDetail(id: string): Promise<ClientDetailWithStats | null> {
  const client = await db.client.findUnique({
    where: { id },
    include: clientDetailInclude,
  });
  if (!client) return null;

  const spent = await db.payment.aggregate({
    _sum: { amount: true },
    where: { ...spentFilter(), project: { clientId: client.id } },
  });

  const firstOrder = client.projects.reduce<Date | null>((earliest, p) => {
    if (!earliest || p.createdAt < earliest) return p.createdAt;
    return earliest;
  }, null);

  return {
    client,
    stats: {
      totalProjects: client.projects.length,
      totalSpent: spent._sum.amount ?? 0,
      firstOrderDate: firstOrder ? firstOrder.toISOString() : null,
    },
  };
}

export async function updateClientNotes(id: string, notes: string) {
  const client = await db.client.findUnique({ where: { id }, select: { id: true } });
  if (!client) throw new TransitionError("Client not found");

  return db.client.update({
    where: { id },
    data: { notes: notes.trim() || null },
    select: { notes: true },
  });
}

/** Typeahead for the "select existing client" control on the new-project form. */
export async function searchClientsForPicker(q: string) {
  const term = q.trim();
  if (term.length < 2) return [];

  return db.client
    .findMany({
      where: {
        OR: [
          { fullName: { contains: term, mode: "insensitive" } },
          { phone: { contains: term, mode: "insensitive" } },
          { clientId: { contains: term, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        clientId: true,
        fullName: true,
        phone: true,
        department: true,
        university: { select: { abbreviation: true } },
      },
    })
    .then((rows) =>
      rows.map((r) => ({
        id: r.id,
        clientId: r.clientId,
        fullName: r.fullName,
        phone: r.phone,
        department: r.department,
        university: r.university?.abbreviation ?? null,
      }))
    );
}
