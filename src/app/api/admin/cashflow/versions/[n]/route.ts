import { NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { getCashflowVersionByNumber } from "@/lib/services/cashflow";

/** One version in full, by its number, for the read-only view in the history. */
export async function GET(_req: Request, { params }: { params: { n: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const version = await getCashflowVersionByNumber(n);
    if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(version, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("GET /api/admin/cashflow/versions/[n]", error);
  }
}
