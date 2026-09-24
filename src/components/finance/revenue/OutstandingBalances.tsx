import Link from "next/link";
import { LuMessageCircle, LuReceipt } from "react-icons/lu";
import { EmptyState } from "@/components/shared/EmptyState";
import { AGING_BAND_META, AGING_BANDS, type AgingBand } from "@/lib/finance/revenue-constants";
import type { OutstandingBalances as OutstandingData } from "@/lib/services/finance/revenue";
import { cn, formatDate, formatNaira } from "@/lib/utils";

const BAND_TONE: Record<AgingBand, string> = {
  normal: "text-muted-foreground",
  follow_up: "text-gold",
  escalate: "text-danger",
};

/**
 * Balances still owed, grouped by how long since the downpayment: the CFO's
 * chase list. Each row opens a WhatsApp chat with the reminder already typed.
 */
export function OutstandingBalances({ data }: { data: OutstandingData }) {
  if (data.rows.length === 0) {
    return <EmptyState icon={LuReceipt} title="Nothing outstanding" description="Every project with a downpayment in has its balance verified." />;
  }

  return (
    <div className="space-y-10">
      <dl className="grid grid-cols-3 gap-x-6 gap-y-4">
        {AGING_BANDS.map((band) => (
          <div key={band} className="min-w-0">
            <dt className={cn("text-[13px] font-medium", BAND_TONE[band])}>{AGING_BAND_META[band].label}</dt>
            <dd className="mt-1 font-mono text-lg font-medium tabular-nums text-foreground">{formatNaira(data.bands[band].amount, { compact: true })}</dd>
            <dd className="mt-0.5 text-xs text-muted-foreground">
              {data.bands[band].count} project{data.bands[band].count === 1 ? "" : "s"}
            </dd>
          </div>
        ))}
      </dl>

      {AGING_BANDS.slice()
        .reverse()
        .map((band) => {
          const rows = data.rows.filter((r) => r.band === band);
          if (rows.length === 0) return null;
          return (
            <section key={band} aria-labelledby={`band-${band}`}>
              <h3 id={`band-${band}`} className={cn("text-[15px] font-semibold", BAND_TONE[band] === "text-muted-foreground" ? "text-foreground" : BAND_TONE[band])}>
                {AGING_BAND_META[band].label}
                <span className="ml-2 text-[13px] font-normal text-muted-foreground">{AGING_BAND_META[band].hint}</span>
              </h3>
              <ul className="mt-2 divide-y divide-border/70">
                {rows.map((r) => (
                  <li key={r.projectDbId} className="py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-x-6">
                    {/* Phone: name and amount on one line, the rest under it; desktop: three columns. */}
                    <div className="flex items-start justify-between gap-3 sm:block">
                      <p className="min-w-0 truncate text-sm font-medium text-foreground">
                        {r.clientName}
                        <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{r.clientId}</span>
                      </p>
                      <span className="shrink-0 font-mono text-sm font-medium tabular-nums text-foreground sm:hidden">{formatNaira(r.balanceAmount)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground sm:col-start-1 sm:row-start-2">
                      <Link href={`/admin/projects/${r.projectCode}?tab=financials`} className="font-mono hover:underline">
                        {r.projectCode}
                      </Link>
                      {" · "}
                      {r.serviceName}
                      {" · downpayment "}
                      {formatDate(r.since)} ({r.daysSince} day{r.daysSince === 1 ? "" : "s"} ago)
                      {r.balanceStatus === "Paid" ? " · marked paid, awaiting verification" : ""}
                    </p>
                    <span className="hidden font-mono text-sm font-medium tabular-nums text-foreground sm:col-start-2 sm:row-span-2 sm:block">
                      {formatNaira(r.balanceAmount)}
                    </span>
                    <div className="mt-2 sm:col-start-3 sm:row-span-2 sm:mt-0">
                      {r.reminderHref ? (
                        <a
                          href={r.reminderHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="-ml-2.5 inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-primary transition-colors hover:bg-zone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:ml-0"
                        >
                          <LuMessageCircle className="size-4" aria-hidden />
                          Send reminder
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground" title={r.clientPhone}>
                          No WhatsApp number
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
    </div>
  );
}
