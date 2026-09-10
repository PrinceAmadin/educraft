import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

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

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

export function serverError(tag: string, error: unknown) {
  console.error(`[${tag}]`, error);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}
