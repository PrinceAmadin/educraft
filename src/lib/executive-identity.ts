import { effectiveRole, isExecRole, type ExecRole } from "@/lib/rbac";

/**
 * Which ambassador and worker records belong to an executive. Pure (no
 * Prisma), so the rules are checked by `npm run check:tiers`.
 *
 * The email is the person: a record is identified by its login's email when it
 * has a login, otherwise by the email on the record itself. It is an
 * executive's when that email is the executive's own login email or one of the
 * "Other emails" the founder listed for them on Team & roles. Such a record
 * gets the executive tag and is always a Platinum ambassador; it never gets HQ
 * access (only the executive's own login has that).
 */

/** At most this many other emails per executive. */
export const MAX_OTHER_EMAILS = 5;

export interface ExecIdentity {
  userId: string;
  role: ExecRole;
  fullName: string;
  title: string;
  /** The executive's own login email — the one that signs in to HQ. */
  primaryEmail: string;
}

/** email (lower-case) → the executive it belongs to. */
export type ExecIndex = ReadonlyMap<string, ExecIdentity>;

export interface ExecSource {
  userId: string;
  role: string;
  email: string;
  fullName?: string | null;
  title?: string | null;
  otherEmails?: readonly string[] | null;
}

export function normaliseEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** One entry per login email and per other email. A login that is not an executive role is skipped. */
export function buildExecIndex(execs: readonly ExecSource[]): ExecIndex {
  const index = new Map<string, ExecIdentity>();
  for (const e of execs) {
    const role = effectiveRole(e.role);
    if (!isExecRole(role)) continue;
    const primaryEmail = normaliseEmail(e.email);
    const identity: ExecIdentity = {
      userId: e.userId,
      role,
      fullName: e.fullName?.trim() || primaryEmail,
      title: e.title?.trim() || "",
      primaryEmail,
    };
    if (primaryEmail) index.set(primaryEmail, identity);
    for (const other of e.otherEmails ?? []) {
      const key = normaliseEmail(other);
      // A login email always wins over someone else's "other" entry.
      if (key && !index.has(key)) index.set(key, identity);
    }
  }
  return index;
}

export interface RecordIdentity {
  /** The email typed on the record (Ambassador.email / Worker.email). */
  email?: string | null;
  /** The login the record sits on, if any. */
  user?: { email: string; role: string } | null;
}

/** The email that identifies a record: its login's email when it has one, otherwise its own. */
export function identifyingEmail(record: RecordIdentity): string {
  return normaliseEmail(record.user ? record.user.email : record.email);
}

/** The executive a record belongs to, or null. */
export function execForRecord(index: ExecIndex, record: RecordIdentity): ExecIdentity | null {
  const email = identifyingEmail(record);
  return email ? index.get(email) ?? null : null;
}

/** The executive role a record belongs to (for the tag), or null. */
export function execRoleForRecord(index: ExecIndex, record: RecordIdentity): ExecRole | null {
  return execForRecord(index, record)?.role ?? null;
}
