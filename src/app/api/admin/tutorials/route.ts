import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { TrainingError, createEpisode } from "@/lib/services/training";
import { createEpisodeSchema } from "@/lib/validations/training";

/**
 * Creates a training episode (COO tutorials or the worker series). Founder
 * only: episodes are the curriculum, and publishing a worker episode gates
 * every worker, which is a founder decision. The `/api/admin/tutorials` row
 * in `API_PERMISSIONS` admits the COO too — that is for the progress route;
 * every management handler re-checks with `requireSuperAdmin`.
 */
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = createEpisodeSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

  try {
    const created = await createEpisode(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof TrainingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return serverError("tutorials-create", error);
  }
}
