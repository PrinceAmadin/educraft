import { LuCheck } from "react-icons/lu";
import { TRACK_MILESTONES } from "@/lib/services/tracking";
import { PayWithPaystackButton } from "@/components/track/PayWithPaystackButton";
import { cn, formatDateTime, formatNaira } from "@/lib/utils";
import type { TrackingResult } from "@/lib/services/tracking";

export function ProjectTracker({ result }: { result: TrackingResult }) {
  const currentIndex = TRACK_MILESTONES.findIndex((m) => m.key === result.milestone);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-sm text-muted-foreground">{result.projectId}</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground">
          {result.title ?? result.serviceName}
        </h1>
        <p className="text-sm text-muted-foreground">{result.serviceName}</p>
      </div>

      <div className="surface p-4 sm:p-5">
        <p className="text-sm text-foreground">{result.message}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Last updated {formatDateTime(result.updatedAt)}
        </p>
      </div>

      {result.awaitingPayment ? (
        <div className="rounded-2xl bg-gold/10 p-4 text-sm">
          <p className="font-medium text-foreground">
            {result.awaitingPayment === "downpayment"
              ? "Your 45% downpayment is needed to start."
              : "Your balance payment is needed to unlock delivery."}
          </p>

          {result.awaitingAmount ? (
            <div className="mt-3">
              <PayWithPaystackButton
                projectId={result.projectId}
                leg={result.awaitingPayment}
                label={`Pay ${formatNaira(result.awaitingAmount)} with Paystack`}
              />
            </div>
          ) : null}

          <p className="mt-3 text-muted-foreground">
            Or reach us on 07063421088 for bank transfer details.
          </p>
        </div>
      ) : null}

      {/* Milestone rail */}
      <ol className="space-y-0">
        {TRACK_MILESTONES.map((m, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          return (
            <li key={m.key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium",
                    done && "border-primary bg-primary text-primary-foreground",
                    current && "border-primary text-primary",
                    !done && !current && "border-border text-muted-foreground"
                  )}
                >
                  {done ? <LuCheck className="size-3.5" aria-hidden /> : i + 1}
                </span>
                {i < TRACK_MILESTONES.length - 1 ? (
                  <span
                    className={cn("w-px flex-1", i < currentIndex ? "bg-primary" : "bg-border")}
                    style={{ minHeight: 28 }}
                    aria-hidden
                  />
                ) : null}
              </div>
              <span
                className={cn(
                  "pb-6 pt-0.5 text-sm",
                  current ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {m.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
