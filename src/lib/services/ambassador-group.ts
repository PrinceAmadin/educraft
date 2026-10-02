import { db } from "@/lib/db";
import { hashDeviceSecret, newInviteToken } from "@/lib/pro-bono";

/**
 * Device-locked WhatsApp group invites for ambassadors (Oct 2026).
 *
 * Same first-device-binding pattern as pro-bono one-time links: the first
 * browser to open /ambassador-group/{token} is bound to it (only the sha256 of
 * a random cookie is stored), and any other device is refused. The link is a
 * WRAPPER — at "ready" the page redirects to the CURRENT group URL in Settings,
 * so the CEO can change the group link and every ambassador's wrapper follows.
 *
 * The HOG/CEO can reset the device (if the ambassador first opened it on the
 * wrong device), revoke it, or regenerate (mint a new token and revoke the old).
 *
 * Note: a device-locked wrapper stops casual resharing of OUR link, but once the
 * bound device loads the real chat.whatsapp.com URL that URL is visible in the
 * browser — WhatsApp controls who the group link lets in, not us.
 */

export class AmbassadorGroupError extends Error {}

export const GROUP_DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Cookie holding this browser's secret for one group invite. One per invite. */
export function groupDeviceCookieName(inviteId: string): string {
  return `ec_ag_${inviteId.slice(-10)}`;
}

/** A group invite is "active" until it is revoked or replaced. */
const ACTIVE = { status: { in: ["OPEN", "BOUND"] } };

export interface GroupInviteView {
  token: string;
  status: "OPEN" | "BOUND" | "REVOKED";
  /** True once a device has opened the link and been locked to it. */
  bound: boolean;
  boundAt: Date | null;
  createdAt: Date;
}

function toView(i: { token: string; status: string; deviceHash: string | null; boundAt: Date | null; createdAt: Date }): GroupInviteView {
  return {
    token: i.token,
    status: i.status as GroupInviteView["status"],
    bound: Boolean(i.deviceHash),
    boundAt: i.boundAt,
    createdAt: i.createdAt,
  };
}

// ── Admin side ──────────────────────────────────────────────────

/** The ambassador's current (active) group invite, or null if they have none. */
export async function getGroupInvite(ambassadorId: string): Promise<GroupInviteView | null> {
  const invite = await db.ambassadorGroupInvite.findFirst({
    where: { ambassadorId, ...ACTIVE },
    orderBy: { createdAt: "desc" },
  });
  return invite ? toView(invite) : null;
}

/**
 * The ambassador's active invite token, minting one if they have none. Called
 * on approval (to put the link in the welcome email) and by the admin controls.
 */
export async function ensureGroupInvite(ambassadorId: string, createdById?: string): Promise<string> {
  const existing = await db.ambassadorGroupInvite.findFirst({ where: { ambassadorId, ...ACTIVE }, select: { token: true } });
  if (existing) return existing.token;
  const created = await db.ambassadorGroupInvite.create({
    data: { token: newInviteToken(), ambassadorId, createdById: createdById ?? null },
    select: { token: true },
  });
  return created.token;
}

/** Revoke the current invite and mint a fresh one (new token, unbound). */
export async function regenerateGroupInvite(ambassadorId: string, createdById?: string): Promise<string> {
  const ambassador = await db.ambassador.findUnique({ where: { id: ambassadorId }, select: { id: true } });
  if (!ambassador) throw new AmbassadorGroupError("Ambassador not found");
  return db.$transaction(async (tx) => {
    await tx.ambassadorGroupInvite.updateMany({ where: { ambassadorId, ...ACTIVE }, data: { status: "REVOKED" } });
    const created = await tx.ambassadorGroupInvite.create({
      data: { token: newInviteToken(), ambassadorId, createdById: createdById ?? null },
      select: { token: true },
    });
    return created.token;
  });
}

/** Free the active invite from the device it is locked to, so it can be opened on another phone. */
export async function resetGroupDevice(ambassadorId: string): Promise<void> {
  const res = await db.ambassadorGroupInvite.updateMany({
    where: { ambassadorId, ...ACTIVE },
    data: { deviceHash: null, boundAt: null, status: "OPEN" },
  });
  if (res.count === 0) throw new AmbassadorGroupError("No active group link to reset");
}

/** Revoke the active invite so the link stops working everywhere. */
export async function revokeGroupInvite(ambassadorId: string): Promise<void> {
  const res = await db.ambassadorGroupInvite.updateMany({ where: { ambassadorId, ...ACTIVE }, data: { status: "REVOKED" } });
  if (res.count === 0) throw new AmbassadorGroupError("No active group link to revoke");
}

// ── Public side ─────────────────────────────────────────────────

export type GroupLinkState =
  | { state: "invalid" }
  | { state: "revoked" }
  /** Nobody has opened it yet; the browser must claim it. */
  | { state: "unclaimed" }
  /** This device owns the link. */
  | { state: "ready"; ambassadorId: string }
  /** Another device owns the link. */
  | { state: "locked" };

/** The invite's id for a token — needed to name its device cookie. */
export async function inviteIdForGroupToken(token: string): Promise<string | null> {
  const invite = await db.ambassadorGroupInvite.findUnique({ where: { token }, select: { id: true } });
  return invite?.id ?? null;
}

/**
 * Where a link stands for the browser holding `deviceSecret`. Read-only —
 * loading the page (a WhatsApp link-preview crawler, say) never binds it; only
 * {@link claimGroupInvite} does.
 */
export async function groupLinkState(token: string, deviceSecret: string | null): Promise<GroupLinkState> {
  const invite = await db.ambassadorGroupInvite.findUnique({ where: { token } });
  if (!invite) return { state: "invalid" };
  if (invite.status === "REVOKED") return { state: "revoked" };
  if (!invite.deviceHash) return { state: "unclaimed" };
  if (deviceSecret && hashDeviceSecret(deviceSecret) === invite.deviceHash) {
    return { state: "ready", ambassadorId: invite.ambassadorId };
  }
  return { state: "locked" };
}

/**
 * First browser to call this owns the link. The conditional update makes the
 * bind atomic: two devices racing get exactly one winner.
 */
export async function claimGroupInvite(
  token: string,
  deviceSecret: string,
): Promise<"claimed" | "locked" | "revoked" | "invalid"> {
  const invite = await db.ambassadorGroupInvite.findUnique({ where: { token } });
  if (!invite) return "invalid";
  if (invite.status === "REVOKED") return "revoked";

  const hash = hashDeviceSecret(deviceSecret);
  if (invite.deviceHash) return invite.deviceHash === hash ? "claimed" : "locked";

  const res = await db.ambassadorGroupInvite.updateMany({
    where: { id: invite.id, status: "OPEN", deviceHash: null },
    data: { deviceHash: hash, boundAt: new Date(), status: "BOUND" },
  });
  if (res.count === 1) return "claimed";

  const fresh = await db.ambassadorGroupInvite.findUnique({ where: { id: invite.id } });
  return fresh?.deviceHash === hash ? "claimed" : "locked";
}
