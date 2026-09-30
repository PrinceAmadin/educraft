import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { badRequest, serverError } from "@/lib/api";
import { CLEANUP_TEXT, mayFlagTestProjects, mayUnflag } from "@/lib/project-cleanup";
import { actorFor, CleanupError, flagOf, flagTestProject, unflagTestProject } from "@/lib/services/project-cleanup";

export const dynamic = "force-dynamic";

/**
 * Flag a project as a test (or take the flag off). Outside /api/admin on
 * purpose: the COO flags by role, and anyone the founder appoints (a worker,
 * say) flags from the account menu of whatever dashboard they are on. The
 * permission is read from the database on every call, so an appointment the
 * founder removes stops working at once. Flagging deletes nothing; only the
 * founder deletes, from Settings > Test data. The reply never describes the
 * project, so a code typed at random reveals nothing about it.
 */

const flagSchema = z.object({ code: z.string().trim().min(1).max(60), note: z.string().max(500).optional() });
const unflagSchema = z.object({ code: z.string().trim().min(1).max(60) });

async function flagger(): Promise<{ ok: true; userId: string; role: string } | { ok: false; response: NextResponse }> {
  const session = await auth();
  if (!session?.user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const me = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true, isActive: true, canFlagTestProjects: true } });
  if (!me?.isActive || !mayFlagTestProjects(me.role, me.canFlagTestProjects)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, userId: session.user.id, role: me.role };
}

async function readBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  const who = await flagger();
  if (!who.ok) return who.response;
  const parsed = flagSchema.safeParse(await readBody(req));
  if (!parsed.success) return badRequest("Type a project code like EC-00007.");
  try {
    const result = await flagTestProject(parsed.data.code, parsed.data.note, await actorFor(who.userId));
    return NextResponse.json({ ok: true, code: result.code, message: result.already ? "It was already flagged." : CLEANUP_TEXT.flagDone });
  } catch (error) {
    if (error instanceof CleanupError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("POST /api/test-flags", error);
  }
}

export async function DELETE(req: NextRequest) {
  const who = await flagger();
  if (!who.ok) return who.response;
  const parsed = unflagSchema.safeParse(await readBody(req));
  if (!parsed.success) return badRequest("Type a project code like EC-00007.");
  try {
    const flag = await flagOf(parsed.data.code);
    if (!flag) return NextResponse.json({ error: CLEANUP_TEXT.flagMissing }, { status: 404 });
    if (!mayUnflag(who.role, who.userId, flag.flaggedById)) {
      return NextResponse.json({ error: "Only the person who flagged it, the COO or the founder can take the flag off." }, { status: 403 });
    }
    await unflagTestProject(flag.code);
    return NextResponse.json({ ok: true, code: flag.code });
  } catch (error) {
    if (error instanceof CleanupError) return NextResponse.json({ error: error.message }, { status: error.status });
    return serverError("DELETE /api/test-flags", error);
  }
}
