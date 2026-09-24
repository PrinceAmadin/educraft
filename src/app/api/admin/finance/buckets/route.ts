import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { bucketsQuerySchema } from "@/lib/validations/finance-buckets";
import { getBucketBalances, getBucketCards, getRetainedForMonth, listBucketTransactions } from "@/lib/services/finance/buckets";
import { currentMonthKey, getFounderDrawsPaid, getGrowthFundQuarter } from "@/lib/services/finance/surplus";

/** The four buckets for a month (balances all-time, flows for the month) plus the transaction log. Founder and CFO. */
export async function GET(req: NextRequest) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;

  const parsed = bucketsQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return badRequest("Check the filters", parsed.error.flatten());
  const month = parsed.data.month || currentMonthKey();

  try {
    const [cards, balances, retained, sponsorship, drawsPaid, transactions] = await Promise.all([
      getBucketCards(month),
      getBucketBalances(),
      getRetainedForMonth(month),
      getGrowthFundQuarter(month),
      getFounderDrawsPaid([month]),
      listBucketTransactions({ bucket: parsed.data.bucket || undefined, month, page: parsed.data.page }),
    ]);
    return NextResponse.json({ month, cards, balances, retainedThisMonth: retained, sponsorship, founderDrawsPaidThisMonth: drawsPaid, transactions });
  } catch (error) {
    return serverError("GET /api/admin/finance/buckets", error);
  }
}
