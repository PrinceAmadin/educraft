import type { ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { ClientScope } from "@/lib/api";
import {
  clientProgress,
  deliveryCountdown,
  type ClientProgress,
  type DeliveryCountdown,
} from "@/lib/client-progress";
import { balancePayable, downpaymentDue } from "@/lib/payment-rules";
import { resyncPaystackReference } from "@/lib/services/paystack-payments";
import { ensureDeliverables } from "@/lib/services/deliverables";
import { deliverableGate, type LockReason } from "@/lib/files/policy";

/**
 * Everything a client page reads comes through here. Two rules:
 *  1. Every query is scoped to the caller's own Client rows (`scope.clientIds`);
 *     a project that is not theirs is simply "not found".
 *  2. Only whitelisted fields leave this file: never internal notes, QA notes,
 *     the status log, the worker's identity, commissions or internalDeadline.
 */

function readCode(code: string): string {
  try {
    return decodeURIComponent(code).trim().toUpperCase();
  } catch {
    return code.trim().toUpperCase();
  }
}

/** One of this client's projects by its code (EC-00008), or null. */
export async function findClientProject(
  scope: ClientScope,
  code: string
): Promise<{ id: string; projectId: string } | null> {
  return db.project.findFirst({
    where: { projectId: readCode(code), clientId: { in: scope.clientIds } },
    select: { id: true, projectId: true },
  });
}

type ResearchState = "none" | "running" | "done";

function researchState(job: { status: string } | null): ResearchState {
  if (!job) return "none";
  return job.status === "PASSED" ? "done" : "running";
}

const viewSelect = {
  id: true,
  projectId: true,
  projectTitle: true,
  status: true,
  isProBono: true,
  price: true,
  downpaymentAmount: true,
  downpaymentStatus: true,
  balanceAmount: true,
  balanceStatus: true,
  expectedDeliveryAt: true,
  deadlinePausedAt: true,
  createdAt: true,
  service: { select: { serviceName: true } },
  researchJob: { select: { status: true } },
  deliverables: {
    where: { archivedAt: null, kind: "CHAPTER" },
    select: { versions: { where: { releaseNo: { not: null } }, select: { id: true }, take: 1 } },
  },
} as const;

type ViewRow = {
  id: string;
  projectId: string;
  projectTitle: string | null;
  status: ProjectStatus;
  isProBono: boolean;
  price: number;
  downpaymentAmount: number;
  downpaymentStatus: string;
  balanceAmount: number;
  balanceStatus: string;
  expectedDeliveryAt: Date | null;
  deadlinePausedAt: Date | null;
  createdAt: Date;
  service: { serviceName: string };
  researchJob: { status: string } | null;
  deliverables: { versions: { id: string }[] }[];
};

export interface ClientProjectView {
  id: string;
  code: string;
  title: string;
  serviceName: string;
  status: ProjectStatus;
  isProBono: boolean;
  price: number;
  downpaymentAmount: number;
  downpaymentStatus: string;
  balanceAmount: number;
  balanceStatus: string;
  createdAt: string;
  progress: ClientProgress;
  countdown: { date: string | null; label: string; tone: DeliveryCountdown["tone"] };
  canPayDownpayment: boolean;
  canPayBalance: boolean;
  /** Messages from EduCraft the client has not opened yet. */
  unreadMessages: number;
  /** What paying the balance opens for download, in the order's own words ("Chapters 3 to 5 and your complete project"). */
  balanceUnlocks: string | null;
  /** How many items that is (for "it's" vs "each is"). */
  balanceUnlockCount: number;
}

async function heldFromFor(projectDbId: string, status: ProjectStatus): Promise<ProjectStatus | null> {
  if (status !== "ON_HOLD" && status !== "DISPUTED") return null;
  const log = await db.projectStatusLog.findFirst({
    where: { projectId: projectDbId, toStatus: status },
    orderBy: { createdAt: "desc" },
    select: { fromStatus: true },
  });
  return log?.fromStatus ?? null;
}

function toView(row: ViewRow, heldFrom: ProjectStatus | null, unreadMessages: number): ClientProjectView {
  const progress = clientProgress({
    status: row.status,
    isProBono: row.isProBono,
    downpaymentStatus: row.downpaymentStatus,
    balanceStatus: row.balanceStatus,
    research: researchState(row.researchJob),
    heldFrom,
    chapters: {
      ready: row.deliverables.filter((d) => d.versions.length > 0).length,
      total: row.deliverables.length,
    },
  });
  const countdown = deliveryCountdown({
    expectedDeliveryAt: row.expectedDeliveryAt,
    deadlinePausedAt: row.deadlinePausedAt,
    status: row.status,
  });
  return {
    id: row.id,
    code: row.projectId,
    title: row.projectTitle?.trim() || row.service.serviceName,
    serviceName: row.service.serviceName,
    status: row.status,
    isProBono: row.isProBono,
    price: row.price,
    downpaymentAmount: row.downpaymentAmount,
    downpaymentStatus: row.downpaymentStatus,
    balanceAmount: row.balanceAmount,
    balanceStatus: row.balanceStatus,
    createdAt: row.createdAt.toISOString(),
    progress,
    countdown: { date: countdown.date ? countdown.date.toISOString() : null, label: countdown.label, tone: countdown.tone },
    canPayDownpayment: downpaymentDue(row),
    canPayBalance: balancePayable(row),
    unreadMessages,
    balanceUnlocks: null,
    balanceUnlockCount: 0,
  };
}

/** "Chapter 3", "Chapter 4", "Complete project" -> "Chapters 3 to 4 and your complete project". */
export function describeUnlocks(titles: string[]): string | null {
  if (titles.length === 0) return null;
  const chapters = titles
    .map((t) => /^Chapter (\d+)$/.exec(t))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
  const others = titles.filter((t) => !/^Chapter \d+$/.test(t)).map((t) => `your ${t.toLowerCase()}`);
  const and = (items: string[]) => (items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
  const parts: string[] = [];
  if (chapters.length === 1) parts.push(`Chapter ${chapters[0]}`);
  else if (chapters.length > 1) {
    const consecutive = chapters.every((c, i) => i === 0 || c === chapters[i - 1] + 1);
    parts.push(
      consecutive
        ? `Chapters ${chapters[0]} to ${chapters[chapters.length - 1]}`
        : `Chapters ${others.length ? chapters.join(", ") : and(chapters.map(String))}`
    );
  }
  parts.push(...others);
  return and(parts);
}

async function unreadFromEduCraft(projectDbIds: string[]): Promise<Map<string, number>> {
  if (projectDbIds.length === 0) return new Map();
  const groups = await db.projectMessage.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectDbIds }, authorSide: "ADMIN", readAt: null },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.projectId, g._count._all]));
}

export async function getClientProjectView(scope: ClientScope, code: string): Promise<ClientProjectView | null> {
  const row = await db.project.findFirst({
    where: { projectId: readCode(code), clientId: { in: scope.clientIds } },
    select: viewSelect,
  });
  if (!row) return null;
  await ensureDeliverables(row.id);
  const [heldFrom, unread, balanceItems] = await Promise.all([
    heldFromFor(row.id, row.status),
    unreadFromEduCraft([row.id]),
    db.projectDeliverable.findMany({
      where: { projectId: row.id, archivedAt: null, access: "BALANCE" },
      orderBy: { sortOrder: "asc" },
      select: { title: true },
    }),
  ]);
  return {
    ...toView(row, heldFrom, unread.get(row.id) ?? 0),
    balanceUnlocks: describeUnlocks(balanceItems.map((d) => d.title)),
    balanceUnlockCount: balanceItems.length,
  };
}

export type ClientCardGroup = "active" | "awaiting_payment" | "finished" | "closed";

export interface ClientProjectCard extends ClientProjectView {
  /** What the client should do next, if anything ("Pay your balance"). */
  nextAction: string | null;
  /** Which section of the dashboard it sits in. */
  group: ClientCardGroup;
}

function cardGroup(view: ClientProjectView): ClientCardGroup {
  if (view.status === "CANCELLED" || view.status === "REFUNDED") return "closed";
  if (view.status === "DELIVERED" || view.status === "COMPLETED") return "finished";
  if (view.canPayDownpayment) return "awaiting_payment";
  return "active";
}

/**
 * The client's projects: work under way first (those waiting on the client at
 * the top), then orders not paid for yet, then delivered, then closed. Newest
 * first within each.
 */
export async function listClientProjectCards(scope: ClientScope): Promise<ClientProjectCard[]> {
  const rows = await db.project.findMany({
    where: { clientId: { in: scope.clientIds } },
    orderBy: { createdAt: "desc" },
    select: viewSelect,
  });
  const unread = await unreadFromEduCraft(rows.map((r) => r.id));
  const cards = await Promise.all(
    rows.map(async (row) => {
      const view = toView(row, await heldFromFor(row.id, row.status), unread.get(row.id) ?? 0);
      let nextAction: string | null = null;
      if (view.canPayDownpayment) nextAction = "Pay your downpayment";
      else if (view.status === "AWAITING_CLIENT_INPUT") nextAction = "We need something from you";
      else if (view.unreadMessages > 0) nextAction = view.unreadMessages === 1 ? "1 new message" : `${view.unreadMessages} new messages`;
      else if (view.status === "APPROVED" && view.canPayBalance) nextAction = "Pay your balance to unlock delivery";
      return { ...view, nextAction, group: cardGroup(view) };
    })
  );
  const rank: Record<ClientCardGroup, number> = { active: 0, awaiting_payment: 1, finished: 2, closed: 3 };
  return cards.sort(
    (a, b) =>
      rank[a.group] - rank[b.group] ||
      Number(Boolean(b.nextAction)) - Number(Boolean(a.nextAction)) ||
      b.createdAt.localeCompare(a.createdAt)
  );
}

// ── Payments ─────────────────────────────────────────────────

export interface ClientPaymentRow {
  id: string;
  receiptNo: string;
  leg: "downpayment" | "balance";
  amount: number;
  /** Duplicate = paid twice (a refund is due); Refunded = sent back. Only Confirmed counts as paid. */
  status: "Confirmed" | "Pending" | "Duplicate" | "Refunded";
  method: string | null;
  date: string;
}

/**
 * Confirmed payments (with receipts) and checkouts still being confirmed. A
 * checkout left pending for more than two days was never paid (Paystack
 * checkouts don't last that long), so it is left out rather than shown as
 * "being confirmed" forever.
 */
export async function getClientPayments(projectDbId: string): Promise<ClientPaymentRow[]> {
  const rows = await db.payment.findMany({
    where: {
      projectId: projectDbId,
      direction: "INFLOW",
      type: { in: ["CLIENT_DOWNPAYMENT", "CLIENT_BALANCE"] },
      OR: [
        { status: { in: ["Confirmed", "Duplicate", "Reversed"] } },
        // A Paystack checkout still open, or a bank transfer the team is confirming.
        { status: "Pending", source: "PAYSTACK", date: { gte: new Date(Date.now() - 48 * 3_600_000) } },
        { status: "Pending", source: "MANUAL" },
      ],
    },
    orderBy: { date: "desc" },
    select: { id: true, paymentId: true, type: true, amount: true, status: true, paymentMethod: true, date: true },
  });
  return rows.map((r) => ({
    id: r.id,
    receiptNo: r.paymentId,
    leg: r.type === "CLIENT_BALANCE" ? "balance" : "downpayment",
    amount: r.amount,
    status: r.status === "Confirmed" ? "Confirmed" : r.status === "Duplicate" ? "Duplicate" : r.status === "Reversed" ? "Refunded" : "Pending",
    method: r.paymentMethod,
    date: r.date.toISOString(),
  }));
}

/**
 * Back from Paystack: ask Paystack directly about this project's recent
 * checkouts instead of waiting for the webhook (which can lag, or never come
 * in test mode). Checks the returned reference when it belongs to this
 * project, else at most two recent pending checkouts. Never throws.
 */
export async function reconcileClientPayments(projectDbId: string, reference?: string | null): Promise<void> {
  try {
    const pending = await db.payment.findMany({
      where: {
        projectId: projectDbId,
        status: "Pending",
        source: "PAYSTACK",
        reference: reference ? reference : { not: null },
        date: { gte: new Date(Date.now() - 48 * 3_600_000) },
      },
      orderBy: { date: "desc" },
      take: 2,
      select: { reference: true },
    });
    for (const p of pending) {
      if (!p.reference) continue;
      await resyncPaystackReference(p.reference).catch((error) =>
        console.warn("[client-portal] could not confirm", p.reference, error instanceof Error ? error.message : error)
      );
    }
  } catch (error) {
    console.error("[client-portal] reconcile", error);
  }
}

// ── Receipts ─────────────────────────────────────────────────

export interface ReceiptData {
  receiptNo: string;
  date: Date;
  amount: number;
  leg: "downpayment" | "balance";
  method: string | null;
  reference: string | null;
  clientName: string;
  clientId: string;
  projectCode: string;
  projectTitle: string;
  serviceName: string;
  price: number;
  paidToDate: number;
  remaining: number;
}

/** A confirmed payment on one of this client's projects, ready to print. */
export async function getReceiptData(scope: ClientScope, code: string, paymentDbId: string): Promise<ReceiptData | null> {
  const project = await db.project.findFirst({
    where: { projectId: readCode(code), clientId: { in: scope.clientIds } },
    select: {
      id: true,
      projectId: true,
      projectTitle: true,
      price: true,
      service: { select: { serviceName: true } },
      client: { select: { fullName: true, clientId: true } },
      payments: {
        where: { direction: "INFLOW", status: "Confirmed", type: { in: ["CLIENT_DOWNPAYMENT", "CLIENT_BALANCE"] } },
        orderBy: { date: "asc" },
        select: { id: true, paymentId: true, type: true, amount: true, paymentMethod: true, reference: true, date: true },
      },
    },
  });
  if (!project) return null;
  const index = project.payments.findIndex((p) => p.id === paymentDbId);
  if (index < 0) return null;
  const payment = project.payments[index];
  const paidToDate = project.payments.slice(0, index + 1).reduce((sum, p) => sum + p.amount, 0);
  return {
    receiptNo: payment.paymentId,
    date: payment.date,
    amount: payment.amount,
    leg: payment.type === "CLIENT_BALANCE" ? "balance" : "downpayment",
    method: payment.paymentMethod,
    reference: payment.reference,
    clientName: project.client.fullName,
    clientId: project.client.clientId,
    projectCode: project.projectId,
    projectTitle: project.projectTitle?.trim() || project.service.serviceName,
    serviceName: project.service.serviceName,
    price: project.price,
    paidToDate,
    remaining: Math.max(0, project.price - paidToDate),
  };
}

// ── Documents ────────────────────────────────────────────────

export interface ClientDocumentVersion {
  fileId: string;
  releaseNo: number;
  releasedAt: string;
}

export interface ClientDocument {
  id: string;
  title: string;
  isFinal: boolean;
  state: "not-ready" | "open" | "locked";
  lockReason: LockReason | null;
  /** The newest released version (null until one is released). */
  current: ClientDocumentVersion | null;
  /** Older releases, newest first: shown by release number only. */
  earlier: ClientDocumentVersion[];
  /** For an item not released yet: when it will open, in client words. */
  notReadyHint: string;
}

function notReadyHint(access: string, project: { downpaymentStatus: string; balanceStatus: string }): string {
  if (access === "BALANCE" && project.balanceStatus !== "Verified") return "Not ready yet · downloads once your balance is paid";
  if (access === "DOWNPAYMENT" && project.downpaymentStatus !== "Verified") return "Not ready yet · downloads once your downpayment is in";
  return "Not ready yet · we'll let you know the moment it is";
}

/**
 * The project's chapters and documents as the client sees them: only
 * released versions, numbered by release (never internal upload counts),
 * with the payment lock applied by the same rule the download route uses.
 */
export async function getClientDocuments(projectDbId: string): Promise<ClientDocument[]> {
  await ensureDeliverables(projectDbId);
  const project = await db.project.findUnique({
    where: { id: projectDbId },
    select: {
      status: true,
      downpaymentStatus: true,
      balanceStatus: true,
      deliverables: {
        where: { archivedAt: null },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          kind: true,
          access: true,
          versions: {
            where: { releaseNo: { not: null }, file: { deletedAt: null } },
            orderBy: { releaseNo: "desc" },
            select: { releaseNo: true, releasedAt: true, fileId: true },
          },
        },
      },
    },
  });
  if (!project) return [];
  return project.deliverables.map((d) => {
    const versions = d.versions.map((v) => ({
      fileId: v.fileId,
      releaseNo: v.releaseNo ?? 0,
      releasedAt: (v.releasedAt ?? new Date(0)).toISOString(),
    }));
    const gate = deliverableGate(versions.length > 0, d.access, project);
    return {
      id: d.id,
      title: d.title,
      isFinal: d.kind === "FINAL",
      state: gate.state === "hidden" ? "not-ready" : gate.state,
      lockReason: gate.state === "locked" ? gate.reason : null,
      current: versions[0] ?? null,
      earlier: versions.slice(1),
      notReadyHint: notReadyHint(d.access, project),
    };
  });
}
