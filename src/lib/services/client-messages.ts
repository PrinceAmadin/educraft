import type { MessageSide } from "@prisma/client";
import { db } from "@/lib/db";
import { notifyAdmins } from "@/lib/services/notifications";
import { notifyClient } from "@/lib/services/client-notify";
import { MESSAGE_MAX_LENGTH } from "@/lib/validations/client-portal";

/**
 * Client <-> EduCraft messages on a project. Workers never see these: anything
 * a worker needs from the client goes through an admin.
 */

export class MessageError extends Error {
  constructor(
    message: string,
    /** HTTP status for the route: 400 for a bad message, 429 when sending too fast. */
    readonly status: 400 | 404 | 429 = 400
  ) {
    super(message);
  }
}

export { MESSAGE_MAX_LENGTH };
const CLIENT_MESSAGES_PER_HOUR = 30;

export interface ThreadMessage {
  id: string;
  side: MessageSide;
  body: string;
  createdAt: string;
  /** Admin view: who on the team wrote it. The client always sees "EduCraft". */
  authorName: string | null;
}

/**
 * The whole thread, oldest first. Opening it marks the other side's messages
 * as read (that is what the unread counts count), unless `markRead` is false:
 * a page that renders the thread hidden (the admin project page mounts every
 * tab) or a preview must not clear the other side's unread count.
 */
export async function getThread(
  projectDbId: string,
  viewer: MessageSide,
  { markRead = true }: { markRead?: boolean } = {}
): Promise<ThreadMessage[]> {
  const other: MessageSide = viewer === "CLIENT" ? "ADMIN" : "CLIENT";
  if (markRead) {
    await db.projectMessage.updateMany({
      where: { projectId: projectDbId, authorSide: other, readAt: null },
      data: { readAt: new Date() },
    });
  }
  const rows = await db.projectMessage.findMany({
    where: { projectId: projectDbId },
    orderBy: { createdAt: "asc" },
    take: 300,
    select: {
      id: true,
      authorSide: true,
      body: true,
      createdAt: true,
      author: { select: { displayName: true, email: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    side: r.authorSide,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    authorName: viewer === "ADMIN" ? r.author.displayName ?? r.author.email : null,
  }));
}

export async function postMessage(input: {
  projectDbId: string;
  authorUserId: string;
  side: MessageSide;
  body: string;
}): Promise<ThreadMessage> {
  const body = input.body.trim();
  if (!body) throw new MessageError("Write a message first.");
  if (body.length > MESSAGE_MAX_LENGTH) throw new MessageError(`Keep messages under ${MESSAGE_MAX_LENGTH} characters.`);

  const project = await db.project.findUnique({ where: { id: input.projectDbId }, select: { id: true, projectId: true } });
  if (!project) throw new MessageError("Project not found", 404);

  if (input.side === "CLIENT") {
    const lastHour = await db.projectMessage.count({
      where: { projectId: project.id, authorSide: "CLIENT", createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (lastHour >= CLIENT_MESSAGES_PER_HOUR) {
      throw new MessageError("That's a lot of messages in an hour. Please wait a little, or reach us on WhatsApp.", 429);
    }
  }

  const row = await db.projectMessage.create({
    data: { projectId: project.id, authorUserId: input.authorUserId, authorSide: input.side, body },
    select: { id: true, authorSide: true, body: true, createdAt: true, author: { select: { displayName: true, email: true } } },
  });

  const preview = body.length > 140 ? `${body.slice(0, 137)}…` : body;
  if (input.side === "CLIENT") {
    await notifyAdmins({
      title: "New message from a client",
      message: `${project.projectId}: ${preview}`,
      type: "info",
      link: `/admin/projects/${project.projectId}?tab=messages`,
    });
  } else {
    await notifyClient(project.id, {
      title: "New message from EduCraft",
      message: preview,
      tab: "messages",
      email: {
        kind: "message",
        heading: "You have a new message from EduCraft",
        lines: [preview],
        ctaLabel: "Reply in your dashboard",
      },
    });
  }

  return {
    id: row.id,
    side: row.authorSide,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    authorName: input.side === "ADMIN" ? row.author.displayName ?? row.author.email : null,
  };
}

export interface InboxRow {
  projectDbId: string;
  projectCode: string;
  clientName: string;
  lastMessage: string;
  lastAt: string;
  /** Client messages the team has not opened yet. */
  unread: number;
}

/**
 * Threads waiting on EduCraft: the latest message is from the client. Oldest
 * waiting first, so nobody is left hanging.
 */
export async function listUnansweredThreads(): Promise<InboxRow[]> {
  const latest = await db.projectMessage.findMany({
    distinct: ["projectId"],
    orderBy: [{ projectId: "asc" }, { createdAt: "desc" }],
    select: {
      projectId: true,
      authorSide: true,
      body: true,
      createdAt: true,
      project: { select: { projectId: true, client: { select: { fullName: true } } } },
    },
  });
  const waiting = latest.filter((m) => m.authorSide === "CLIENT");
  if (waiting.length === 0) return [];
  const unread = await db.projectMessage.groupBy({
    by: ["projectId"],
    where: { projectId: { in: waiting.map((w) => w.projectId) }, authorSide: "CLIENT", readAt: null },
    _count: { _all: true },
  });
  const unreadBy = new Map(unread.map((u) => [u.projectId, u._count._all]));
  return waiting
    .map((m) => ({
      projectDbId: m.projectId,
      projectCode: m.project.projectId,
      clientName: m.project.client.fullName,
      lastMessage: m.body.length > 160 ? `${m.body.slice(0, 157)}…` : m.body,
      lastAt: m.createdAt.toISOString(),
      unread: unreadBy.get(m.projectId) ?? 0,
    }))
    .sort((a, b) => a.lastAt.localeCompare(b.lastAt));
}

/** For the Command Center: threads waiting on us, and how many for more than a day. */
export async function countUnansweredThreads(): Promise<{ total: number; overADay: number }> {
  const rows = await listUnansweredThreads();
  const dayAgo = Date.now() - 86_400_000;
  return { total: rows.length, overADay: rows.filter((r) => new Date(r.lastAt).getTime() < dayAgo).length };
}
