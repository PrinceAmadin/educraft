import { db } from "@/lib/db";
import { releaseCommission } from "@/lib/services/ambassador-commission";
import { IntakeError, submitIntake } from "@/lib/services/intake";
import {
  hashDeviceSecret,
  newInviteToken,
  proBonoFinancials,
} from "@/lib/pro-bono";
import type { IntakeSubmitInput } from "@/lib/validations/intake";

export class ProBonoError extends Error {}

// ─────────────────────────────────────────────────────────────
// Admin side — invites
// ─────────────────────────────────────────────────────────────

export type InviteStatus = "OPEN" | "USED" | "REVOKED";

export interface ProBonoInviteRow {
  id: string;
  token: string;
  serviceCode: string;
  serviceName: string;
  recipient: string;
  reason: string | null;
  status: InviteStatus;
  /** True once a device has opened the link and been locked to it. */
  bound: boolean;
  boundAt: Date | null;
  usedAt: Date | null;
  createdAt: Date;
  projectCode: string | null;
}

export async function createInvite(
  input: { serviceCode: string; recipient: string; reason?: string },
  createdById: string
): Promise<ProBonoInviteRow> {
  const service = await db.service.findFirst({
    where: { serviceCode: input.serviceCode, isActive: true },
    select: { serviceName: true, intakeFormTemplate: true },
  });
  if (!service) throw new ProBonoError("That service is not available");

  const invite = await db.proBonoInvite.create({
    data: {
      token: newInviteToken(),
      serviceCode: input.serviceCode,
      recipient: input.recipient.trim(),
      reason: input.reason?.trim() || null,
      createdById,
    },
  });
  return toRow(invite, service.serviceName, null);
}

function toRow(
  i: {
    id: string;
    token: string;
    serviceCode: string;
    recipient: string;
    reason: string | null;
    status: string;
    deviceHash: string | null;
    boundAt: Date | null;
    usedAt: Date | null;
    createdAt: Date;
  },
  serviceName: string,
  projectCode: string | null
): ProBonoInviteRow {
  return {
    id: i.id,
    token: i.token,
    serviceCode: i.serviceCode,
    serviceName,
    recipient: i.recipient,
    reason: i.reason,
    status: i.status as InviteStatus,
    bound: Boolean(i.deviceHash),
    boundAt: i.boundAt,
    usedAt: i.usedAt,
    createdAt: i.createdAt,
    projectCode,
  };
}

export async function listInvites(): Promise<ProBonoInviteRow[]> {
  const [invites, services] = await Promise.all([
    db.proBonoInvite.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { project: { select: { projectId: true } } },
    }),
    db.service.findMany({ select: { serviceCode: true, serviceName: true } }),
  ]);
  const names = new Map(services.map((s) => [s.serviceCode, s.serviceName]));
  return invites.map((i) =>
    toRow(i, names.get(i.serviceCode) ?? i.serviceCode, i.project?.projectId ?? null)
  );
}

export async function revokeInvite(id: string): Promise<void> {
  const res = await db.proBonoInvite.updateMany({
    where: { id, status: "OPEN" },
    data: { status: "REVOKED" },
  });
  if (res.count === 0) throw new ProBonoError("Only an unused link can be revoked");
}

/**
 * Frees an unused link from the device it is locked to, so the client can open
 * it again on another phone (e.g. they opened it inside WhatsApp, then wanted
 * their normal browser). A used link cannot be reset.
 */
export async function resetInviteDevice(id: string): Promise<void> {
  const res = await db.proBonoInvite.updateMany({
    where: { id, status: "OPEN" },
    data: { deviceHash: null, boundAt: null },
  });
  if (res.count === 0) throw new ProBonoError("Only an unused link can be reset");
}

// ─────────────────────────────────────────────────────────────
// Public side — opening and submitting
// ─────────────────────────────────────────────────────────────

export type LinkState =
  | { state: "invalid" }
  | { state: "revoked" }
  | { state: "used" }
  /** Nobody has opened it yet; the browser must claim it. */
  | { state: "unclaimed"; inviteId: string }
  /** This device owns the link. */
  | { state: "ready"; inviteId: string; serviceCode: string; recipient: string }
  /** Another device owns the link. */
  | { state: "locked" };

/**
 * Where a link stands for the browser holding `deviceSecret` (null = no
 * cookie). Read-only — merely loading the page (a link-preview crawler, say)
 * never binds it; only {@link claimInvite} does.
 */
export async function getLinkState(token: string, deviceSecret: string | null): Promise<LinkState> {
  const invite = await db.proBonoInvite.findUnique({ where: { token } });
  if (!invite) return { state: "invalid" };
  if (invite.status === "REVOKED") return { state: "revoked" };
  if (invite.status === "USED") return { state: "used" };
  if (!invite.deviceHash) return { state: "unclaimed", inviteId: invite.id };
  if (deviceSecret && hashDeviceSecret(deviceSecret) === invite.deviceHash) {
    return { state: "ready", inviteId: invite.id, serviceCode: invite.serviceCode, recipient: invite.recipient };
  }
  return { state: "locked" };
}

/**
 * First browser to call this owns the link. The conditional update makes the
 * bind atomic: two devices racing get exactly one winner.
 */
export async function claimInvite(
  token: string,
  deviceSecret: string
): Promise<"claimed" | "locked" | "used" | "revoked" | "invalid"> {
  const invite = await db.proBonoInvite.findUnique({ where: { token } });
  if (!invite) return "invalid";
  if (invite.status === "REVOKED") return "revoked";
  if (invite.status === "USED") return "used";

  const hash = hashDeviceSecret(deviceSecret);
  if (invite.deviceHash) return invite.deviceHash === hash ? "claimed" : "locked";

  const res = await db.proBonoInvite.updateMany({
    where: { id: invite.id, status: "OPEN", deviceHash: null },
    data: { deviceHash: hash, boundAt: new Date() },
  });
  if (res.count === 1) return "claimed";

  const fresh = await db.proBonoInvite.findUnique({ where: { id: invite.id } });
  return fresh?.deviceHash === hash ? "claimed" : "locked";
}

/**
 * Submits the intake through a link. The link is consumed first (atomically,
 * only by the bound device, only once) and handed back if the project fails to
 * be created, so a validation hiccup never burns the client's only link.
 */
export async function submitThroughInvite(
  token: string,
  deviceSecret: string | null,
  input: IntakeSubmitInput
): Promise<{ projectId: string; clientId: string }> {
  if (!deviceSecret) throw new ProBonoError("This link is locked to another device");

  const invite = await db.proBonoInvite.findUnique({ where: { token } });
  if (!invite) throw new ProBonoError("This link is not valid");
  if (invite.status === "REVOKED") throw new ProBonoError("This link is no longer active");
  if (invite.status === "USED") throw new ProBonoError("This link has already been used");

  const hash = hashDeviceSecret(deviceSecret);
  const consumed = await db.proBonoInvite.updateMany({
    where: { id: invite.id, status: "OPEN", deviceHash: hash },
    data: { status: "USED", usedAt: new Date() },
  });
  if (consumed.count === 0) throw new ProBonoError("This link is locked to another device");

  try {
    // The link decides the service, never the request body.
    return await submitIntake(
      { ...input, serviceCode: invite.serviceCode, referralCode: "", isExpressDelivery: false },
      { proBono: { inviteId: invite.id, reason: invite.reason } }
    );
  } catch (error) {
    // A failure after the project was written (a notification, say) must not
    // reopen the link — the submission did go through.
    const created = await db.project.findUnique({
      where: { proBonoInviteId: invite.id },
      select: { projectId: true, client: { select: { clientId: true } } },
    });
    if (created) return { projectId: created.projectId, clientId: created.client.clientId };
    await db.proBonoInvite.update({
      where: { id: invite.id },
      data: { status: "OPEN", usedAt: null },
    });
    if (error instanceof IntakeError) throw new ProBonoError(error.message);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────
// Admin side — mark an existing project pro bono
// ─────────────────────────────────────────────────────────────

/**
 * Turns an existing project into a pro bono one: price and payment legs go to
 * nothing, any ambassador commission (and its expense) is released, and a job
 * still waiting on its downpayment moves on. Refused once real money or a
 * payout is on the books, since erasing that would falsify the accounts.
 */
export async function markProjectProBono(
  idOrCode: string,
  reason: string,
  changedById: string
): Promise<{ projectId: string }> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: {
      id: true,
      projectId: true,
      status: true,
      isProBono: true,
      workerPayoutPaid: true,
      ambassadorCommPaid: true,
      parentCommPaid: true,
      ambassadorId: true,
      ambassadorCommission: true,
      parentCommission: true,
      // Money actually in (a marked-but-unverified or refused payment is not money).
      _count: { select: { payments: { where: { status: { in: ["Confirmed", "Duplicate"] } } } } },
    },
  });
  if (!project) throw new ProBonoError("Project not found");
  if (project.isProBono) throw new ProBonoError("This project is already pro bono");
  if (["CANCELLED", "REFUNDED", "COMPLETED"].includes(project.status)) {
    throw new ProBonoError("A closed project can't be made pro bono");
  }
  if (project._count.payments > 0) {
    throw new ProBonoError(
      "This project already has money recorded against it. Refund it first, so the accounts stay true."
    );
  }
  const hasPaidCommission =
    (project.ambassadorCommission != null && project.ambassadorCommPaid) ||
    (project.parentCommission != null && project.parentCommPaid);
  if (hasPaidCommission) {
    throw new ProBonoError("A commission on this project was already paid out");
  }

  const advanceTo =
    project.status === "NEW"
      ? ("DOWNPAYMENT_VERIFIED" as const)
      : project.status === "APPROVED"
        ? ("BALANCE_VERIFIED" as const)
        : null;

  await db.$transaction(async (tx) => {
    await releaseCommission(tx, project.id);
    await tx.project.update({
      where: { id: project.id },
      data: {
        ...proBonoFinancials(),
        proBonoReason: reason.trim(),
        ...(advanceTo ? { status: advanceTo } : {}),
      },
    });
    await tx.projectStatusLog.create({
      data: {
        projectId: project.id,
        fromStatus: project.status,
        toStatus: advanceTo ?? project.status,
        changedById,
        notes: `Marked pro bono: ${reason.trim()}`,
      },
    });
  });

  return { projectId: project.projectId };
}

/** The invite's id for a token — needed to name its device cookie. */
export async function inviteIdForToken(token: string): Promise<string | null> {
  const invite = await db.proBonoInvite.findUnique({ where: { token }, select: { id: true } });
  return invite?.id ?? null;
}
