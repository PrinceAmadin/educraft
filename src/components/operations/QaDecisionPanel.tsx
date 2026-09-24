"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert, LuLoaderCircle, LuRotateCcw, LuTriangleAlert, LuWrench } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { QaChecklist } from "@/components/qa/QaChecklist";
import { DeliveryChecklist } from "@/components/operations/DeliveryChecklist";
import { DELIVERY_CHECKLIST, allDeliveryChecksPassed, deliveryChecksDone, type DeliveryChecklistState } from "@/lib/operations/qa-delivery-checklist";
import { cn } from "@/lib/utils";
import type { QaChecklistDef } from "@/lib/qa-checklists";

type Decision = "approve" | "revision" | "minor_fixes" | "escalate";

/** The decision labels are long: let them wrap on a phone instead of running off the screen. */
const WRAP = "h-auto min-h-11 justify-start whitespace-normal py-2.5 text-left";

const LABELS: Record<Decision, string> = {
  approve: `Approve — all ${DELIVERY_CHECKLIST.length} checks passed`,
  revision: "Revision needed — send back to the worker with notes",
  minor_fixes: "Minor fixes — I fixed it directly, then approve",
  escalate: "Escalate — senior domain review needed",
};

/**
 * The reviewer's screen: the service's content checklist, the fixed
 * delivery checklist, notes, and the four decisions. Approve and Minor
 * fixes stay off until every delivery check is ticked.
 */
export function QaDecisionPanel({
  projectCode,
  def,
  initialChecked,
  initialDelivery,
  initialNotes,
}: {
  projectCode: string;
  def: QaChecklistDef;
  initialChecked: Record<string, boolean>;
  initialDelivery: DeliveryChecklistState;
  initialNotes: string | null;
}) {
  const router = useRouter();
  const checklistRef = React.useRef<Record<string, boolean>>(initialChecked);
  const [delivery, setDelivery] = React.useState<DeliveryChecklistState>(initialDelivery);
  const [notes, setNotes] = React.useState(initialNotes ?? "");
  const [pending, setPending] = React.useState<Decision | null>(null);
  const [confirm, setConfirm] = React.useState<Decision | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const allPassed = allDeliveryChecksPassed(delivery);
  const done = deliveryChecksDone(delivery);

  async function submit(decision: Decision) {
    if ((decision === "revision" || decision === "escalate" || decision === "minor_fixes") && !notes.trim()) {
      setError(decision === "revision" ? "Add feedback so the worker knows what to fix." : decision === "escalate" ? "Explain why this needs a senior review." : "Say what you fixed.");
      setConfirm(null);
      return;
    }
    setPending(decision);
    setError(null);
    try {
      const res = await fetch(`/api/admin/qa/${projectCode}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes: notes.trim(), checklist: checklistRef.current, delivery }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not record the decision.");
      }
      router.push("/admin/qa");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the decision.");
      setPending(null);
      setConfirm(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-zone p-4 sm:p-5">
        <DeliveryChecklist projectCode={projectCode} initial={initialDelivery} onChange={setDelivery} disabled={pending !== null} />
      </div>

      <div className="rounded-2xl bg-zone p-4 sm:p-5">
        <QaChecklist
          projectCode={projectCode}
          def={def}
          initial={initialChecked}
          onChange={(s) => {
            checklistRef.current = s;
          }}
          disabled={pending !== null}
        />
      </div>

      <div>
        <label htmlFor="qa-notes" className="text-[15px] font-semibold text-foreground">
          Notes
        </label>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Sent to the worker on a revision; kept on the record for minor fixes and escalations.</p>
        <Textarea id="qa-notes" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending !== null} className="mt-3 text-sm" />
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <div>
        <h2 className="text-[15px] font-semibold text-foreground">Reviewer decision</h2>
        {!allPassed ? (
          <p className="mt-1 text-[13px] text-gold">
            {done} of {DELIVERY_CHECKLIST.length} delivery checks ticked — approval opens when all {DELIVERY_CHECKLIST.length} are.
          </p>
        ) : null}
        {confirm ? (
          <div className="mt-3 rounded-2xl bg-zone p-5 text-sm">
            <p className="font-medium text-foreground">{LABELS[confirm]}?</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {confirm === "approve" || confirm === "minor_fixes"
                ? "The project moves to APPROVED and the client hears their work passed the quality check."
                : confirm === "revision"
                  ? "The project goes back to the worker as REVISION NEEDED with your notes."
                  : "The project stays in review and the founder is asked for a senior domain review."}
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled={pending !== null} onClick={() => void submit(confirm)}>
                {pending ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                Submit review decision
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(null)} disabled={pending !== null}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button className={cn(WRAP, "bg-success text-success-foreground hover:bg-success/90")} disabled={pending !== null || !allPassed} onClick={() => setConfirm("approve")}>
              <LuCheck className="size-4" aria-hidden />
              {LABELS.approve}
            </Button>
            <Button variant="outline" className={cn(WRAP, "border-gold/40 text-gold hover:bg-gold/10")} disabled={pending !== null} onClick={() => setConfirm("revision")}>
              <LuRotateCcw className="size-4" aria-hidden />
              {LABELS.revision}
            </Button>
            <Button variant="outline" className={WRAP} disabled={pending !== null || !allPassed} onClick={() => setConfirm("minor_fixes")}>
              <LuWrench className="size-4" aria-hidden />
              {LABELS.minor_fixes}
            </Button>
            <Button variant="outline" className={cn(WRAP, "border-danger/40 text-danger hover:bg-danger/10")} disabled={pending !== null} onClick={() => setConfirm("escalate")}>
              <LuTriangleAlert className="size-4" aria-hidden />
              {LABELS.escalate}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
