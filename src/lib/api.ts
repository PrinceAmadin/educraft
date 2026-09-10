import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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

/** Guard for `/api/worker/*` — resolves the caller's own Worker row. */
export async function requireWorker(): Promise<
  { ok: true; userId: string; workerId: string } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== "WORKER") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const worker = await db.worker.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
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
  if (session.user.role !== "AMBASSADOR") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const ambassador = await db.ambassador.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
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
