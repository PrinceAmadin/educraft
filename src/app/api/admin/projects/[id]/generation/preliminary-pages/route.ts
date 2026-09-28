import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { requireAdminRoles, serverError } from "@/lib/api";
import { resolveGenerationProject } from "@/lib/generation/generate-chapter";
import { projectNotFound } from "@/lib/generation/route-helpers";
import { runPreliminaryPagesAgent } from "@/lib/services/preliminary-pages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Two Claude calls + a small DB write. Sonnet 5 for each of them lands well inside the 300 s a function may run.
export const maxDuration = 300;

/**
 * D10: runs the preliminary pages agent for one project. Founder + COO.
 * The gate fires the same service in waitUntil on auto-submit; this route
 * is for retries (specifically when the abstract missed the word count and
 * the founder wants a second attempt).
 *
 * Body: { force?: boolean }. Without force, a run whose promptHash matches
 * the stored row's is a no-op and returns the stored result. With force,
 * both Claude calls run again and the stored row is overwritten.
 *
 * Answers 202 at once and does the work in waitUntil, so the caller does
 * not hold the request while the two Claude calls run.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["COO"]);
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as { force?: unknown } | null;
  const force = body?.force === true;
  try {
    const project = await resolveGenerationProject(params.id);
    if (!project) return projectNotFound();
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
    return serverError("POST /api/admin/projects/[id]/generation/preliminary-pages", error);
  }
}
