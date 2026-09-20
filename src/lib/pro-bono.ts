import { createHash, randomBytes } from "crypto";

/**
 * Pro bono jobs. A pro bono project is an ordinary project with no money on
 * it: price 0, both payment legs already cleared (so the pipeline guards pass
 * without a Payment row ever existing — nothing reaches the finance dashboard),
 * and every payout leg pre-marked paid so the payout queues skip it.
 */

/** Columns that make a project pro bono. Spread into a project create/update. */
export function proBonoFinancials() {
  return {
    isProBono: true,
    price: 0,
    downpaymentAmount: 0,
    balanceAmount: 0,
    downpaymentStatus: "Verified",
    balanceStatus: "Verified",
    ambassadorId: null,
    ambassadorCommRate: null,
    ambassadorCommission: null,
    ambassadorAllocatedAt: null,
    ambassadorCommPaid: true,
    parentAmbassadorId: null,
    parentCommRate: null,
    parentCommission: null,
    parentCommPaid: true,
    workerPayoutRate: 0,
    workerPayout: 0,
    workerPayoutPaid: true,
    educraftRevenue: 0,
  } as const;
}

// ── One-time link, bound to the first device that opens it ──────────

export const PRO_BONO_DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Cookie holding this browser's secret for one invite. One cookie per invite. */
export function deviceCookieName(inviteId: string): string {
  return `ec_pb_${inviteId.slice(-10)}`;
}

export function newDeviceSecret(): string {
  return randomBytes(32).toString("hex");
}

export function hashDeviceSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}
