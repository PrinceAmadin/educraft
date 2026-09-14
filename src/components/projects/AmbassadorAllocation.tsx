"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle, LuMail } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AmbassadorPicker,
  CommissionPreview,
  CommissionRatePicker,
} from "@/components/ambassadors/CommissionPickers";
import { COMMISSION_RATES } from "@/lib/commission";
import type { AllocatableAmbassador } from "@/lib/services/ambassador-commission";
import { cn, formatNaira } from "@/lib/utils";

export interface AllocationResponse {
  ambassadorName: string;
  rate: number;
  commission: number;
  email: { sent: boolean; to: string | null; error?: string } | null;
  emailLater: boolean;
}

export type AllocationOutcome = { tone: "success" | "warning"; text: string };

/** One line telling the admin what happened: logged, emailed or not, and why. */
export function describeAllocation(body: AllocationResponse): AllocationOutcome {
  const logged = `Logged ${formatNaira(body.commission)} (${body.rate}%) for ${body.ambassadorName}`;
  const later = body.emailLater ? " They'll be emailed once the downpayment is verified." : "";
  if (!body.email) return { tone: "success", text: `${logged}.${later || " No email sent."}` };
  if (body.email.sent) return { tone: "success", text: `${logged} and emailed ${body.email.to}.` };
  return {
    tone: "warning",
    text: `${logged}, but the email didn't send: ${body.email.error ?? "unknown error"}.${later}`,
  };
}

/** POST /api/admin/projects/[code]/ambassador — shared by every allocate surface. */
export async function postAllocation(
  projectCode: string,
  payload: { ambassadorId: string; rate: number; notify: boolean }
): Promise<AllocationResponse> {
  const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectCode)}/ambassador`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => null)) as (AllocationResponse & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? "Could not allocate this job.");
  return body;
}

/**
 * Allocate a job to the ambassador who brought it in — or "None". Picking one
 * takes 10/12/15% (or any rate you set) off the job price, logs it under
 * Expenses on the finance dashboard, and emails them.
 */
export function AmbassadorAllocation({
  projectCode,
  price,
  workerPayout,
  downpaymentVerified,
  current,
  ambassadors,
}: {
  projectCode: string;
  price: number;
  workerPayout: number;
  downpaymentVerified: boolean;
  current: { ambassadorId: string | null; rate: number | null; paid: boolean };
  ambassadors: AllocatableAmbassador[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(current.ambassadorId);
  const [rate, setRate] = React.useState<number>(current.rate ?? COMMISSION_RATES[0]);
  const [notify, setNotify] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<AllocationOutcome | null>(null);

  const selected = ambassadors.find((a) => a.id === selectedId) ?? null;

  if (current.paid) return null;

  function openDialog() {
    const existing = ambassadors.find((a) => a.id === current.ambassadorId) ?? null;
    setSelectedId(current.ambassadorId);
    setRate(current.rate ?? existing?.tierRate ?? COMMISSION_RATES[0]);
    setNotify(existing ? Boolean(existing.email) : true);
    setError(null);
    setOpen(true);
  }

  function pick(a: AllocatableAmbassador | null) {
    setSelectedId(a?.id ?? null);
    if (a) {
      setRate(a.tierRate);
      setNotify(Boolean(a.email));
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (!selected) {
        // "None" — take the ambassador off the job and drop its expense.
        const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectCode)}/ambassador`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Could not remove the ambassador.");
        }
        setOutcome({ tone: "success", text: "No ambassador on this job — its commission expense was removed." });
      } else {
        const body = await postAllocation(projectCode, { ambassadorId: selected.id, rate, notify });
        setOutcome(describeAllocation(body));
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const unchanged = !current.ambassadorId && !selected;

  return (
    <>
      <Button
        size="sm"
        variant={current.ambassadorId ? "outline" : "default"}
        className="mt-2"
        onClick={openDialog}
      >
        {current.ambassadorId ? "Change ambassador" : "Allocate to ambassador"}
      </Button>
      {outcome ? (
        <p className={cn("mt-2 text-xs", outcome.tone === "success" ? "text-success" : "text-gold")}>
          {outcome.text}
        </p>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>Ambassador for {projectCode}</DialogTitle>
            <DialogDescription>
              Their commission comes off this job, is logged under Expenses on the finance dashboard,
              and they&apos;re emailed about it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <AmbassadorPicker ambassadors={ambassadors} selectedId={selectedId} onPick={pick} allowNone />

            {selected ? (
              <>
                <CommissionRatePicker value={rate} onChange={setRate} id="alloc-rate" />
                <CommissionPreview price={price} workerPayout={workerPayout} rate={rate} />
                <EmailToggle
                  ambassador={selected}
                  checked={notify}
                  onChange={setNotify}
                  downpaymentVerified={downpaymentVerified}
                />
              </>
            ) : (
              <p className="rounded-xl bg-zone px-4 py-3 text-sm text-muted-foreground">
                No ambassador referred this job. EduCraft keeps the full{" "}
                <span className="font-mono tabular-nums text-foreground">{formatNaira(price - workerPayout)}</span>{" "}
                after the worker&apos;s payout.
              </p>
            )}

            {error ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-danger">
                <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={busy || unchanged} onClick={save}>
                {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                {selected ? (current.ambassadorId ? "Save" : "Allocate") : "Save as none"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "Email Ada now" — with what happens if you don't. */
export function EmailToggle({
  ambassador,
  checked,
  onChange,
  downpaymentVerified,
}: {
  ambassador: AllocatableAmbassador;
  checked: boolean;
  onChange: (v: boolean) => void;
  downpaymentVerified: boolean;
}) {
  const first = ambassador.name.split(" ")[0];
  if (!ambassador.email) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <LuMail className="mt-0.5 size-4 shrink-0" aria-hidden />
        No email on file for {ambassador.name}, so they won&apos;t be emailed. Add one on their
        ambassador record.
      </p>
    );
  }
  return (
    <label className="flex min-h-12 items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="text-foreground">
          Email {first} now at <span className="break-all">{ambassador.email}</span>
        </span>
        {!checked ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {downpaymentVerified
              ? "They won't be emailed about this job."
              : "Otherwise they're emailed once the downpayment is verified."}
          </span>
        ) : null}
      </span>
    </label>
  );
}
