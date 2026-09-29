import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, requireAdmin, requireSuperAdmin, serverError } from "@/lib/api";
import { getCreditBalance, setCreditBalance } from "@/lib/services/ai-usage";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(await getCreditBalance());
  } catch (error) {
    return serverError("GET /api/admin/ai-usage/balance", error);
  }
}

const bodySchema = z.object({ balanceUsd: z.number().min(0).max(100_000) });

/** The owner records the balance shown in the Anthropic Console (USD) after a top-up. */
export async function PUT(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Enter the balance as a number of US dollars", parsed.error.flatten());

  try {
    await setCreditBalance(parsed.data.balanceUsd);
    return NextResponse.json(await getCreditBalance());
  } catch (error) {
    return serverError("PUT /api/admin/ai-usage/balance", error);
  }
}
