import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { serverError } from "@/lib/api";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { projectNotFound } from "@/lib/generation/route-helpers";
import { opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import {
  getPreliminaryPagesView,
  PreliminaryPagesError,
  runPreliminaryPagesAgent,
  savePreliminaryPagesByHand,
} from "@/lib/services/preliminary-pages";
import { preliminaryPagesEditSchema } from "@/lib/validations/preliminary-pages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Two Claude calls + a small DB write. Sonnet 5 for each of them lands well inside the 300 s a function may run.
export const maxDuration = 300;

const ROUTE = "/api/admin/projects/[id]/generation/preliminary-pages";

function failed(method: string, error: unknown) {
  if (error instanceof PreliminaryPagesError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  return serverError(`${method} ${ROUTE}`, error);
}

/** D7b: what the Report tab's Preliminary pages card shows. Founder + COO. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  try {
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
    return NextResponse.json(await getPreliminaryPagesView(project.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failed("GET", error);
  }
}

/**
 * Writes the acknowledgement, abstract and list of abbreviations with the D10
 * agent. Founder + COO. The quality gate does this by itself before it scores a
 * report; this is "Write now" / "Write again" on the card.
 *
 * Body: { force?: boolean }. Without force, unchanged input or a hand edit
 * returns the stored pages; with force, both Claude calls run again and replace
 * them (a hand edit included).
 *
 * Answers 202 at once and does the work in waitUntil; the card polls GET until
 * the pages' updatedAt moves.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as { force?: unknown } | null;
  const force = body?.force === true;
  try {
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
    const view = await getPreliminaryPagesView(project.id);
    if (!view.applies) return NextResponse.json({ error: "A chapter-based order has no preliminary pages.", code: "NO_PRELIMINARY_PAGES" }, { status: 409 });
    if (!view.chaptersReady) return NextResponse.json({ error: "The pages are written from the finished chapters. Wait until every chapter is written.", code: "CHAPTERS_NOT_READY" }, { status: 409 });
    waitUntil(
      (async () => {
        try {
          await runPreliminaryPagesAgent(project.id, { force });
        } catch (error) {
          console.error("[preliminary-pages route] threw", error);
        }
      })(),
    );
    return NextResponse.json({ accepted: true, projectId: project.projectId, force }, { status: 202 });
  } catch (error) {
    return failed("POST", error);
  }
}

/** D7b: the founder's or the COO's corrections, kept by every later automatic run. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await opsGuard(["COO"]);
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, preliminaryPagesEditSchema);
  if (!body.ok) return body.response;
  try {
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
    return NextResponse.json(await savePreliminaryPagesByHand(project.id, guard.actor.userId, body.data));
  } catch (error) {
    return failed("PATCH", error);
  }
}
