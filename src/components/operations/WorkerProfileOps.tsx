import Link from "next/link";
import { LuCircleCheck, LuTriangleAlert } from "react-icons/lu";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { WorkerFlagList } from "@/components/operations/WorkerFlagList";
import { WORKER_TARGETS } from "@/lib/operations/worker-performance";
import { cn, formatDate, formatDateTime, formatNaira } from "@/lib/utils";
import type { WorkerProfileOps as WorkerProfileOpsData } from "@/lib/services/operations/workers-ops";
import type { ProjectStatus } from "@prisma/client";

const DEADLINE_TEXT = {
  none: "text-muted-foreground",
  ok: "text-success",
  soon: "text-gold",
  urgent: "text-gold",
  critical: "text-danger",
  overdue: "text-danger font-medium",
} as const;

function Rate({ label, value, target, count, total, higherIsBetter = true }: { label: string; value: number | null; target: number; count?: number; total?: number; higherIsBetter?: boolean }) {
  const ok = value == null ? null : higherIsBetter ? value >= target : value <= target;
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/70 py-2 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-2 text-right">
        <span className="font-mono text-sm tabular-nums text-foreground">{value == null ? "—" : `${value}%`}</span>
        <span className="text-[12px] text-muted-foreground">
          (target {target}%{total != null ? ` · ${count} of ${total}` : ""})
        </span>
        {ok == null ? null : ok ? (
          <LuCircleCheck className="size-4 text-success" aria-label="At target" />
        ) : (
          <LuTriangleAlert className={cn("size-4", value != null && value >= target - 5 ? "text-gold" : "text-danger")} aria-label="Below target" />
        )}
      </dd>
    </div>
  );
}

const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Intl.DateTimeFormat("en-NG", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, mo - 1, 1)));
};

/**
 * The operational half of the worker profile: the performance summary
 * against targets, active and recently completed projects, earnings by
 * month from the payout engine, Tier 2 flags, and the COO's notes.
 */
export function WorkerProfileOps({ workerId, data }: { workerId: string; data: WorkerProfileOpsData }) {
  const p = data.performance;
  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-[15px] font-semibold text-foreground">
          Performance summary <span className="ml-1 text-[13px] font-normal text-muted-foreground">last {p.periodDays} days</span>
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-10 lg:grid-cols-2">
          <div>
            <div className="flex items-baseline justify-between gap-4 border-b border-border/70 py-2">
              <dt className="text-sm text-muted-foreground">Total projects delivered</dt>
              <dd className="font-mono text-sm tabular-nums text-foreground">{p.totalCompleted}</dd>
            </div>
            <Rate label="On-time delivery rate" value={p.onTimeRate} target={WORKER_TARGETS.onTimeRate} count={p.counts.onTime} total={p.counts.withDeadline} />
            <Rate label="QA first-pass rate" value={p.qaFirstPassRate} target={WORKER_TARGETS.qaFirstPassRate} count={p.counts.firstPass} total={p.totalCompleted} />
            <Rate label="Supervisor acceptance rate" value={p.supervisorAcceptRate} target={WORKER_TARGETS.supervisorAcceptRate} count={p.counts.accepted} total={p.totalCompleted} />
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-4 border-b border-border/70 py-2">
              <dt className="text-sm text-muted-foreground">Average quality (QA score)</dt>
              <dd className="font-mono text-sm tabular-nums text-foreground">{p.avgQuality != null ? `${p.avgQuality.toFixed(1)}/5.0` : "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-b border-border/70 py-2">
              <dt className="text-sm text-muted-foreground">Tier 2 reference flags (last 30 days)</dt>
              <dd className={cn("flex items-center gap-2 font-mono text-sm tabular-nums", p.tier2FlagCount >= 3 ? "text-danger" : p.tier2FlagCount > 0 ? "text-gold" : "text-foreground")}>
                {p.tier2FlagCount}
                {p.tier2FlagCount === 0 ? <LuCircleCheck className="size-4 text-success" aria-hidden /> : p.tier2FlagCount >= 3 ? <LuTriangleAlert className="size-4" aria-hidden /> : null}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-2">
              <dt className="text-sm text-muted-foreground">Average payout per month</dt>
              <dd className="font-mono text-sm tabular-nums text-foreground">{formatNaira(p.avgPayoutPerMonth)}</dd>
            </div>
          </div>
        </dl>
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-foreground">
          Active projects <span className="ml-1 font-mono text-[13px] font-normal tabular-nums text-muted-foreground">{data.active.length}</span>
        </h2>
        {data.active.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing assigned right now.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border/70">
            {data.active.map((a) => (
              <li key={a.projectCode} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                <Link href={`/admin/projects/${a.projectCode}`} className="font-mono font-medium text-foreground hover:text-primary">
                  {a.projectCode}
                </Link>
                <span className="text-muted-foreground">{a.department || "—"}</span>
                <span className="text-muted-foreground">{a.serviceName}</span>
                <StatusBadge status={a.status as ProjectStatus} short />
                <span className={cn("ml-auto text-[13px]", DEADLINE_TEXT[a.urgency])}>
                  {a.deadline ? `${a.urgency === "overdue" ? "OVERDUE · " : ""}${formatDate(a.deadline)} deadline` : "No deadline"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-foreground">
          Completed projects — last 30 days <span className="ml-1 font-mono text-[13px] font-normal tabular-nums text-muted-foreground">{data.completedRecent.length}</span>
        </h2>
        {data.completedRecent.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No deliveries in the last 30 days.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border/70">
            {data.completedRecent.map((c) => (
              <li key={c.projectCode} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                <Link href={`/admin/projects/${c.projectCode}`} className="font-mono font-medium text-foreground hover:text-primary">
                  {c.projectCode}
                </Link>
                <span className="text-muted-foreground">{c.department || "—"}</span>
                <span className="inline-flex items-center gap-1 text-success">
                  <LuCircleCheck className="size-3.5" aria-hidden /> Delivered {formatDate(c.deliveredAt)}
                </span>
                <span className={cn("text-[13px]", c.onTime === false ? "text-gold" : "text-muted-foreground")}>
                  {c.onTime == null ? "No deadline set" : c.onTime ? "On time" : `${c.lateDays} day${c.lateDays === 1 ? "" : "s"} late`}
                </span>
                <span className="text-[13px] text-muted-foreground">{c.corrections === 0 ? "Client satisfied" : `${c.corrections} correction round${c.corrections === 1 ? "" : "s"}`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-foreground">Earnings history</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">From the payout engine: what each month&apos;s completed projects earned them.</p>
        {data.earnings.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No payout records yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border/70">
            {data.earnings.map((e) => (
              <li key={e.month} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <span className="text-foreground">{monthLabel(e.month)}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono tabular-nums text-foreground">{formatNaira(e.amount)}</span>
                  <span className={cn("text-[13px]", e.status === "PAID" ? "text-success" : e.status === "PARTLY" ? "text-gold" : "text-muted-foreground")}>
                    {e.status === "PAID" ? `Paid${e.paidAt ? ` ${formatDate(e.paidAt)}` : ""}` : e.status === "PARTLY" ? `Partly paid (${formatNaira(e.paid)})` : "Pending"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-foreground">Tier 2 reference flag history</h2>
        <WorkerFlagList workerId={workerId} flags={data.flags} />
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-foreground">COO notes</h2>
        {data.notes.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="mt-2 space-y-2.5">
            {data.notes.map((n) => (
              <li key={n.id} className="text-sm">
                <p className="text-[12px] text-muted-foreground">
                  {formatDateTime(n.createdAt)}
                  {n.authorName ? ` · ${n.authorName}` : ""}
                  {n.kind !== "NOTE" ? ` · ${n.kind.replace(/_/g, " ").toLowerCase()}` : ""}
                </p>
                <p className="whitespace-pre-wrap text-foreground">{n.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
