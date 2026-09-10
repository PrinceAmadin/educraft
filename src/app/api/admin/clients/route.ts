import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { searchClientsForPicker } from "@/lib/services/clients";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const q = req.nextUrl.searchParams.get("q") ?? "";

  try {
    const clients = await searchClientsForPicker(q);
    return NextResponse.json({ clients });
  } catch (error) {
    return serverError("GET /api/admin/clients", error);
  }
}
