import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LuReceipt, LuRepeat } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { EmptyState } from "@/components/shared/EmptyState";
import { Pagination } from "@/components/shared/Pagination";
import { ExpensesFilterBar } from "@/components/finance/ExpensesFilterBar";
import { ExpensesTable } from "@/components/finance/ExpensesTable";
import { AddExpenseDialog } from "@/components/finance/AddExpenseDialog";
import {
  EXPENSE_PAGE_SIZE,
  getMonthToDateTotal,
  getProjectedRecurring,
  listExpenses,
} from "@/lib/services/expenses";
import { expenseListParamsSchema } from "@/lib/validations/expenses";
import { formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Expenses" };
export const dynamic = "force-dynamic";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const flat = Object.fromEntries(
    Object.entries(searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );
  const parsed = expenseListParamsSchema.parse(flat);

  const [session, { rows, total, page, pageCount, filteredTotal }, monthTotal, recurring] =
    await Promise.all([
      auth(),
      listExpenses(parsed),
      getMonthToDateTotal(),
      getProjectedRecurring(),
    ]);

  const canDelete = session?.user?.role === "SUPER_ADMIN";
  const hasFilters = Boolean(parsed.category || parsed.from || parsed.to);

  return (
    <div className="space-y-5">
      <Link
        href="/admin/finance"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Finance
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Expenses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What it costs to run EduCraft — software, marketing, equipment, and the rest.
          </p>
        </div>
        <AddExpenseDialog />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total expenses this month</p>
          <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-foreground">
            {formatNaira(monthTotal)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <LuRepeat className="size-3.5" aria-hidden />
            Projected recurring costs / month
          </p>
          <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-foreground">
            {formatNaira(recurring.monthlyTotal)}
          </p>
          {recurring.items.length > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              from {recurring.items.length} recurring item{recurring.items.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      </div>

      <ExpensesFilterBar />

      {rows.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={LuReceipt}
            title="No expenses match these filters"
            description="Try a different category or date range."
          />
        ) : (
          <EmptyState
            icon={LuReceipt}
            title="No expenses logged yet"
            description="Add the first one — software subscriptions, data, marketing spend."
          />
        )
      ) : (
        <div className="space-y-3">
          {hasFilters ? (
            <p className="text-sm text-muted-foreground">
              {total} expense{total === 1 ? "" : "s"} matching · {formatNaira(filteredTotal)} total
            </p>
          ) : null}
          <ExpensesTable rows={rows} canDelete={canDelete} />
          <Pagination page={page} pageCount={pageCount} total={total} pageSize={EXPENSE_PAGE_SIZE} />
        </div>
      )}
    </div>
  );
}
