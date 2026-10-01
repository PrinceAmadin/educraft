import { LuCircleCheck, LuTriangleAlert } from "react-icons/lu";
import type { CronHealthLine } from "@/lib/services/finance/cron-health";

function ago(iso: string | null, now: number): string {
  if (!iso) return "never run";
  const ms = now - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

/**
 * The founder's cron-health card (Item 3): one line per scheduled job with its
 * last run, warning when a job has gone quiet (>25h) or failed. Server-rendered
 * on the Command Center; `now` is passed so the relative time is stable.
 */
export function CronHealthCard({ lines, now }: { lines: CronHealthLine[]; now: number }) {
  if (!lines.length) return null;
  const anyWarn = lines.some((l) => l.warn);
  return (
    <section className="rounded-2xl bg-zone px-5 py-4" aria-label="Automation health">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">Automation</p>
        {anyWarn ? (
          <span className="inline-flex items-center gap-1 text-[13px] font-medium text-danger">
            <LuTriangleAlert className="size-3.5" aria-hidden /> Needs a look
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[13px] font-medium text-success">
            <LuCircleCheck className="size-3.5" aria-hidden /> All running
          </span>
        )}
      </div>
      <ul className="mt-3 divide-y divide-border/70">
        {lines.map((l) => (
          <li key={l.job} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
            <span className="text-sm text-foreground">{l.label}</span>
            <span className={l.warn ? "text-[13px] font-medium text-danger" : "text-[13px] text-muted-foreground"}>
              {l.lastStatus === "error" ? "Last run failed · " : ""}
              {ago(l.lastRunAt, now)}
              {l.warn && l.lastStatus !== "error" ? " · scheduler quiet" : ""}
            </span>
          </li>
        ))}
      </ul>
      {anyWarn ? (
        <p className="mt-3 text-[13px] text-muted-foreground">
          If a job is quiet, payouts and reminders pause after the current work. Check the Supabase pg_cron job and the tick secret.
        </p>
      ) : null}
    </section>
  );
}
