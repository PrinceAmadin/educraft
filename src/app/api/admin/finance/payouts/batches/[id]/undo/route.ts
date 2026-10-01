import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoles, serverError } from "@/lib/api";
import { BatchError, undoPayoutBatch } from "@/lib/services/finance/payout-batches";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** Roll back a cleared batch while its undo window is open (founder + CFO). The emails were never sent. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  try {
    const result = await undoPayoutBatch(params.id, guard.session.userId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BatchError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/admin/finance/payouts/batches/[id]/undo", error);
  }
}
