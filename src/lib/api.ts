import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientIdsForUser } from "@/lib/services/client-otp";
import { isClientSessionExpired, isPersonRole } from "@/lib/roles";

const ADMIN_ROLES = ["SUPER_ADMIN", "OPS_MANAGER"];

export interface AdminSession {
  userId: string;
  role: string;
}

/**
 * Guard for `/api/admin/*` handlers. Returns the session on success, or a
 * ready-to-return NextResponse (401/403) that the caller should return as-is.
 */
export async function requireAdmin(): Promise<
  { ok: true; session: AdminSession } | { ok: false; response: NextResponse }
> {
  const session = await auth();

  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!ADMIN_ROLES.includes(session.user.role)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true, session: { userId: session.user.id, role: session.user.role } };
}

/**
 * Guard for founder-only actions — team management, pricing changes. Stricter
 * than {@link requireAdmin}: OPS_MANAGER is turned away with 403.
 */
export async function requireSuperAdmin(): Promise<
  { ok: true; session: AdminSession } | { ok: false; response: NextResponse }
> {
  const session = await auth();

  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== "SUPER_ADMIN") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true, session: { userId: session.user.id, role: session.user.role } };
}

/** Guard for `/api/worker/*` — resolves the caller's own Worker row. */
export async function requireWorker(): Promise<
  { ok: true; userId: string; workerId: string } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  // The worker profile is what matters: an ambassador or client login can also own one.
  if (!isPersonRole(session.user.role)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const worker = await db.worker.findUnique({
    where: { userId: session.user.id },
    select: { id: true, status: true },
  });
  if (worker && worker.status !== "Active" && worker.status !== "On Break") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (!worker) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No worker profile linked to this account" }, { status: 404 }),
    };
  }
  return { ok: true, userId: session.user.id, workerId: worker.id };
}

/** Guard for `/api/ambassador/*` — resolves the caller's own Ambassador row. */
export async function requireAmbassador(): Promise<
  { ok: true; userId: string; ambassadorId: string } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  // The ambassador profile is what matters: a worker or client login can also own one.
  if (!isPersonRole(session.user.role)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const ambassador = await db.ambassador.findUnique({
    where: { userId: session.user.id },
    select: { id: true, status: true },
  });
  if (ambassador && ambassador.status !== "Active") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (!ambassador) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No ambassador profile linked to this account" },
        { status: 404 }
      ),
    };
  }
  return { ok: true, userId: session.user.id, ambassadorId: ambassador.id };
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

export function serverError(tag: string, error: unknown) {
  console.error(`[${tag}]`, error);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}


export interface ClientScope {
  userId: string;
  /** The Client rows this person owns. EVERY client-portal query must filter by these. */
  clientIds: string[];
}

/**
 * The signed-in client and what they own, or null (no session, a staff login,
 * a login with no client orders, or a client session past its 14 days). A
 * worker or ambassador who is also a client gets their own orders here too.
 * Use this in client-portal server components.
 */
export async function getClientScope(): Promise<ClientScope | null> {
  const session = await auth();
  if (!session?.user || !isPersonRole(session.user.role)) return null;
  if (isClientSessionExpired(session.user)) return null;
  const clientIds = await clientIdsForUser(session.user.id);
  // A client-first login keeps its dashboard (empty) even with no orders yet.
  if (session.user.role !== "CLIENT" && clientIds.length === 0) return null;
  return { userId: session.user.id, clientIds };
}

/** Guard for `/api/client/*`: 401 without a valid client session. */
export async function requireClient(): Promise<
  { ok: true; scope: ClientScope } | { ok: false; response: NextResponse }
> {
  const scope = await getClientScope();
  if (!scope) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true, scope };
}
