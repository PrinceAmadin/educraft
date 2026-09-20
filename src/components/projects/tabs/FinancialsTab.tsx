import { LuCheck, LuClock } from "react-icons/lu";
import { financialBreakdown } from "@/lib/project-display";
import { PaymentVerification } from "@/components/projects/PaymentVerification";
import { AmbassadorAllocation } from "@/components/projects/AmbassadorAllocation";
import { MarkProBono } from "@/components/projects/MarkProBono";
import { cn, formatDate, formatNaira } from "@/lib/utils";
import type { ProjectDetail } from "@/lib/services/projects";
import type { AllocatableAmbassador } from "@/lib/services/ambassador-commission";

function PaymentStatusPill({ status, date }: { status: string; date?: Date | null }) {
  if (status === "Verified") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
        <LuCheck className="size-3.5" aria-hidden />
        Verified{date ? ` · ${formatDate(date)}` : ""}
      </span>
    );
  }
  if (status === "Paid") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-gold">
        <LuClock className="size-3.5" aria-hidden />
        Paid, awaiting verification
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <LuClock className="size-3.5" aria-hidden />
      {status}
    </span>
  );
}

function Line({
  label,
  amount,
  children,
  strong,
}: {
  label: string;
  amount: number | null;
  children?: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className={cn("text-sm", strong ? "font-semibold text-foreground" : "text-foreground")}>{label}</p>
        {children ? <div className="mt-0.5">{children}</div> : null}
      </div>
      <p
        className={cn(
          "shrink-0 font-mono tabular-nums",
          strong ? "text-base font-semibold text-foreground" : "text-sm text-foreground"
        )}
      >
        {amount == null ? "—" : formatNaira(amount)}
      </p>
    </div>
  );
}

/**
 * Money on a project. The total leads as a large figure; the two payment legs
 * and the payout split follow as plain lines with faint dividers — no panels.
 */
export function FinancialsTab({
  project,
  ambassadors,
  canProBono = false,
}: {
  project: ProjectDetail;
  ambassadors: AllocatableAmbassador[];
  /** Super admin: may turn a paid project into a pro bono one. */
  canProBono?: boolean;
}) {
  if (project.isProBono) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-zone p-5">
          <p className="text-[15px] font-semibold text-foreground">Pro bono project</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No price, no payments, no commission. This job is left out of the finance dashboard.
          </p>
          {project.proBonoReason ? (
            <p className="mt-3 text-sm text-foreground">
              <span className="meta-label mr-2">Reason</span>
              {project.proBonoReason}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const f = financialBreakdown(project);
  // Cancelled and refunded jobs earn no commission, so there's nothing to allocate.
  const closed = project.status === "CANCELLED" || project.status === "REFUNDED";

  return (
    <div className="space-y-10">
      <section aria-labelledby="fin-price">
        <p id="fin-price" className="meta-label">
          Total price
        </p>
        <p className="mt-1 font-mono text-[2rem] font-medium leading-none tabular-nums text-foreground">
          {formatNaira(f.total)}
        </p>
        <div className="mt-4 divide-y divide-border/80">
          <Line label="Downpayment (45%)" amount={f.downpaymentAmount}>
            <PaymentStatusPill status={f.downpaymentStatus} date={project.downpaymentDate} />
          </Line>
          <Line label="Balance (55%)" amount={f.balanceAmount}>
            <PaymentStatusPill status={f.balanceStatus} date={project.balanceDate} />
          </Line>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-[15px] font-semibold text-foreground">Verify payments</h3>
        <PaymentVerification
          projectCode={project.projectId}
          leg="downpayment"
          label="Downpayment"
          amount={f.downpaymentAmount}
          status={f.downpaymentStatus}
          date={project.downpaymentDate}
        />
        <PaymentVerification
          projectCode={project.projectId}
          leg="balance"
          label="Balance"
          amount={f.balanceAmount}
          status={f.balanceStatus}
          date={project.balanceDate}
        />
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-semibold text-foreground">Payout breakdown</h3>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              f.payoutsDue ? "bg-success/15 text-success" : "bg-elevated text-muted-foreground"
            )}
          >
            {f.payoutsDue ? "Due now" : "Due on completion"}
          </span>
        </div>
        <div className="mt-2 divide-y divide-border/80">
          <Line
            label={
              f.ambassadorName
                ? `Ambassador — ${f.ambassadorName}${f.ambassadorRate ? ` (${f.ambassadorRate}%)` : ""}`
                : "Ambassador"
            }
            amount={f.ambassadorCommission}
          >
            {f.ambassadorName && f.ambassadorCommission != null ? (
              <span className="block text-xs text-muted-foreground">
                {f.ambassadorCommPaid ? "Paid" : f.payoutsDue ? "Unpaid" : "Not yet due"}
                {project.ambassadorAllocatedAt ? ` · logged ${formatDate(project.ambassadorAllocatedAt)}` : ""}
                {project.ambassadorNotifiedAt
                  ? ` · emailed ${formatDate(project.ambassadorNotifiedAt)}`
                  : f.downpaymentStatus === "Verified"
                    ? " · not emailed"
                    : " · emailed when the downpayment is verified"}
              </span>
            ) : f.ambassadorName ? (
              <span className="block text-xs text-muted-foreground">Referrer — no commission on this job</span>
            ) : (
              <span className="block text-xs text-muted-foreground">No ambassador on this job</span>
            )}
            {closed ? null : (
              <AmbassadorAllocation
                projectCode={project.projectId}
                price={project.price}
                workerPayout={f.workerPayout ?? 0}
                downpaymentVerified={f.downpaymentStatus === "Verified"}
                current={{
                  ambassadorId: project.ambassadorId,
                  rate: project.ambassadorCommRate,
                  paid: project.ambassadorCommPaid,
                }}
                ambassadors={ambassadors}
              />
            )}
          </Line>
          <Line
            label={`Worker${f.workerName ? ` — ${f.workerName}` : ""} (${f.workerPayoutRate}%)`}
            amount={f.workerPayout}
          >
            <span className="text-xs text-muted-foreground">
              {project.workerPayoutPaid ? "Paid" : f.payoutsDue ? "Unpaid" : "Not yet due"}
            </span>
          </Line>
          <Line label="EduCraft revenue" amount={f.educraftRevenue} strong />
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          An ambassador&apos;s commission comes off the job price and is logged as an expense the
          moment the job is allocated to them. Cancelling or refunding the job removes it. Payouts
          become due when the project reaches Completed.
        </p>
      </section>

      {canProBono && project.payments.length === 0 && !closed ? (
        <section className="space-y-2">
          <h3 className="text-[15px] font-semibold text-foreground">Pro bono</h3>
          <p className="text-[13px] text-muted-foreground">
            Giving this job away? It drops the price to zero and takes it out of the finance figures.
          </p>
          <MarkProBono projectCode={project.projectId} />
        </section>
      ) : null}

      {project.payments.length > 0 ? (
        <section>
          <h3 className="text-[15px] font-semibold text-foreground">Recorded payments</h3>
          <ul className="mt-2 divide-y divide-border/80">
            {project.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="text-foreground first-letter:uppercase">
                    {p.type.replace(/_/g, " ").toLowerCase()}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{p.paymentId}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(p.date)} · {p.status}
                    {p.reference ? ` · ref ${p.reference}` : ""}
                  </p>
                </div>
                <span className="shrink-0 font-mono tabular-nums text-foreground">
                  {p.direction === "OUTFLOW" ? "−" : ""}
                  {formatNaira(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
