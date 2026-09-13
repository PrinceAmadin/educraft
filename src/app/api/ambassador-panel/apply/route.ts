import { NextRequest, NextResponse } from "next/server";
import { serverError } from "@/lib/api";
import { PanelError } from "@/lib/ambassador-panel/actions";
import { submitApplication } from "@/lib/ambassador-panel/public-forms";
import { PanelNotConfiguredError } from "@/lib/ambassador-panel/redis";

export const dynamic = "force-dynamic";

/** Public — the original app's ambassador application (new recruits). */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    return NextResponse.json(await submitApplication(body));
  } catch (error) {
    if (error instanceof PanelError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof PanelNotConfiguredError) {
      return NextResponse.json({ error: "Applications are not open right now. Please contact EduCraft." }, { status: 503 });
    }
    return serverError("ambassador-panel/apply", error);
  }
}
