import type { Metadata } from "next";
import Link from "next/link";
import { LuWallet, LuChartLine, LuReceipt } from "react-icons/lu";
import { getPendingPayouts } from "@/lib/services/payouts";
import { getMonthToDateTotal } from "@/lib/services/expenses";
import { formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Finance" };
export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const [payouts, monthExpenses] = await Promise.all([getPendingPayouts(), getMonthToDateTotal()]);
  const pending = payouts.totals.workerAmount + payouts.totals.ambassadorAmount;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Finance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Payouts and expenses today; the full revenue dashboard and cash flow breakdown land here next.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/admin/finance/payouts"
          className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="inline-flex rounded-lg bg-primary/12 p-2 text-primary">
            <LuWallet className="size-5" aria-hidden />
          </span>
          <p className="mt-3 text-sm font-semibold text-foreground">Payout queue</p>
          <p className="mt-1 font-mono text-lg font-medium tabular-nums text-foreground">
            {formatNaira(pending)}
          </p>
          <p className="text-xs text-muted-foreground">
            owed to {payouts.totals.workerCount} worker
            {payouts.totals.workerCount === 1 ? "" : "s"} and {payouts.totals.ambassadorCount}{" "}
            ambassador{payouts.totals.ambassadorCount === 1 ? "" : "s"}
          </p>
        </Link>

        <div className="rounded-xl border border-dashed border-border bg-card p-4 opacity-70">
          <span className="inline-flex rounded-lg bg-elevated p-2 text-muted-foreground">
            <LuChartLine className="size-5" aria-hidden />
          </span>
          <p className="mt-3 text-sm font-semibold text-foreground">Revenue dashboard</p>
          <p className="mt-1 text-xs text-muted-foreground">Coming soon.</p>
        </div>

        <Link
          href="/admin/finance/expenses"
          className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="inline-flex rounded-lg bg-primary/12 p-2 text-primary">
            <LuReceipt className="size-5" aria-hidden />
          </span>
          <p className="mt-3 text-sm font-semibold text-foreground">Expenses</p>
          <p className="mt-1 font-mono text-lg font-medium tabular-nums text-foreground">
            {formatNaira(monthExpenses)}
          </p>
          <p className="text-xs text-muted-foreground">logged this month</p>
        </Link>
      </div>
    </div>
  );
}
