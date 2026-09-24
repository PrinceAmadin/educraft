import type { AnnualReport, FinanceReport, MonthFigures, MonthlyReport, SemesterReport } from "@/lib/services/finance/reports";
import { cn, formatDate, formatNaira } from "@/lib/utils";

function Row({ label, value, strong, tone, stack }: { label: string; value: string; strong?: boolean; tone?: "success" | "danger"; stack?: boolean }) {
  return (
    <div
      className={cn(
        "py-1.5 text-sm",
        // A long value (a comparison) sits under its label on phones and beside it from sm.
        stack ? "flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3" : "flex items-center justify-between gap-3",
        strong && "mt-1.5 border-t border-border pt-3"
      )}
    >
      <span className={strong ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
      <span className={cn("font-mono tabular-nums", strong ? "font-semibold" : "", tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground")}>{value}</span>
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: string }) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {aside ? <p className="text-[13px] text-muted-foreground">{aside}</p> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function change(pct: number | null): string {
  if (pct == null) return "no comparison";
  if (pct === 0) return "unchanged";
  return `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}%`;
}

function money(n: number): string {
  return formatNaira(n, { decimals: !Number.isInteger(n) });
}

function MonthsTable({ months }: { months: MonthFigures[] }) {
  return (
    <>
      <ul className="divide-y divide-border/70 md:hidden">
        {months.map((m) => (
          <li key={m.month} className="py-3">
            <p className="text-sm font-medium text-foreground">{m.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Revenue {money(m.revenue)} · payouts {money(m.payouts.owed)} · retained {money(m.retained)} · expenses {money(m.operatingExpenses)} · net {money(m.netProfit)}
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="py-2 font-medium">Month</th>
              <th scope="col" className="py-2 text-right font-medium">Revenue</th>
              <th scope="col" className="py-2 text-right font-medium">Payouts</th>
              <th scope="col" className="py-2 text-right font-medium">Retained</th>
              <th scope="col" className="py-2 text-right font-medium">Expenses</th>
              <th scope="col" className="py-2 text-right font-medium">Net profit</th>
              <th scope="col" className="py-2 text-right font-medium">Completed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {months.map((m) => (
              <tr key={m.month}>
                <td className="py-2.5 text-foreground">{m.label}</td>
                <td className="py-2.5 text-right font-mono tabular-nums text-foreground">{money(m.revenue)}</td>
                <td className="py-2.5 text-right font-mono tabular-nums text-foreground">{money(m.payouts.owed)}</td>
                <td className="py-2.5 text-right font-mono tabular-nums text-foreground">{money(m.retained)}</td>
                <td className="py-2.5 text-right font-mono tabular-nums text-foreground">{money(m.operatingExpenses)}</td>
                <td className={cn("py-2.5 text-right font-mono tabular-nums", m.netProfit < 0 ? "text-danger" : "text-foreground")}>{money(m.netProfit)}</td>
                <td className="py-2.5 text-right font-mono tabular-nums text-foreground">{m.completed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Totals({ f, title }: { f: MonthFigures; title: string }) {
  return (
    <Section title={title}>
      <div className="grid gap-x-10 gap-y-6 rounded-2xl bg-zone p-5 sm:p-7 lg:grid-cols-2">
        <div>
          <Row label="Total revenue" value={money(f.revenue)} />
          {f.refunds > 0 ? <Row label="Refunds" value={`− ${money(f.refunds)}`} /> : null}
          <Row label="Payouts owed (workers, ambassadors, executives)" value={money(f.payouts.owed)} />
          <Row label="Payouts confirmed paid" value={money(f.payouts.paid)} />
          <Row label="Net retained" value={money(f.retained)} strong />
          <Row label="Operating expenses" value={money(f.operatingExpenses)} />
          <Row label="Net profit (retained less expenses)" value={money(f.netProfit)} strong tone={f.netProfit >= 0 ? "success" : "danger"} />
        </div>
        <div>
          <Row label="Workers (40%)" value={money(f.payouts.byLeg.WORKER)} />
          <Row label="Ambassadors" value={money(f.payouts.byLeg.AMBASSADOR)} />
          <Row label="Core overrides" value={money(f.payouts.byLeg.PARENT)} />
          <Row label="Ambassador quarterly bonuses" value={money(f.payouts.byLeg.BONUS ?? 0)} />
          <Row label="Head of Growth (2.5%)" value={money(f.payouts.byLeg.HOG)} />
          <Row label="Chief Operating Officer (2.5%)" value={money(f.payouts.byLeg.COO)} />
          <Row label="Founder draws distributed" value={money(f.founderDraws)} />
          <Row label="Projects completed" value={String(f.completed)} strong />
        </div>
      </div>
    </Section>
  );
}

function Monthly({ r }: { r: MonthlyReport }) {
  const f = r.figures;
  return (
    <>
      <Totals f={f} title={`Summary — ${r.period.label}`} />
      <Section title="Bucket balances and movements">
        <ul className="divide-y divide-border/70">
          {r.buckets.movements.map((m) => {
            const card = r.buckets.cards.find((c) => c.bucket === m.bucket);
            return (
              <li key={m.bucket} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2.5 text-sm">
                <span className="text-foreground">{m.label}</span>
                <span className="text-xs text-muted-foreground">
                  in {money(m.inflow)} · out {money(m.outflow)} · balance <span className="font-mono text-foreground">{money(m.balance)}</span>
                  {card ? ` · ${card.health.percent}% of target` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>
      <Section title="Expenses by category">
        {r.expensesByCategory.length === 0 ? <p className="text-sm text-muted-foreground">No operating expenses this month.</p> : r.expensesByCategory.map((e) => <Row key={e.category} label={e.category} value={money(e.amount)} />)}
      </Section>
      <Section title="Founder draws distributed">
        {r.founderDraws.length === 0 ? (
          <p className="text-sm text-muted-foreground">No founder draws distributed this month.</p>
        ) : (
          r.founderDraws.map((d, i) => <Row key={i} label={`${d.recipient} — ${d.drawType.replace(/_/g, " ").toLowerCase()}${d.distributedAt ? ` · ${formatDate(d.distributedAt)}` : ""}`} value={money(d.amount)} />)
        )}
      </Section>
      <Section title="Outstanding balances">
        <Row label="Projects owing a balance" value={String(r.outstanding.count)} />
        <Row label="Amount outstanding" value={money(r.outstanding.amount)} />
        <Row label="Overdue (more than 7 days)" value={`${r.outstanding.overdueCount} · ${money(r.outstanding.overdueAmount)}`} />
      </Section>
      <Section title={`Compared with ${r.previous.label}`}>
        <Row label="Revenue" value={`${money(r.previous.revenue)} → ${money(f.revenue)} · ${change(r.comparison.revenue)}`} stack />
        <Row label="Payouts owed" value={`${money(r.previous.payouts.owed)} → ${money(f.payouts.owed)} · ${change(r.comparison.payouts)}`} stack />
        <Row label="Net retained" value={`${money(r.previous.retained)} → ${money(f.retained)} · ${change(r.comparison.retained)}`} stack />
        <Row label="Operating expenses" value={`${money(r.previous.operatingExpenses)} → ${money(f.operatingExpenses)} · ${change(r.comparison.operatingExpenses)}`} stack />
        <Row label="Net profit" value={`${money(r.previous.netProfit)} → ${money(f.netProfit)} · ${change(r.comparison.netProfit)}`} stack />
        <Row label="Projects completed" value={`${r.previous.completed} → ${f.completed} · ${change(r.comparison.completed)}`} stack />
      </Section>
    </>
  );
}

function Semester({ r }: { r: SemesterReport }) {
  const a = r.surplus.analysis;
  const rec = r.surplus.recommendation;
  return (
    <>
      <Section title="Month by month" aside={`${r.months.length} month${r.months.length === 1 ? "" : "s"} so far`}>
        <MonthsTable months={r.months} />
      </Section>
      <Totals f={r.totals} title={`Cumulative — ${r.period.label}`} />
      <Section title="Bucket surplus analysis">
        <div className="grid gap-x-10 lg:grid-cols-2">
          <div>
            <Row label="Required minimum reserve (3 months of operating cost)" value={money(a.requiredMinimum)} />
            <Row label="Operations Reserve now" value={money(r.surplus.operationsReserve)} />
            <Row label="Surplus above the minimum" value={money(a.operationsSurplus)} />
            <Row label="Released from Operations (half)" value={money(a.operationsRelease)} strong />
          </div>
          <div>
            <Row label="Founder Distribution accumulated" value={money(r.surplus.founderDistributionInflows)} />
            <Row label="Already paid as monthly draws" value={`− ${money(r.surplus.founderDrawsPaid)}`} />
            <Row label="Available from Founder Distribution" value={money(a.founderAvailable)} strong />
          </div>
        </div>
        <Row label="Total semester bonus available" value={`${money(a.total)} (${money(a.each)} each)`} strong />
        <p className="mt-2 text-sm text-muted-foreground">
          {rec
            ? rec.status === "PENDING"
              ? `Recommended ${formatDate(rec.createdAt)}: ${money(rec.amountEach)} each, awaiting the founder.`
              : rec.status === "DISTRIBUTED"
                ? `Distributed: ${money(rec.amountEach)} each.`
                : `Declined: ${money(rec.amountEach)} each stayed in the buckets.`
            : "No recommendation has been made for this semester."}
        </p>
      </Section>
      <Section title="Founder draws this year" aside={money(r.founderDrawsYearToDate)}>
        <ul className="divide-y divide-border/70">
          {r.bucketCards.map((c) => (
            <li key={c.bucket} className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="text-foreground">{c.label}</span>
              <span className="font-mono tabular-nums text-foreground">
                {money(c.balance)} <span className="text-xs text-muted-foreground">· {c.health.percent}% of target</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

function Annual({ r }: { r: AnnualReport }) {
  const ps = r.profitShare;
  return (
    <>
      <Section title="Month by month">
        <MonthsTable months={r.months} />
      </Section>
      <Totals f={r.totals} title={`Year summary — ${r.period.label}`} />
      <Section title="Expenses by category">
        {r.expensesByCategory.length === 0 ? <p className="text-sm text-muted-foreground">No operating expenses this year.</p> : r.expensesByCategory.map((e) => <Row key={e.category} label={e.category} value={money(e.amount)} />)}
      </Section>
      <Section title="Annual profit share">
        <Row label="All bucket balances" value={money(ps.share.totalBalances)} />
        <Row label="Next quarter operating reserve (3 months)" value={money(ps.share.q1Reserve)} />
        <Row label="Available for profit share" value={money(ps.share.available)} strong />
        <Row label="Each founder" value={money(ps.share.each)} strong />
        <p className="mt-2 text-sm text-muted-foreground">
          {ps.recommendation ? `Status: ${ps.recommendation.status.toLowerCase()}.` : ps.open ? "Not yet recommended — the CFO recommends it on Founder draws." : "Decided in December after the year-end report."}
        </p>
      </Section>
      <Section title="Tax-relevant totals">
        <Row label="Total revenue" value={money(r.tax.totalRevenue)} />
        <Row label="Paid out to workers, ambassadors and executives" value={money(r.tax.totalPayouts)} />
        <Row label="Operating expenses" value={money(r.tax.totalExpenses)} />
        <Row label="Net profit" value={money(r.tax.netProfit)} strong tone={r.tax.netProfit >= 0 ? "success" : "danger"} />
      </Section>
    </>
  );
}

/** The report on screen, section by section, the same figures the .docx carries. */
export function ReportView({ report }: { report: FinanceReport }) {
  return <div className="space-y-10">{report.type === "monthly" ? <Monthly r={report.data} /> : report.type === "semester" ? <Semester r={report.data} /> : <Annual r={report.data} />}</div>;
}
