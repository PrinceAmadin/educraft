import { NextResponse } from "next/server";
import type { z } from "zod";
import { badRequest, requireAdmin, requireAdminRoles, serverError, type AdminSession } from "@/lib/api";
import { TransitionError } from "@/lib/services/projects";
import { MessageError } from "@/lib/services/client-messages";
import { actorFor, type Actor } from "@/lib/services/operations/actor";

/**
 * The shape every operations route shares: a staff session resolved to an
 * actor (name + role), a validated JSON body, and one place that turns a
 * service error into the right status.
 */

export type OpsGuard = { ok: true; session: AdminSession; actor: Actor } | { ok: false; response: NextResponse };

/** Any staff login (the middleware's domain table has already kept other executives out). */
export async function opsGuard(allowed?: readonly string[]): Promise<OpsGuard> {
  const guard = allowed ? await requireAdminRoles(allowed) : await requireAdmin();
  if (!guard.ok) return guard;
  return { ok: true, session: guard.session, actor: await actorFor(guard.session) };
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: badRequest("Expected a JSON body") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: badRequest(parsed.error.issues[0]?.message ?? "Invalid request", parsed.error.flatten()) };
  return { ok: true, data: parsed.data };
}

export function parseQuery<T>(req: Request, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
  const url = new URL(req.url);
  const flat: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    if (!(k in flat)) flat[k] = v;
  });
  return schema.parse(flat);
}

/** A service error becomes 404 (not found), 409 (a rule refused it) or 500. */
export function opsError(tag: string, error: unknown): NextResponse {
  if (error instanceof TransitionError) {
    const notFound = /not found|no project with|no worker/i.test(error.message);
    return NextResponse.json({ error: error.message }, { status: notFound ? 404 : 409 });
  }
  if (error instanceof MessageError) return NextResponse.json({ error: error.message }, { status: error.status });
  return serverError(tag, error);
}
