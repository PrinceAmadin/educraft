import type { Metadata } from "next";
import Link from "next/link";
import { LuCircleCheck, LuClock, LuShieldCheck, LuThumbsUp, LuTriangleAlert } from "react-icons/lu";
import { StatsCard, STATS_GRID } from "@/components/dashboard/StatsCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { MonthPicker } from "@/components/reports/MonthPicker";
import { OperationsReportExport } from "@/components/operations/OperationsReportExport";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getOperationsReport, type OperationsKpi } from "@/lib/services/operations/reports";
import { resolveMonth } from "@/lib/services/reports";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Operations reports" };
export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

function kpiDetail(k: OperationsKpi): { text: string; tone: "success" | "danger" | "gold" | "muted" } {
  if (k.value == null) return { text: `No data yet · target ${k.target}%`, tone: "muted" };
  return { text: `${k.ok ? "At" : "Below"} the ${k.target}% target · ${k.count} of ${k.total}`, tone: k.ok ? "success" : k.value >= k.target - 5 ? "gold" : "danger" };
}

const LABEL_TONE: Record<string, string> = {
  Excellent: "text-success",
  Good: "text-success",
  Watch: "text-gold",
  Review: "text-danger",
};

/** The COO's monthly operations review, the numbers he presents to the CEO. */
export default async function OperationsReportsPage({ searchParams }: { searchParams: { month?: string } }) {
  const report = await getOperationsReport(searchParams.month);
  const { month: currentMonth } = resolveMonth(undefined);
  const k = report.kpis;

  return (
    <div className="space-y-12">
      <PageHeader
        title="Operations reports"
        description={`${report.monthLabel} — delivery, quality and the worker league, generated from the database.`}
        actions={
          <>
            <MonthPicker month={report.month} currentMonth={currentMonth} basePath="/admin/reports/operations" />
            <OperationsReportExport month={report.month} />
          </>
        }
      />

      <section aria-label="Headline" className={STATS_GRID}>
        <StatsCard wrapLabel label="On-time delivery" value={pct(k.onTime.value)} detail={kpiDetail(k.onTime).text} detailTone={kpiDetail(k.onTime).tone} icon={LuClock} tone={k.onTime.ok === false ? "danger" : "primary"} />
        <StatsCard wrapLabel label="QA first-pass rate" value={pct(k.qaFirstPass.value)} detail={kpiDetail(k.qaFirstPass).text} detailTone={kpiDetail(k.qaFirstPass).tone} icon={LuShieldCheck} tone={k.qaFirstPass.ok === false ? "danger" : "primary"} />
        <StatsCard wrapLabel label="Supervisor acceptance" value={pct(k.supervisorAccept.value)} detail={kpiDetail(k.supervisorAccept).text} detailTone={kpiDetail(k.supervisorAccept).tone} icon={LuThumbsUp} tone={k.supervisorAccept.ok === false ? "danger" : "primary"} />
        <StatsCard
          wrapLabel
          label="Projects completed"
          value={String(k.completed.value)}
          detail={`vs ${k.completed.lastMonth} last month · ${k.completed.delivered} delivered`}
          detailTone={k.completed.value >= k.completed.lastMonth ? "success" : "gold"}
          icon={LuCircleCheck}
          tone="success"
        />
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-foreground">Pipeline health — average time per status</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">Transitions that completed this month, against the expected time set in Settings.</p>
        <ul className="mt-3 divide-y divide-border/70 md:hidden">
          {report.timing.map((t) => (
            <li key={t.key} className="py-2.5">
              <p className="text-sm text-foreground">{t.label}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13px] text-muted-foreground">
                <span className="font-mono tabular-nums text-foreground">{t.avgDays == null ? "—" : `${t.avgDays}d`}</span>
                <span>target {t.targetDays == null ? "by deadline" : `${t.targetDays}d`}</span>
                <span>{t.samples} project{t.samples === 1 ? "" : "s"}</span>
                {t.ok == null ? null : t.ok ? <span className="text-success">on target</span> : <span className="text-gold">slower than target</span>}
              </p>
            </li>
          ))}
        </ul>
        <Table className="mt-4 hidden md:table">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Step</TableHead>
              <TableHead className="text-right">Average</TableHead>
              <TableHead className="text-right">Target</TableHead>
              <TableHead className="text-right">Projects</TableHead>
              <TableHead>Verdict</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.timing.map((t) => (
              <TableRow key={t.key}>
                <TableCell className="text-sm">{t.label}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{t.avgDays == null ? "—" : `${t.avgDays}d`}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">{t.targetDays == null ? "by deadline" : `${t.targetDays}d`}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">{t.samples}</TableCell>
                <TableCell>
                  {t.ok == null ? (
                    <span className="text-sm text-muted-foreground">—</span>
                  ) : t.ok ? (
                    <span className="inline-flex items-center gap-1 text-sm text-success">
                      <LuCircleCheck className="size-4" aria-hidden /> on target
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm text-gold">
                      <LuTriangleAlert className="size-4" aria-hidden /> slower than target
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-foreground">Worker performance — {report.monthLabel}</h2>
        {report.league.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No projects were delivered this month.</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-border/70 md:hidden">
              {report.league.map((w) => (
                <li key={w.workerId} className="py-2.5">
                  <p className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="mr-2 font-mono tabular-nums text-muted-foreground">{w.rank}</span>
                      <Link href={`/admin/workers/${w.workerId}`} className="font-medium text-foreground hover:text-primary">
                        {w.name}
                      </Link>
                    </span>
                    <span className={cn("shrink-0 font-medium", LABEL_TONE[w.label])}>{w.label}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[12px] tabular-nums text-muted-foreground">
                    <span>{w.projects} project{w.projects === 1 ? "" : "s"}</span>
                    <span>on-time {pct(w.onTimeRate)}</span>
                    <span>QA {pct(w.qaFirstPassRate)}</span>
                    <span>sup. {pct(w.supervisorAcceptRate)}</span>
                    <span className={w.flags >= 3 ? "text-danger" : w.flags > 0 ? "text-gold" : ""}>{w.flags} flag{w.flags === 1 ? "" : "s"}</span>
                  </p>
                </li>
              ))}
            </ul>
            <Table className="mt-4 hidden md:table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-right">Rank</TableHead>
                  <TableHead>Worker</TableHead>
                  <TableHead className="text-right">Projects</TableHead>
                  <TableHead className="text-right">On-time</TableHead>
                  <TableHead className="text-right">QA pass</TableHead>
                  <TableHead className="text-right">Sup. accept</TableHead>
                  <TableHead className="text-right">Flags</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.league.map((w) => (
                  <TableRow key={w.workerId}>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{w.rank}</TableCell>
                    <TableCell>
                      <Link href={`/admin/workers/${w.workerId}`} className="text-sm font-medium text-foreground hover:text-primary">
                        {w.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{w.projects}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{pct(w.onTimeRate)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{pct(w.qaFirstPassRate)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{pct(w.supervisorAcceptRate)}</TableCell>
                    <TableCell className={cn("text-right font-mono text-sm tabular-nums", w.flags >= 3 ? "text-danger" : w.flags > 0 ? "text-gold" : "")}>{w.flags}</TableCell>
                    <TableCell className={cn("text-sm font-medium", LABEL_TONE[w.label])}>{w.label}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {report.star ? (
              <p className="mt-3 text-sm text-foreground">
                <span className="font-semibold">Monthly star:</span> {report.star.name} — {report.star.summary}.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-foreground">Projects by department — {report.monthLabel}</h2>
        {report.departments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No deliveries this month.</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-border/70 md:hidden">
              {report.departments.map((d) => (
                <li key={d.department} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 text-foreground">
                    {d.department}
                    <span className="block text-[12px] text-muted-foreground">
                      {d.projects} project{d.projects === 1 ? "" : "s"} · avg {d.avgDeliveryDays == null ? "—" : `${d.avgDeliveryDays} days`}
                    </span>
                  </span>
                  <span className={cn("shrink-0 font-mono tabular-nums", d.belowTarget ? "text-gold" : "text-foreground")}>{pct(d.onTimeRate)} on time</span>
                </li>
              ))}
            </ul>
            <Table className="mt-4 hidden md:table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Projects</TableHead>
                  <TableHead className="text-right">Avg delivery</TableHead>
                  <TableHead className="text-right">On-time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.departments.map((d) => (
                  <TableRow key={d.department}>
                    <TableCell className="text-sm">{d.department}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{d.projects}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{d.avgDeliveryDays == null ? "—" : `${d.avgDeliveryDays} days`}</TableCell>
                    <TableCell className={cn("text-right font-mono text-sm tabular-nums", d.belowTarget && "text-gold")}>
                      {pct(d.onTimeRate)}
                      {d.belowTarget ? <LuTriangleAlert className="ml-1 inline size-3.5" aria-label="Below target" /> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {report.departments.some((d) => d.belowTarget) ? (
              <p className="mt-3 text-[13px] text-muted-foreground">
                {report.departments
                  .filter((d) => d.belowTarget)
                  .map((d) => d.department)
                  .join(", ")}{" "}
                delivery is below target — check whether the workload is too high for the workers qualified there.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-foreground">Supervisor corrections — this month</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <Stat label="Projects delivered" value={String(report.corrections.delivered)} />
          <Stat label="0 corrections" value={`${report.corrections.zero}${share(report.corrections.zero, report.corrections.delivered)}`} tone="success" />
          <Stat label="1 correction" value={`${report.corrections.one}${share(report.corrections.one, report.corrections.delivered)}`} tone={report.corrections.one > 0 ? "gold" : undefined} />
          <Stat label="2+ corrections" value={`${report.corrections.twoPlus}${share(report.corrections.twoPlus, report.corrections.delivered)}`} tone={report.corrections.twoPlus > 0 ? "danger" : undefined} />
        </dl>
        {report.corrections.items.length > 0 ? (
          <ul className="mt-4 divide-y divide-border/70">
            {report.corrections.items.map((i) => (
              <li key={i.projectCode} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                <Link href={`/admin/projects/${i.projectCode}`} className="font-mono font-medium text-foreground hover:text-primary">
                  {i.projectCode}
                </Link>
                <span className="text-muted-foreground">{i.workerName ?? "—"}</span>
                <span className="text-muted-foreground">{i.department || "—"}</span>
                <span className="text-muted-foreground">
                  round {i.rounds} · {i.status}
                </span>
                {i.note ? <span className="w-full text-[13px] text-muted-foreground sm:w-auto sm:flex-1 sm:truncate">{i.note}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function share(n: number, total: number): string {
  return total ? ` (${Math.round((n / total) * 100)}%)` : "";
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "gold" | "danger" }) {
  return (
    <div>
      <dt className="meta-label">{label}</dt>
      <dd className={cn("mt-1 font-mono text-lg font-medium tabular-nums", tone === "success" ? "text-success" : tone === "gold" ? "text-gold" : tone === "danger" ? "text-danger" : "text-foreground")}>{value}</dd>
    </div>
  );
}
