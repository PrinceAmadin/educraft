import Link from "next/link";
import { LuArrowRight, LuCircleAlert, LuInfo } from "react-icons/lu";
import type { DashboardAlerts } from "@/lib/services/finance/dashboard";
import { cn, formatNaira } from "@/lib/utils";

interface Line {
  tone: "warn" | "info";
  text: string;
  href: string;
  cta: string;
}

function n(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** What needs a hand right now, each line pointing at the page that fixes it. */
export function NeedsAttention({ alerts }: { alerts: DashboardAlerts }) {
  const lines: Line[] = [];
  if (alerts.unpaidWorkers.count > 0) lines.push({ tone: "warn", text: `${n(alerts.unpaidWorkers.count, "worker")} have unpaid earnings (${formatNaira(alerts.unpaidWorkers.amount)})`, href: "/admin/finance/payouts", cta: "Payout engine" });
  if (alerts.unpaidAmbassadors.count > 0) lines.push({ tone: "warn", text: `${n(alerts.unpaidAmbassadors.count, "ambassador commission")} pending (${formatNaira(alerts.unpaidAmbassadors.amount)})`, href: "/admin/finance/payouts", cta: "Payout engine" });
  if (alerts.unpaidExecutives.count > 0) lines.push({ tone: "warn", text: `${n(alerts.unpaidExecutives.count, "executive commission")} pending (${formatNaira(alerts.unpaidExecutives.amount)})`, href: "/admin/finance/payouts", cta: "Payout engine" });
  if (alerts.overdueBalances.count > 0) lines.push({ tone: "warn", text: `${n(alerts.overdueBalances.count, "client")} ${alerts.overdueBalances.count === 1 ? "has" : "have"} an outstanding balance over 7 days (${formatNaira(alerts.overdueBalances.amount)})`, href: "/admin/finance/revenue?view=outstanding", cta: "Revenue tracker" });
  if (alerts.awaitingVerification.count > 0) lines.push({ tone: "warn", text: `${n(alerts.awaitingVerification.count, "payment")} marked paid, awaiting verification (${formatNaira(alerts.awaitingVerification.amount)})`, href: "/admin/finance/revenue?status=Pending", cta: "Revenue tracker" });
  if (alerts.duplicates.count > 0) lines.push({ tone: "warn", text: `${n(alerts.duplicates.count, "double payment")} held for refund (${formatNaira(alerts.duplicates.amount)})`, href: "/admin/finance/revenue?status=Duplicate", cta: "Revenue tracker" });
  if (alerts.pendingExpenses.count > 0) lines.push({ tone: "warn", text: `${n(alerts.pendingExpenses.count, "expense")} awaiting the founder's approval (${formatNaira(alerts.pendingExpenses.amount)})`, href: "/admin/finance/expenses?status=PENDING_APPROVAL", cta: "Expenses" });
  if (alerts.founderDrawPending.pending) {
    lines.push({
      tone: "info",
      text: alerts.founderDrawPending.funded
        ? `Founder draws not yet distributed this month (${formatNaira(alerts.founderDrawPending.outstanding)})`
        : `Founder draws not fully funded this month (${formatNaira(alerts.founderDrawPending.outstanding)} due)`,
      href: "/admin/finance/founder-draws",
      cta: "Founder draws",
    });
  }
  if (alerts.semesterBonusPending) lines.push({ tone: "info", text: "A semester bonus recommendation is waiting for the founder", href: "/admin/finance/founder-draws", cta: "Founder draws" });

  return (
    <section aria-labelledby="attention-heading" className="rounded-2xl bg-zone p-5 sm:p-7">
      <h2 id="attention-heading" className="text-[15px] font-semibold text-foreground">
        Needs attention
      </h2>
      {lines.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nothing waiting: payouts are paid, balances are current, nothing is pending.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border/70">
          {lines.map((l) => (
            <li key={l.text} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
              <span className="flex min-w-0 items-start gap-2 text-sm text-foreground">
                {l.tone === "warn" ? <LuCircleAlert className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden /> : <LuInfo className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />}
                <span className={cn(l.tone === "info" && "text-muted-foreground")}>{l.text}</span>
              </span>
              <Link href={l.href} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                {l.cta}
                <LuArrowRight className="size-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
