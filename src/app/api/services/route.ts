import { NextResponse } from "next/server";
import { getActiveServices } from "@/lib/services/intake";

/** Public — the intake page and any embed can read the live service catalogue. */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const services = await getActiveServices();
    return NextResponse.json({ services });
  } catch (error) {
    console.error("[GET /api/services]", error);
    return NextResponse.json({ error: "Could not load services" }, { status: 500 });
  }
}
