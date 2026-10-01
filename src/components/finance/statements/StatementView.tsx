import { LuDownload } from "react-icons/lu";
import type { WeeklyStatement } from "@/lib/finance/statement-rules";
import { cn, formatNaira } from "@/lib/utils";

const HEALTH_TONE: Record<string, string> = { healthy: "text-success", monitor: "text-gold", attention: "text-danger" };

/** The on-screen weekly financial statement (Phase 7), rendered from the stored data. */
export function StatementView({ id, data }: { id: string; data: WeeklyStatement }) {
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="meta-label">Week</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{data.label}</p>
          <p className="text-xs text-muted-foreground">{data.isoWeek}</p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/admin/finance/statements/${id}/download?format=pdf`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-input px-3 text-sm text-foreground hover:bg-elevated">
            <LuDownload className="size-4" aria-hidden /> PDF
          </a>
          <a href={`/api/admin/finance/statements/${id}/download?format=xlsx`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-input px-3 text-sm text-foreground hover:bg-elevated">
            <LuDownload className="size-4" aria-hidden /> Excel
          </a>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-5">
        <Stat label="Revenue (net)" value={formatNaira(data.revenue.net)} big />
        <Stat label="Commissions accrued" value={formatNaira(data.commissions.total)} />
        <Stat label="Paid out" value={formatNaira(data.payouts.total)} />
        <Stat label="Cash position" value={formatNaira(data.position)} big tone={data.position < 0 ? "text-danger" : undefined} />
        <Stat label="Outstanding owed" value={formatNaira(data.outstanding)} />
      </dl>

      <Section title="Revenue">
        <Row label="Downpayments" value={formatNaira(data.revenue.downpayments)} />
        <Row label="Balances" value={formatNaira(data.revenue.balances)} />
        <Row label="Refunds out" value={`−${formatNaira(data.revenue.refundsOut)}`} />
        <Row label="Net revenue" value={formatNaira(data.revenue.net)} strong />
        {data.revenue.byProject.length > 0 ? (
          <div className="pt-2">
            <p className="meta-label">By project</p>
            {data.revenue.byProject.map((p) => (
              <Row key={p.projectCode} label={`${p.projectCode} — ${p.clientName}`} value={formatNaira(p.amount)} />
            ))}
          </div>
        ) : null}
      </Section>

      <Section title="Commissions accrued this week">
        {data.commissions.groups.length === 0 ? <Empty /> : data.commissions.groups.map((g) => <Row key={g.leg} label={`${g.label} (${g.count})`} value={formatNaira(g.amount)} />)}
        {data.commissions.groups.length > 0 ? <Row label="Total" value={formatNaira(data.commissions.total)} strong /> : null}
      </Section>

      <Section title="Paid out this week">
        {data.payouts.batches.length === 0 && data.payouts.founderDraws.length === 0 ? <Empty /> : null}
        {data.payouts.batches.map((b) => (
          <Row key={`${b.cohort}-${b.periodKey}`} label={`${b.cohort} ${b.periodKey} (${b.recipientCount})`} value={formatNaira(b.amount)} />
        ))}
        {data.payouts.founderDraws.map((d, i) => (
          <Row key={i} label={`Founder draw — ${d.recipient} (${d.drawType})`} value={formatNaira(d.amount)} />
        ))}
        {data.payouts.total > 0 ? <Row label="Total" value={formatNaira(data.payouts.total)} strong /> : null}
      </Section>

      <Section title="Pot movements">
        {data.pots.byPot.map((p) => (
          <div key={p.key} className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
            <span className="text-muted-foreground">{p.label}</span>
            <span className="font-mono tabular-nums text-foreground">
              {formatNaira(p.opening)} <span className="text-muted-foreground">+{formatNaira(p.in)} −{formatNaira(p.out)}</span> = {formatNaira(p.closing)}
            </span>
          </div>
        ))}
        <Row label="All pots" value={`${formatNaira(data.pots.opening)} → ${formatNaira(data.pots.closing)}`} strong />
      </Section>

      {data.refunds.count > 0 ? (
        <Section title={`Refunds (${data.refunds.count})`}>
          {data.refunds.items.map((x, i) => (
            <Row key={i} label={`${x.projectCode} (stage ${x.stage}) — ${x.reason}`} value={formatNaira(x.amount)} />
          ))}
          <Row label="Total refunded" value={formatNaira(data.refunds.amount)} strong />
        </Section>
      ) : null}

      <Section title="Bucket health (week end)">
        {data.buckets.map((b) => (
          <div key={b.bucket} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
            <span className="text-foreground">
              {b.label} <span className={cn("text-xs", HEALTH_TONE[b.health.level] ?? "text-muted-foreground")}>· {b.health.level} ({b.health.percent}%)</span>
            </span>
            <span className="font-mono tabular-nums text-foreground">{formatNaira(b.balance)}</span>
          </div>
        ))}
      </Section>

      {data.notes ? (
        <Section title="Notes">
          <p className="text-sm text-foreground">{data.notes}</p>
        </Section>
      ) : null}
    </div>
  );
}

function Stat({ label, value, big, tone }: { label: string; value: string; big?: boolean; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="meta-label">{label}</dt>
      <dd className={cn("mt-1 truncate font-mono font-medium tabular-nums", tone ?? "text-foreground", big ? "text-2xl" : "text-lg")}>{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      <div className="mt-2 divide-y divide-border/70">{children}</div>
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className={cn("min-w-0 text-sm", strong ? "font-semibold text-foreground" : "text-foreground")}>{label}</span>
      <span className={cn("shrink-0 font-mono tabular-nums", strong ? "text-sm font-semibold text-foreground" : "text-sm text-foreground")}>{value}</span>
    </div>
  );
}

function Empty() {
  return <p className="py-2 text-sm text-muted-foreground">Nothing this week.</p>;
}
