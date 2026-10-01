import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { BatchError, clearPayoutBatch } from "@/lib/services/finance/payout-batches";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  paymentMethod: z.string().trim().min(1, "Choose how it was paid").max(40),
  paymentMethodDetail: z.string().trim().max(120).optional().or(z.literal("")),
  batchReference: z.string().trim().min(1, "Enter the payment reference").max(120),
  bankConfirmationFileId: z.string().trim().min(1, "Attach the bank confirmation"),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  excludeRecipientKeys: z.array(z.string().max(80)).max(2000).optional(),
});

/** Clear a payout batch (founder + CFO). Opens the ten-minute undo window; no emails go out until the tick finalises it. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const result = await clearPayoutBatch(
      params.id,
      {
        paymentMethod: parsed.data.paymentMethod,
        paymentMethodDetail: parsed.data.paymentMethodDetail || null,
        batchReference: parsed.data.batchReference,
        bankConfirmationFileId: parsed.data.bankConfirmationFileId,
        notes: parsed.data.notes || null,
        excludeRecipientKeys: parsed.data.excludeRecipientKeys,
      },
      guard.session.userId
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BatchError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/admin/finance/payouts/batches/[id]/clear", error);
  }
}
