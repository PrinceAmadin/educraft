import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { claudeTopUpSchema } from "@/lib/validations/expenses";
import { ExpenseError, logClaudeTopUp } from "@/lib/services/expenses";
import { getCreditBalance } from "@/lib/services/ai-usage";
import { getClaudePot } from "@/lib/services/finance/pots";

/**
 * Log Anthropic credits bought from the Claude API pot (decision 5). The naira
 * leaves the pot and Operations Reserve as an expense, and the USD of credit is
 * added to the balance card. Founder and CFO only (the CFO owns the finance
 * platform); over the approval threshold and not the founder, the cash waits.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;

  const parsed = claudeTopUpSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const result = await logClaudeTopUp(
      { amountNgn: parsed.data.amountNgn, amountUsd: parsed.data.amountUsd, reference: parsed.data.reference || undefined, date: parsed.data.date },
      guard.session.userId,
      guard.session.role
    );
    const [pot, balance] = await Promise.all([getClaudePot(), getCreditBalance()]);
    return NextResponse.json({ ok: true, ...result, pot, balance });
  } catch (error) {
    if (error instanceof ExpenseError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/admin/ai-usage/top-up", error);
  }
}
