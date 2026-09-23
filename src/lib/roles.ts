/**
 * Who is who, in one place. Pure: the edge middleware imports this.
 *
 * Staff (super admin, operations manager) have the admin area only. Everyone
 * else is a person who can hold up to three profiles on ONE login: a worker
 * record, an ambassador record and client orders. `User.role` is only the
 * dashboard they land on first (what they registered as); which dashboards
 * they can open is read from the profiles they own, and each portal checks
 * that for itself.
 */

export const STAFF_ROLES = ["SUPER_ADMIN", "OPS_MANAGER"] as const;
export const PERSON_ROLES = ["WORKER", "AMBASSADOR", "CLIENT"] as const;

export type Portal = "worker" | "ambassador" | "client";

export const PORTAL_ROOTS: Record<Portal, string> = {
  worker: "/worker",
  ambassador: "/ambassador",
  client: "/client",
};

export function isStaffRole(role: string | undefined | null): boolean {
  return STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number]);
}

/** A worker, ambassador or client login (may own any of the three profiles). */
export function isPersonRole(role: string | undefined | null): boolean {
  return PERSON_ROLES.includes(role as (typeof PERSON_ROLES)[number]);
}

/** The portal a person-login lands on first: the role they registered as. */
export function primaryPortal(role: string | undefined | null): Portal | null {
  if (role === "WORKER") return "worker";
  if (role === "AMBASSADOR") return "ambassador";
  if (role === "CLIENT") return "client";
  return null;
}

/** Client sessions last 14 days from sign-in (a client's projects are private). */
export const CLIENT_SESSION_MS = 14 * 24 * 3_600_000;

/** A client-first login whose 14 days are up: treat it as signed out. */
export function isClientSessionExpired(user: { role?: string; loginAt?: number } | null | undefined, now = Date.now()): boolean {
  return user?.role === "CLIENT" && (!user.loginAt || now - user.loginAt > CLIENT_SESSION_MS);
}
