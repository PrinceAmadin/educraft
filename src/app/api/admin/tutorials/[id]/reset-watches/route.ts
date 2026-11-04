import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, serverError } from "@/lib/api";
import { resetEpisodeWatches } from "@/lib/services/training";

/**
 * Starts everyone's progress on one episode over — the founder's way of
 * forcing a rewatch after replacing an episode's video with a genuinely new
 * cut. For a worker episode this re-gates every worker, which is why it is
 * founder only and the UI asks first.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  try {
    const cleared = await resetEpisodeWatches(params.id);
    return NextResponse.json({ cleared });
  } catch (error) {
    return serverError("tutorials-reset", error);
  }
}
