import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { startChapterCheck, verifyChapterCheckToken } from "@/lib/services/chapter-gate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// A chapter check takes about 30 to 80 seconds (its two Claude reviews run side by side).
export const maxDuration = 300;

/**
 * POST { projectId, chapter, subject, versionId?, force? }: runs one chapter's
 * quality check (services/chapter-gate.ts). Asked for by the AI draft, the
 * orchestrator, an upload and the Check now button, over HTTP so it never runs
 * inside a page or a tick. Signed with AUTH_SECRET over the check it names;
 * there is no session. Answers 202 once the check is taken (or 200 when it
 * was already settled or running), and does the work in waitUntil.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { projectId?: unknown; chapter?: unknown; subject?: unknown; versionId?: unknown; force?: unknown } | null;
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const chapter = Number(body?.chapter);
  const subject = body?.subject === "AI_TEXT" || body?.subject === "UPLOAD" ? body.subject : null;
  const versionId = typeof body?.versionId === "string" ? body.versionId : null;
  if (!projectId || !Number.isInteger(chapter) || chapter < 1 || chapter > 10 || !subject) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  if (!verifyChapterCheckToken(projectId, chapter, subject, versionId, req.headers.get("x-chapter-check-token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { outcome, work } = await startChapterCheck(projectId, chapter, subject, { versionId, force: body?.force === true });
  if (!work) return NextResponse.json({ accepted: false, state: outcome.state }, { status: 200 });
  waitUntil(
    work().catch((error) => {
      console.error("[chapter gate] a check stopped with an error", projectId, chapter, subject, error);
    }),
  );
  return NextResponse.json({ accepted: true }, { status: 202 });
}
