import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { badRequest, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { checkView } from "@/lib/quality/chapter-gate";
import { projectChapterChecks, startChapterCheck } from "@/lib/services/chapter-gate";
import { opsGuard } from "@/lib/services/operations/route-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// "Check now" runs the chapter's check after answering (about 30 to 80 seconds).
export const maxDuration = 300;

const bodySchema = z.object({
  subject: z.enum(["AI_TEXT", "UPLOAD"]).default("AI_TEXT"),
  versionId: z.string().min(1).max(64).optional(),
  /** Check again: fresh AI calls, even for a text already checked (the founder or the COO). */
  force: z.boolean().optional(),
});

async function projectFor(idOrCode: string) {
  return db.project.findFirst({ where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] }, select: { id: true } });
}

/**
 * Chapter gate, founder + COO.
 * GET: every check of Chapter n (newest first), with what each cost.
 * POST { subject?, versionId?, force? }: check the chapter's AI text (or an upload) now: 202 when the
 * check was taken (it runs after the answer), 200 { state } when it is already running or settled
 * (send force to check again), 409 NOT_READY when there is nothing to check (not written, or an
 * upload the reader could not carry). 404 for another project.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string; n: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  const chapter = Number(params.n);
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 10) return badRequest("Unknown chapter.");
  try {
    const project = await projectFor(params.id);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const rows = (await projectChapterChecks(project.id)).filter((r) => r.chapterNumber === chapter);
    return NextResponse.json(
      { chapter, checks: rows.map((r) => ({ id: r.id, subject: r.subject, versionId: r.versionId, attempts: r.attempts, rewritable: r.rewritable, createdAt: r.createdAt, ...checkView(r, true) })) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return serverError("GET /api/admin/projects/[id]/chapters/[n]/check", error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string; n: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  const chapter = Number(params.n);
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 10) return badRequest("Unknown chapter.");
  const parsed = bodySchema.safeParse((await req.json().catch(() => null)) ?? {});
  if (!parsed.success) return badRequest("Say which text to check.");
  if (parsed.data.subject === "UPLOAD" && !parsed.data.versionId) return badRequest("Say which upload to check.");
  try {
    const project = await projectFor(params.id);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const { outcome, work } = await startChapterCheck(project.id, chapter, parsed.data.subject, { versionId: parsed.data.versionId ?? null, force: parsed.data.force });
    if (outcome.state === "not-ready") return NextResponse.json({ error: "There is nothing to check yet.", code: "NOT_READY" }, { status: 409 });
    if (!work) return NextResponse.json({ state: outcome.state }, { status: 200 });
    waitUntil(work().catch((error) => console.error("[chapter gate] Check now stopped with an error", project.id, chapter, error)));
    return NextResponse.json({ state: "running" }, { status: 202 });
  } catch (error) {
    return serverError("POST /api/admin/projects/[id]/chapters/[n]/check", error);
  }
}
