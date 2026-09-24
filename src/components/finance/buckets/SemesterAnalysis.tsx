import { RecommendBonusButton } from "@/components/finance/buckets/RecommendBonusButton";
import type { SurplusAnalysis } from "@/lib/services/finance/surplus";
import { cn, formatDate, formatNaira } from "@/lib/utils";

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1.5 text-sm", strong && "mt-1.5 border-t border-border pt-3")}>
      <span className={muted ? "text-muted-foreground" : "text-foreground"}>{label}</span>
      <span className={cn("font-mono tabular-nums", strong ? "font-semibold text-foreground" : "text-foreground")}>{value}</span>
    </div>
  );
}

/**
 * The spec's semester-end analysis, in one zone: what Operations Reserve
 * can release above three months of operating cost, what Founder
 * Distribution has left after the monthly draws, and the CFO's
 * recommendation to the founder.
 */
export function SemesterAnalysis({ data, month, canAct }: { data: SurplusAnalysis; month: string; canAct: boolean }) {
  const a = data.analysis;
  const rec = data.recommendation;
  const disabledReason = !canAct
    ? null
    : rec?.status === "PENDING"
      ? `Recommended ${formatDate(rec.createdAt)}: ${formatNaira(rec.amountEach)} each, waiting on the founder.`
      : rec?.status === "DISTRIBUTED"
        ? `Distributed ${rec.distributedAt ? formatDate(rec.distributedAt) : ""}: ${formatNaira(rec.amountEach)} each.`
        : a.total <= 0
          ? "Nothing to release yet: Operations Reserve is at or under three months of operating cost and Founder Distribution has no surplus."
          : null;

  return (
    <section aria-labelledby="semester-heading" className="rounded-2xl bg-zone p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="semester-heading" className="text-[15px] font-semibold text-foreground">
          Semester end analysis
        </h2>
        <p className="text-[13px] text-muted-foreground">
          {data.semester.label}
          {data.semester.atEnd ? " · semester end" : " · in progress, figures to date"}
        </p>
      </div>

      <div className="mt-4 grid gap-x-10 gap-y-6 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Operations Reserve</h3>
          <Row label={`Required minimum (3 × ${formatNaira(data.operatingBaseline, { compact: true })} operating cost)`} value={formatNaira(a.requiredMinimum)} muted />
          <Row label="Balance now" value={formatNaira(data.operationsReserve)} />
          <Row label="Surplus above minimum" value={formatNaira(a.operationsSurplus)} />
          <Row label="Release as semester bonus (half the surplus)" value={formatNaira(a.operationsRelease)} strong />
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Founder Distribution</h3>
          <Row label="Accumulated this semester" value={formatNaira(data.founderDistributionInflows)} />
          <Row label="Already paid as monthly draws" value={`− ${formatNaira(data.founderDrawsPaid)}`} muted />
          <Row label="Available for semester bonus" value={formatNaira(a.founderAvailable)} strong />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-5">
        <div>
          <p className="meta-label">Total semester bonus available</p>
          <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-foreground">
            {formatNaira(a.total)}
            <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">({formatNaira(a.each)} each)</span>
          </p>
        </div>
        {canAct ? (
          <RecommendBonusButton month={month} each={a.each} disabledReason={disabledReason} />
        ) : rec?.status === "PENDING" ? (
          <p className="text-[13px] text-muted-foreground">Recommended {formatDate(rec.createdAt)}: {formatNaira(rec.amountEach)} each, waiting on the founder.</p>
        ) : null}
      </div>
    </section>
  );
}
