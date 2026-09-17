import type { Metadata } from "next";
import Link from "next/link";
import { LuArrowLeft } from "react-icons/lu";
import { getPaystackReconciliation } from "@/lib/services/paystack-payments";
import { ReconciliationTable } from "@/components/finance/ReconciliationTable";
import { formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Paystack reconciliation" };
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

export default async function ReconciliationPage() {
  const { rows, matchedCount, outOfSyncCount } = await getPaystackReconciliation(WINDOW_DAYS);
  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-5">
      <Link
        href="/admin/finance"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <LuArrowLeft className="size-4" aria-hidden />
        Finance
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Paystack reconciliation
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paystack&apos;s own successful transactions from the last {WINDOW_DAYS} days, checked against
          EduCraft&apos;s records — a mismatch usually means a webhook delivery was missed.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-zone p-4">
          <p className="text-sm text-muted-foreground">Paystack revenue ({WINDOW_DAYS}d)</p>
          <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-foreground">
            {formatNaira(totalAmount)}
          </p>
        </div>
        <div className="rounded-2xl bg-zone p-4">
          <p className="text-sm text-muted-foreground">Matched</p>
          <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-success">{matchedCount}</p>
        </div>
        <div className="rounded-2xl bg-zone p-4">
          <p className="text-sm text-muted-foreground">Out of sync</p>
          <p
            className={
              outOfSyncCount > 0
                ? "mt-1 font-mono text-2xl font-medium tabular-nums text-danger"
                : "mt-1 font-mono text-2xl font-medium tabular-nums text-foreground"
            }
          >
            {outOfSyncCount}
          </p>
        </div>
      </div>

      <ReconciliationTable rows={rows} />
    </div>
  );
}
