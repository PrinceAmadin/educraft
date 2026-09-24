import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { listForUser, markAllRead, markRead } from "@/lib/services/notifications";
import { notificationsReadBodySchema } from "@/lib/validations/operations";
import { parseBody } from "@/lib/services/operations/route-helpers";

export const dynamic = "force-dynamic";

/** GET ?limit= — the signed-in executive's notifications and unread count. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const raw = Number(new URL(req.url).searchParams.get("limit"));
  const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 50) : 20;
  try {
    return NextResponse.json(await listForUser(guard.session.userId, limit), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("GET /api/admin/notifications", error);
  }
}

/** PATCH { id? } — mark one notification read, or all of them. */
export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, notificationsReadBodySchema);
  if (!body.ok) return body.response;
  try {
    if (body.data.id) {
      await markRead(body.data.id, guard.session.userId);
      return NextResponse.json({ ok: true, marked: 1 });
    }
    const marked = await markAllRead(guard.session.userId);
    return NextResponse.json({ ok: true, marked });
  } catch (error) {
    return serverError("PATCH /api/admin/notifications", error);
  }
}
