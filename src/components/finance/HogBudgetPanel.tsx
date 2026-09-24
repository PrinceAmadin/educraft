import type { HogBudget } from "@/lib/services/expenses";
import { FINANCE_DEFAULTS } from "@/lib/finance/commission-config";
import { cn, formatDate, formatNaira } from "@/lib/utils";

/**
 * The HOG's sponsorship budget for the quarter: set by the founder, spent
 * from the Growth Fund, with the recent spending under it. Shared by the
 * Expenses page (CFO) and the HOG's own page.
 */
export function HogBudgetPanel({ budget, title = "HOG sponsorship budget", showApprovalRule = false }: { budget: HogBudget; title?: string; showApprovalRule?: boolean }) {
  const pct = budget.budget > 0 ? Math.min(100, Math.round((budget.spent / budget.budget) * 100)) : 0;
  return (
    <section aria-labelledby="hog-budget-heading" className="rounded-2xl bg-zone p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="hog-budget-heading" className="text-[15px] font-semibold text-foreground">
          {title} — {budget.quarter.label}
        </h2>
        <p className="text-[13px] text-muted-foreground">Growth Fund</p>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-x-6 gap-y-3">
        <div>
          <dt className="meta-label">Quarterly budget</dt>
          <dd className="mt-1 font-mono text-lg font-medium tabular-nums text-foreground">{formatNaira(budget.budget)}</dd>
        </div>
        <div>
          <dt className="meta-label">Spent to date</dt>
          <dd className="mt-1 font-mono text-lg font-medium tabular-nums text-foreground">{formatNaira(budget.spent)}</dd>
        </div>
        <div>
          <dt className="meta-label">Remaining</dt>
          <dd className={cn("mt-1 font-mono text-lg font-medium tabular-nums", budget.remaining < 0 ? "text-danger" : "text-foreground")}>{formatNaira(budget.remaining)}</dd>
        </div>
      </dl>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-elevated" role="img" aria-label={`${pct}% of the budget spent`}>
        <div className={cn("h-full rounded-full", budget.remaining < 0 ? "bg-danger" : pct >= 80 ? "bg-gold" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      {showApprovalRule ? (
        <p className="mt-2 text-[13px] text-muted-foreground">
          Up to {formatNaira(FINANCE_DEFAULTS.expenseApprovalThreshold)}: the HOG approves independently. Above {formatNaira(FINANCE_DEFAULTS.expenseApprovalThreshold)}: the CEO&apos;s approval is required.
        </p>
      ) : null}
      {budget.pendingCount > 0 ? (
        <p className="mt-2 text-[13px] text-gold">
          {budget.pendingCount} sponsorship{budget.pendingCount === 1 ? "" : "s"} awaiting the founder&apos;s approval (not counted yet).
        </p>
      ) : null}

      <h3 className="mt-5 text-sm font-medium text-muted-foreground">Recent spending</h3>
      {budget.recent.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nothing logged this quarter.</p>
      ) : (
        <ul className="mt-1 divide-y divide-border/70">
          {budget.recent.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="min-w-0">
                <span className="mr-2 font-mono text-xs text-muted-foreground">{formatDate(r.date)}</span>
                <span className="text-foreground">{r.description}</span>
                {r.approvalStatus === "PENDING_APPROVAL" ? <span className="ml-2 text-[11px] text-gold">awaiting approval</span> : null}
              </span>
              <span className="shrink-0 font-mono tabular-nums text-foreground">{formatNaira(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
