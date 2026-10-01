import { LuHistory } from "react-icons/lu";
import type { AuditEntry } from "@/lib/services/cashflow";
import { formatDateTime } from "@/lib/utils";

/** Plain-English labels for the audit actions the money settings write. */
const ACTION_LABEL: Record<string, string> = {
  published_version: "Published a new version",
  changed_hq_contact: "Changed the HQ contact details",
  bucket_adjustment: "Made a manual bucket adjustment",
  processed_refund: "Processed a refund",
  cleared_batch: "Cleared a payout batch",
  undid_batch: "Undid a payout batch",
  reversed_commission: "Reversed a commission",
  email_test: "Sent test emails",
  CRON_FAILURE: "Scheduler failure",
  BATCH_SKIPPED_EMPTY_WEEK: "Skipped an empty payout period",
};

function label(action: string): string {
  return ACTION_LABEL[action] ?? action.replace(/_/g, " ");
}

/**
 * The money-settings change history (founder + CFO only), rendered server-side
 * in a native <details> so it needs no client JS. Item 2.3 of the hardening pass.
 */
export function AuditHistory({ entries }: { entries: AuditEntry[] }) {
  return (
    <details className="group rounded-2xl bg-zone px-5 py-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground">
        <LuHistory className="size-4 text-muted-foreground" aria-hidden />
        Change history
        <span className="text-[13px] font-normal text-muted-foreground">({entries.length})</span>
      </summary>
      {entries.length ? (
        <ul className="mt-4 divide-y divide-border/70">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-foreground">{label(e.action)}</p>
                {e.reason ? <p className="text-[13px] text-muted-foreground">{e.reason}</p> : null}
              </div>
              <p className="shrink-0 text-[13px] text-muted-foreground">
                {e.actorName} · {formatDateTime(e.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">No changes recorded yet.</p>
      )}
    </details>
  );
}
