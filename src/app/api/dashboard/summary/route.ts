import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDashboardSummary } from "@/lib/services/dashboard";

/** Live operational numbers — never served from a build-time or route cache. */
export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["SUPER_ADMIN", "OPS_MANAGER"];

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!ADMIN_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const summary = await getDashboardSummary();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[GET /api/dashboard/summary]", error);
    return NextResponse.json(
      { error: "Could not load dashboard data. Try again in a moment." },
      { status: 500 }
    );
  }
}
