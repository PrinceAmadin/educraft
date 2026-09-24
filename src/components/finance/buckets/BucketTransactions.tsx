import Link from "next/link";
import type { BucketType } from "@prisma/client";
import { LuListOrdered } from "react-icons/lu";
import { EmptyState } from "@/components/shared/EmptyState";
import { RevenuePager } from "@/components/finance/revenue/RevenuePager";
import { BUCKET_META, BUCKET_TYPES } from "@/lib/finance/commission-config";
import type { BucketTransactionRow } from "@/lib/services/finance/buckets";
import { cn, formatDate, formatNaira } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = { INFLOW: "Inflow", OUTFLOW: "Outflow", ADJUSTMENT: "Adjustment" };

/**
 * The bucket ledger for the month: every inflow, outflow and adjustment,
 * filtered by bucket through the URL so a view can be shared.
 */
export function BucketTransactions({
  month,
  bucket,
  data,
}: {
  month: string;
  bucket: BucketType | undefined;
  data: { rows: BucketTransactionRow[]; total: number; page: number; pageCount: number };
}) {
  const hrefFor = (b?: BucketType) => `/admin/finance/buckets?month=${month}${b ? `&bucket=${b}` : ""}`;
  const filters: { key: string; label: string; href: string; active: boolean }[] = [
    { key: "all", label: "All buckets", href: hrefFor(), active: !bucket },
    ...BUCKET_TYPES.map((b) => ({ key: b, label: BUCKET_META[b].label, href: hrefFor(b), active: bucket === b })),
  ];

  return (
    <section aria-labelledby="bucket-log-heading" className="space-y-4">
      <h2 id="bucket-log-heading" className="text-[15px] font-semibold text-foreground">
        Transaction log
      </h2>
      <nav aria-label="Bucket filter" className="no-scrollbar flex gap-1 overflow-x-auto">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={f.href}
            aria-current={f.active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center rounded-full px-3 text-[13px] font-medium transition-colors",
              f.active ? "bg-primary text-primary-foreground" : "bg-zone text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {data.rows.length === 0 ? (
        <EmptyState icon={LuListOrdered} title="No transactions this month" description="Confirmed payments, expenses paid from a bucket and adjustments appear here." />
      ) : (
        <>
          {/* Phone */}
          <ul className="divide-y divide-border/70 md:hidden">
            {data.rows.map((t) => (
              <li key={t.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm text-foreground">{t.description}</p>
                  <span className={cn("shrink-0 font-mono text-sm font-medium tabular-nums", t.amount < 0 ? "text-danger" : "text-foreground")}>
                    {t.amount < 0 ? "−" : "+"}
                    {formatNaira(Math.abs(t.amount), { decimals: !Number.isInteger(t.amount) })}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {BUCKET_META[t.bucketType].label} · {TYPE_LABEL[t.type] ?? t.type} · {formatDate(t.createdAt)}
                  {t.projectCode ? (
                    <>
                      {" · "}
                      <Link href={`/admin/projects/${t.projectCode}?tab=financials`} className="font-mono hover:underline">
                        {t.projectCode}
                      </Link>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>

          {/* Desktop */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-2 font-medium">Date</th>
                  <th scope="col" className="py-2 font-medium">Bucket</th>
                  <th scope="col" className="py-2 font-medium">Type</th>
                  <th scope="col" className="py-2 font-medium">Description</th>
                  <th scope="col" className="py-2 font-medium">Project</th>
                  <th scope="col" className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {data.rows.map((t) => (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap py-3 pr-3 text-muted-foreground">{formatDate(t.createdAt)}</td>
                    <td className="py-3 pr-3 text-foreground">{BUCKET_META[t.bucketType].label}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{TYPE_LABEL[t.type] ?? t.type}</td>
                    <td className="py-3 pr-3 text-foreground">{t.description}</td>
                    <td className="whitespace-nowrap py-3 pr-3 font-mono text-xs">
                      {t.projectCode ? (
                        <Link href={`/admin/projects/${t.projectCode}?tab=financials`} className="text-foreground hover:underline">
                          {t.projectCode}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={cn("whitespace-nowrap py-3 text-right font-mono font-medium tabular-nums", t.amount < 0 ? "text-danger" : "text-foreground")}>
                      {t.amount < 0 ? "−" : "+"}
                      {formatNaira(Math.abs(t.amount), { decimals: !Number.isInteger(t.amount) })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <RevenuePager page={data.page} pageCount={data.pageCount} total={data.total} pageSize={40} noun="transaction" />
        </>
      )}
    </section>
  );
}
