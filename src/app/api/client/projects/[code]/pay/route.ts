import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireClient, serverError } from "@/lib/api";
import { findClientProject } from "@/lib/services/client-portal";
import { PaystackPaymentError, initializePaystackPayment } from "@/lib/services/paystack-payments";
import { clientPaySchema } from "@/lib/validations/client-portal";

export const dynamic = "force-dynamic";

/**
 * POST /api/client/projects/[code]/pay  { leg }
 *
 * The signed-in client starts a Paystack checkout for their own project. The
 * balance may be paid before the quality check (Chapters 3+ and the final
 * unlock with it). A project that is not theirs is a 404.
 */
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const guard = await requireClient();
  if (!guard.ok) return guard.response;

  const parsed = clientPaySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Choose what to pay");

  const project = await findClientProject(guard.scope, params.code);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    const result = await initializePaystackPayment(project.id, parsed.data.leg, { allowEarlyBalance: true });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PaystackPaymentError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/client/projects/[code]/pay", error);
  }
}
