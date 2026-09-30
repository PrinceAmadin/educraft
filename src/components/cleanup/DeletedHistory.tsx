import { LuChevronDown } from "react-icons/lu";
import { CLEANUP_TEXT } from "@/lib/project-cleanup";
import type { DeletedRow } from "@/lib/services/project-cleanup";
import { formatDateTime, formatNaira } from "@/lib/utils";

/** Every project the founder deleted as test data: what went, who deleted it, why. */
export function DeletedHistory({ rows }: { rows: DeletedRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{CLEANUP_TEXT.historyEmpty}</p>;
  return (
    <ul>
      {rows.map((r) => {
        const s = r.summary;
        return (
          <li key={r.code} className="border-t border-border/70 py-3 first:border-t-0">
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-mono font-medium text-foreground">{r.code}</span>
                    <span className="truncate text-muted-foreground">{r.title ?? "Untitled project"}</span>
                  </span>
                  <span className="block text-[13px] text-muted-foreground">
                    Deleted by {r.deletedByName}, {formatDateTime(r.deletedAt)}. {r.line}
                  </span>
                </span>
                <LuChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 rounded-2xl bg-zone p-4 text-sm sm:grid-cols-2">
                <Item label="Reason">{r.reason}</Item>
                <Item label="Client">
                  {r.clientName ?? "—"} {r.clientCode ? <span className="font-mono">{r.clientCode}</span> : null}
                  {r.clientDeleted ? ` (deleted${r.loginDeleted ? ", with their login" : ""})` : " (kept)"}
                </Item>
                {r.flaggedByName ? <Item label="Flagged by">{r.flaggedByName}</Item> : null}
                <Item label="Was">
                  {r.status.replace(/_/g, " ").toLowerCase()} · <span className="font-mono">{formatNaira(r.price)}</span>
                </Item>
                {s.payments.length ? (
                  <Item label="Payments removed">
                    {s.payments.map((p) => `${p.paymentId} ${formatNaira(p.amount)} (${p.status.toLowerCase()})`).join(", ")}
                  </Item>
                ) : null}
                {s.buckets.retained ? <Item label="Taken out of the buckets">{formatNaira(s.buckets.retained)}</Item> : null}
                {s.payouts.length ? (
                  <Item label="Payout records removed">{s.payouts.map((p) => `${p.recipientName} ${formatNaira(p.amount)}`).join(", ")}</Item>
                ) : null}
                {s.ambassadors.length ? (
                  <Item label="Ambassadors recounted">
                    {s.ambassadors
                      .map((a) => `${a.name}: ${a.conversionsBefore} → ${a.conversionsAfter} clients${a.tierBefore !== a.tierAfter ? `, ${tierName(a.tierBefore)} → ${tierName(a.tierAfter)}` : ""}`)
                      .join("; ")}
                  </Item>
                ) : null}
                {s.aiSpendKept ? <Item label="Claude spend kept">{formatNaira(s.aiSpendKept, { decimals: true })}</Item> : null}
              </dl>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

/** "SILVER" → "Silver". */
function tierName(tier: string): string {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="meta-label">{label}</dt>
      <dd className="mt-1 break-words text-foreground">{children}</dd>
    </div>
  );
}
