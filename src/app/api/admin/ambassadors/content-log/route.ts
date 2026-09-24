import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { logContent } from "@/lib/services/ambassador-platform/content";
import { logContentSchema } from "@/lib/validations/ambassador-platform";

/** "Log content posted": the Monday flier, the midweek check-in, the Friday spotlight, or another post. */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = logContentSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const row = await logContent({ contentType: parsed.data.contentType, postedAt: parsed.data.postedAt || undefined, note: parsed.data.note || undefined }, guard.session.userId);
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return serverError("POST /api/admin/ambassadors/content-log", error);
  }
}
