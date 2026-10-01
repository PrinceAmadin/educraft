import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoles, serverError } from "@/lib/api";
import { fileDownloadResponse } from "@/lib/files/download";
import { fileForFinance } from "@/lib/services/finance/finance-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Stream an organisation-level finance file — a bank confirmation or statement (founder + CFO only). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  try {
    const file = await fileForFinance(params.id);
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return fileDownloadResponse(file, { allowLinks: false });
  } catch (error) {
    return serverError("GET /api/admin/finance/files/[id]", error);
  }
}
