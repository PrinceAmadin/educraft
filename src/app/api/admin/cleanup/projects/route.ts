import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import {
  actorFor,
  CleanupError,
  deleteTestProjects,
  listCleanupRows,
  listDeletedProjects,
  listFlaggers,
  previewDeletion,
} from "@/lib/services/project-cleanup";

export const dynamic = "force-dynamic";
// A batch deletes one project at a time, each in its own transaction.
export const maxDuration = 300;

const codes = z.array(z.string().trim().min(1).max(60)).min(1).max(50);

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), codes }),
  z.object({ action: z.literal("delete"), codes, reason: z.string().max(1000), confirm: z.string().max(100) }),
]);

/** Test data (founder only): the list, what was deleted, and who may flag. */
export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  try {
    const q = req.nextUrl.searchParams.get("q") ?? undefined;
    const [rows, deleted, flaggers] = await Promise.all([listCleanupRows(q), listDeletedProjects(), listFlaggers()]);
    return NextResponse.json({ ...rows, deleted, flaggers }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("GET /api/admin/cleanup/projects", error);
  }
}

/** `preview` reads only; `delete` needs the reason and the typed phrase, and is checked again here. */
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    if (parsed.data.action === "preview") {
      return NextResponse.json({ previews: await previewDeletion(parsed.data.codes) });
    }
    const actor = await actorFor(guard.session.userId);
    const results = await deleteTestProjects(parsed.data.codes, parsed.data.reason, parsed.data.confirm, actor);
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof CleanupError) {
      return NextResponse.json({ error: error.message, refusals: error.refusals }, { status: error.status });
    }
    return serverError("POST /api/admin/cleanup/projects", error);
  }
}
