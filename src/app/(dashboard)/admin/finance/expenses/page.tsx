import type { Metadata } from "next";
import { LuReceipt, LuRepeat } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { MonthPicker } from "@/components/reports/MonthPicker";
import { RevenuePager } from "@/components/finance/revenue/RevenuePager";
import { ExpensesFilterBar } from "@/components/finance/ExpensesFilterBar";
import { ExpensesTable } from "@/components/finance/ExpensesTable";
import { AddExpenseDialog } from "@/components/finance/AddExpenseDialog";
import { HogBudgetPanel } from "@/components/finance/HogBudgetPanel";
import { EXPENSE_PAGE_SIZE, getHogBudget, getMonthlyExpenseSummary, getProjectedRecurring, listExpenses, listPendingApprovals } from "@/lib/services/expenses";
import { currentMonthKey, monthLabel } from "@/lib/services/finance/surplus";
import { expenseListParamsSchema } from "@/lib/validations/expenses";
import { cn, formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Expenses" };
export const dynamic = "force-dynamic";

/**
 * Money going out, by bucket. The month leads (what each bucket paid and
 * for what), the founder's approvals sit next, then the HOG's sponsorship
 * budget and the list itself.
 */
export default async function ExpensesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const flat = Object.fromEntries(Object.entries(searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const parsed = expenseListParamsSchema.parse(flat);
  const currentMonth = currentMonthKey();
  const rangeMode = Boolean(parsed.from || parsed.to);
  const month = !rangeMode ? (parsed.month && parsed.month <= currentMonth ? parsed.month : currentMonth) : parsed.month ?? currentMonth;
  const filters = rangeMode ? parsed : { ...parsed, month };

  const [session, list, summary, recurring, pending, hogBudget] = await Promise.all([
    auth(),
    listExpenses(filters),
    getMonthlyExpenseSummary(month),
    getProjectedRecurring(),
    listPendingApprovals(),
    getHogBudget(month),
  ]);
  const role = session?.user?.role;
  const isFounder = role === "SUPER_ADMIN";
  const hasFilters = Boolean(parsed.category || parsed.bucket || parsed.status || parsed.from || parsed.to);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Expenses"
        description="What it costs to run EduCraft, and which bucket pays for it. Over ₦50,000 an expense waits for the founder before it leaves a bucket."
        back={{ href: "/admin/finance", label: "Finance" }}
        actions={
          <>
            <MonthPicker month={month} currentMonth={currentMonth} basePath="/admin/finance/expenses" />
            <AddExpenseDialog isFounder={isFounder} />
          </>
        }
      />

      {/* ── The month, by bucket ── */}
      <section aria-labelledby="bucket-summary-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="bucket-summary-heading" className="text-[15px] font-semibold text-foreground">
            {monthLabel(month)} by bucket
          </h2>
          <p className="text-[13px] text-muted-foreground">
            {formatNaira(summary.total)} out
            {summary.pending.count > 0 ? ` · ${formatNaira(summary.pending.amount)} awaiting approval` : ""}
            {summary.unbucketed.count > 0 ? ` · ${formatNaira(summary.unbucketed.total)} in ambassador commissions (off the 15%, no bucket)` : ""}
          </p>
        </div>
        <div className="mt-4 grid gap-x-10 gap-y-6 rounded-2xl bg-zone p-5 sm:p-7 lg:grid-cols-3">
          {summary.buckets.map((b) => (
            <div key={b.bucket} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-medium text-foreground">{b.label}</h3>
                <span className="font-mono text-lg font-medium tabular-nums text-foreground">{formatNaira(b.total)}</span>
              </div>
              {b.categories.length === 0 ? (
                <p className="mt-2 text-[13px] text-muted-foreground">Nothing this month.</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {b.categories.map((c) => (
                    <li key={c.category} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="text-muted-foreground">{c.category}</span>
                      <span className="font-mono tabular-nums text-foreground">{formatNaira(c.amount, { decimals: !Number.isInteger(c.amount) })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <LuRepeat className="size-3.5" aria-hidden />
          Projected recurring costs {formatNaira(recurring.monthlyTotal)} / month
          {recurring.items.length > 0 ? ` from ${recurring.items.length} recurring item${recurring.items.length === 1 ? "" : "s"}` : ""}
        </p>
      </section>

      {/* ── Waiting on the founder ── */}
      {pending.length > 0 ? (
        <section aria-labelledby="pending-heading" className="space-y-3">
          <h2 id="pending-heading" className={cn("text-[15px] font-semibold", isFounder ? "text-gold" : "text-foreground")}>
            Awaiting the founder&apos;s approval ({pending.length})
          </h2>
          <ExpensesTable rows={pending} canDelete={false} canApprove={isFounder} />
        </section>
      ) : null}

      <HogBudgetPanel budget={hogBudget} />

      {/* ── The list ── */}
      <section aria-labelledby="list-heading" className="space-y-4">
        <h2 id="list-heading" className="text-[15px] font-semibold text-foreground">
          {rangeMode ? "Expenses in range" : `Expenses in ${monthLabel(month)}`}
        </h2>
        <ExpensesFilterBar />
        {list.rows.length === 0 ? (
          <EmptyState
            icon={LuReceipt}
            title={hasFilters ? "No expenses match these filters" : "No expenses this month"}
            description={hasFilters ? "Try a different category, bucket or date range." : "Add the first one — software subscriptions, data, marketing spend."}
          />
        ) : (
          <>
            {hasFilters ? (
              <p className="text-[13px] text-muted-foreground">
                {list.total} expense{list.total === 1 ? "" : "s"} matching · {formatNaira(list.filteredTotal)} in all
              </p>
            ) : null}
            <ExpensesTable rows={list.rows} canDelete={isFounder} canApprove={isFounder} />
            <RevenuePager page={list.page} pageCount={list.pageCount} total={list.total} pageSize={EXPENSE_PAGE_SIZE} noun="expense" />
          </>
        )}
      </section>
    </div>
  );
}
