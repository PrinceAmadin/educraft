import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { canVerifyPayments } from "@/lib/rbac";
import { PageHeader } from "@/components/shared/PageHeader";
import { MonthPicker } from "@/components/reports/MonthPicker";
import { BucketCards } from "@/components/finance/buckets/BucketCards";
import { SemesterAnalysis } from "@/components/finance/buckets/SemesterAnalysis";
import { BucketTransactions } from "@/components/finance/buckets/BucketTransactions";
import { ManualAdjustmentDialog } from "@/components/finance/buckets/ManualAdjustmentDialog";
import { getBucketBalances, getBucketCards, getRetainedForMonth, listBucketTransactions, BUCKET_TX_PAGE_SIZE } from "@/lib/services/finance/buckets";
import { currentMonthKey, getFounderDrawsPaid, getGrowthFundQuarter, getSurplusAnalysis, monthLabel } from "@/lib/services/finance/surplus";
import { bucketsQuerySchema } from "@/lib/validations/finance-buckets";
import { formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Bucket manager" };
export const dynamic = "force-dynamic";

/**
 * The four buckets EduCraft's retained share is split into as each payment
 * is confirmed: balances against their targets, the month's flow, the
 * semester-end surplus analysis and the ledger behind it all.
 */
export default async function BucketsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const session = await auth();
  const canAct = canVerifyPayments(session?.user?.role);
  const parsed = bucketsQuerySchema.safeParse(searchParams);
  const query = parsed.success ? parsed.data : {};
  const currentMonth = currentMonthKey();
  const month = query.month && query.month <= currentMonth ? query.month : currentMonth;
  const bucket = query.bucket || undefined;

  const [cards, balances, retained, sponsorship, drawsPaid, surplus, transactions] = await Promise.all([
    getBucketCards(month),
    getBucketBalances(),
    getRetainedForMonth(month),
    getGrowthFundQuarter(month),
    getFounderDrawsPaid([month]),
    getSurplusAnalysis(month),
    listBucketTransactions({ bucket, month, page: query.page }),
  ]);
  const allBuckets = balances.operationsReserve + balances.growthFund + balances.reinvestmentFund + balances.founderDistribution;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Bucket manager"
        description="EduCraft's retained share, split four ways the moment a payment is confirmed. Balances are all-time; inflow and outflow belong to the month shown."
        back={{ href: "/admin/finance", label: "Finance" }}
        actions={canAct ? <ManualAdjustmentDialog /> : null}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <MonthPicker month={month} currentMonth={currentMonth} basePath="/admin/finance/buckets" />
        <dl className="flex gap-8">
          <div>
            <dt className="meta-label">Retained in {monthLabel(month)}</dt>
            <dd className="mt-1 font-mono text-lg font-medium tabular-nums text-foreground">{formatNaira(retained)}</dd>
          </div>
          <div>
            <dt className="meta-label">All buckets</dt>
            <dd className="mt-1 font-mono text-lg font-medium tabular-nums text-foreground">{formatNaira(allBuckets)}</dd>
          </div>
        </dl>
      </div>

      <BucketCards cards={cards} extras={{ sponsorship, founderDrawsPaidThisMonth: drawsPaid }} />

      <SemesterAnalysis data={surplus} month={month} canAct={canAct} />

      <BucketTransactions
        month={month}
        bucket={bucket}
        data={{ rows: transactions.rows, total: transactions.total, page: transactions.page, pageCount: Math.max(1, Math.ceil(transactions.total / BUCKET_TX_PAGE_SIZE)) }}
      />
    </div>
  );
}
