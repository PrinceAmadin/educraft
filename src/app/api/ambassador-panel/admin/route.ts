import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireSuperAdmin, serverError } from "@/lib/api";
import { DESTRUCTIVE_ACTIONS, PanelError, runAction, type Body } from "@/lib/ambassador-panel/actions";
import { PanelNotConfiguredError } from "@/lib/ambassador-panel/redis";

export const dynamic = "force-dynamic";

/**
 * Ambassador panel router — `?action=…`, as the original `api/admin.ts`.
 *
 * Signed-in admins only (the original's shared password and its hard-coded
 * fallback are gone). Actions that permanently delete tracking data are
 * founder-only, matching the Ops Manager "no delete" rule. `get-next-slot`
 * stays public: the application form calls it before anyone signs in.
 */
async function handle(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") ?? "";

  if (action !== "get-next-slot") {
    const guard = DESTRUCTIVE_ACTIONS.has(action) ? await requireSuperAdmin() : await requireAdmin();
    if (!guard.ok) return guard.response;
  }

  const body: Body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as Body) : {};

  try {
    const data = await runAction(action, body, { origin: req.nextUrl.origin });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PanelError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof PanelNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return serverError("ambassador-panel", error);
  }
}

export const GET = handle;
export const POST = handle;
