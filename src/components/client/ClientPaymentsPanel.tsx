import { LuCircleCheck, LuDownload, LuHourglass, LuMessageCircle, LuReceipt, LuWallet } from "react-icons/lu";
import { StatsCard, STATS_GRID } from "@/components/dashboard/StatsCard";
import { ClientPayButton } from "@/components/client/ClientPayButton";
import type { ClientPaymentRow, ClientProjectView } from "@/lib/services/client-portal";
import { educraftWaLink } from "@/lib/whatsapp";
import { formatDate, formatNaira } from "@/lib/utils";

/**
 * Payments: what is paid, what is left, a Pay button when something can be
 * paid now, and a receipt for every confirmed payment.
 */
export function ClientPaymentsPanel({
  project,
  payments,
  preview = false,
}: {
  project: ClientProjectView;
  payments: ClientPaymentRow[];
  /** Admin preview: shows the same page with nothing to click. */
  preview?: boolean;
}) {
  if (project.isProBono) {
    return (
      <div className="zone flex items-start gap-3 p-5">
        <LuCircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
        <div>
          <p className="font-medium text-foreground">No payment needed</p>
          <p className="mt-1 text-sm text-muted-foreground">EduCraft is doing this project for you free of charge.</p>
        </div>
      </div>
    );
  }

  const paid = payments.filter((p) => p.status === "Confirmed").reduce((sum, p) => sum + p.amount, 0);
  const due = Math.max(0, project.price - paid);
  const pending = payments.some((p) => p.status === "Pending");
  const bankLink = educraftWaLink(`Hi EduCraft, I'd like to pay for ${project.code} by bank transfer.`);

  return (
    <div className="space-y-10">
      <section aria-label="Payment summary" className={STATS_GRID}>
        <StatsCard label="Paid so far" value={formatNaira(paid)} icon={LuCircleCheck} tone="success" detail={`of ${formatNaira(project.price)}`} />
        <StatsCard
          label="Left to pay"
          value={formatNaira(due)}
          detail={due > 0 ? undefined : "Fully paid"}
          detailTone="success"
          icon={LuWallet}
          tone={due > 0 ? "gold" : "success"}
        />
      </section>

      {project.canPayDownpayment || project.canPayBalance ? (
        <section className="zone space-y-3 p-5">
          <h2 className="text-base font-semibold text-foreground">
            {project.canPayDownpayment ? "Pay your downpayment" : "Pay your balance"}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {project.canPayDownpayment
              ? "Your downpayment starts the work."
              : project.status === "APPROVED"
                ? "Your project passed our quality check. The balance unlocks delivery."
                : project.balanceUnlocks
                  ? `Paying the balance now unlocks ${project.balanceUnlocks} for download as soon as ${project.balanceUnlockCount === 1 ? "it's" : "each is"} ready.`
                  : "Paying the balance now means your delivery is ready to go as soon as it passes our quality check."}
          </p>
          {preview ? (
            <p className="text-sm font-medium text-foreground">
              [Pay {formatNaira(project.canPayDownpayment ? project.downpaymentAmount : project.balanceAmount)} with Paystack]
            </p>
          ) : (
            <ClientPayButton
              projectCode={project.code}
              leg={project.canPayDownpayment ? "downpayment" : "balance"}
              label={`Pay ${formatNaira(project.canPayDownpayment ? project.downpaymentAmount : project.balanceAmount)} with Paystack`}
            />
          )}
          <a
            href={bankLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            <LuMessageCircle className="size-4" aria-hidden />
            Prefer a bank transfer? Message us on WhatsApp
          </a>
        </section>
      ) : null}

      <section>
        <h2 className="text-base font-semibold text-foreground">History</h2>
        {pending ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-gold">
            <LuHourglass className="size-4" aria-hidden />
            A payment is being confirmed. This usually takes a minute; refresh to check.
          </p>
        ) : null}
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <ul className="mt-3">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/40 py-3.5 last:border-0">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-foreground">
                    {p.leg === "balance" ? "Balance" : "Downpayment"} ·{" "}
                    <span className="font-mono">{formatNaira(p.amount)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(p.date)}
                    {p.method ? ` · ${p.method}` : ""}
                    {p.status === "Pending" ? " · being confirmed" : ""}
                  </p>
                </div>
                {p.status === "Confirmed" && preview ? (
                  <span className="inline-flex min-h-11 items-center gap-2 px-3 text-sm text-muted-foreground">
                    <LuReceipt className="size-4" aria-hidden />
                    Receipt
                  </span>
                ) : p.status === "Confirmed" ? (
                  <a
                    href={`/api/client/projects/${encodeURIComponent(project.code)}/payments/${p.id}/receipt`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-primary transition-colors hover:bg-zone"
                  >
                    <LuReceipt className="size-4" aria-hidden />
                    Receipt
                    <LuDownload className="size-3.5" aria-hidden />
                    <span className="sr-only"> for {p.receiptNo}</span>
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
