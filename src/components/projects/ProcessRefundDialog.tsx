"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle, LuUpload } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn, formatNaira } from "@/lib/utils";

interface Reversible {
  id: string;
  leg: string;
  recipientType: string;
  recipientName: string;
  amount: number;
  status: string;
  paid: boolean;
}
interface Preview {
  projectCode: string;
  clientName: string;
  status: string;
  alreadyRefunded: boolean;
  cancelled: boolean;
  detectedStage: 1 | 2 | 3 | 4;
  stageLabel: string;
  moneyIn: number;
  defaultAmount: number;
  releasedChaptersLabel: string;
  workerName: string | null;
  workerLegAmount: number;
  workerPartialDefault: number;
  reversible: Reversible[];
}

const STAGE_PCT: Record<number, { def: number; max: number; label: string }> = {
  1: { def: 100, max: 100, label: "Before any work started" },
  2: { def: 75, max: 75, label: "Work started, no chapter delivered" },
  3: { def: 50, max: 50, label: "A chapter has been delivered" },
  4: { def: 0, max: 0, label: "The complete report was delivered" },
};

export function ProcessRefundDialog({ projectCode, cancelled }: { projectCode: string; cancelled: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {cancelled ? "Refund or keep (decide)" : "Process refund"}
      </Button>
      {open ? <RefundForm projectCode={projectCode} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function RefundForm({ projectCode, onClose }: { projectCode: string; onClose: () => void }) {
  const router = useRouter();
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [stage, setStage] = React.useState<number>(1);
  const [amount, setAmount] = React.useState("");
  const [reverse, setReverse] = React.useState<Set<string>>(new Set());
  const [workerPartial, setWorkerPartial] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    fetch(`/api/admin/finance/projects/${projectCode}/refund`)
      .then((r) => (r.ok ? r.json() : r.json().then((b) => Promise.reject(new Error(b?.error ?? "Could not load the refund.")))))
      .then((p: Preview) => {
        if (!live) return;
        setPreview(p);
        setStage(p.detectedStage);
        setAmount(String(p.defaultAmount));
        setReverse(new Set(p.reversible.map((r) => r.id)));
        setWorkerPartial(p.workerPartialDefault > 0 ? String(p.workerPartialDefault) : "");
      })
      .catch((e) => live && setLoadError(e instanceof Error ? e.message : "Could not load the refund."));
    return () => {
      live = false;
    };
  }, [projectCode]);

  function changeStage(next: number) {
    setStage(next);
    if (preview) setAmount(String(Math.round((preview.moneyIn * STAGE_PCT[next].def) / 100)));
  }

  const amountNum = Number(amount || 0);
  const maxAmount = preview ? Math.round((preview.moneyIn * STAGE_PCT[stage].max) / 100) : 0;
  const keepMoney = amountNum === 0;

  async function submit() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("stage", String(stage));
      form.append("amount", String(Math.round(amountNum)));
      form.append("reason", reason.trim());
      form.append("reverseRecordIds", JSON.stringify([...reverse]));
      form.append("workerPartial", String(Math.round(Number(workerPartial || 0))));
      if (file) form.append("file", file);
      const res = await fetch(`/api/admin/finance/projects/${projectCode}/refund`, { method: "POST", body: form });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? "Could not process the refund.");
      }
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not process the refund.");
    } finally {
      setBusy(false);
    }
  }

  const ready = preview != null && reason.trim().length >= 3 && amountNum >= 0 && amountNum <= maxAmount && !busy;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Process refund — {projectCode}</DialogTitle>
          <DialogDescription>
            Refunding reverses the commissions you tick (with a reason the recipient sees) and pays the worker for chapters delivered. A ₦0 refund keeps the money and just records the decision.
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {loadError}
          </p>
        ) : !preview ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : preview.alreadyRefunded ? (
          <p className="py-6 text-center text-sm text-muted-foreground">This project has already been refunded.</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-zone p-3 text-[13px]">
              <p className="text-foreground">
                Detected: <span className="font-medium">{preview.stageLabel}</span>. Money in: <span className="font-mono tabular-nums">{formatNaira(preview.moneyIn)}</span>.
              </p>
              {preview.releasedChaptersLabel !== "no chapters" ? <p className="mt-0.5 text-muted-foreground">{preview.releasedChaptersLabel} released to the client.</p> : null}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Stage" htmlFor="rf-stage">
                <Select id="rf-stage" value={String(stage)} onChange={(e) => changeStage(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((s) => (
                    <option key={s} value={s}>
                      Stage {s} — up to {STAGE_PCT[s].max}%
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={`Refund amount (max ${formatNaira(maxAmount)})`} htmlFor="rf-amount" hint={keepMoney ? "₦0 — keep the money, just record the decision." : undefined}>
                <Input id="rf-amount" type="number" inputMode="numeric" min={0} max={maxAmount} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
            </div>

            {preview.reversible.length > 0 ? (
              <div>
                <p className="meta-label">Reverse these commissions</p>
                <ul className="mt-2 space-y-1 rounded-lg bg-zone p-3 text-[13px]">
                  {preview.reversible.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3">
                      <label className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 accent-primary"
                          checked={reverse.has(r.id)}
                          onChange={() =>
                            setReverse((prev) => {
                              const n = new Set(prev);
                              if (n.has(r.id)) n.delete(r.id);
                              else n.add(r.id);
                              return n;
                            })
                          }
                        />
                        <span className="truncate text-foreground">
                          {r.recipientName} <span className="text-muted-foreground">· {r.leg.toLowerCase()}</span>
                          {r.paid ? <span className="ml-1 text-xs text-gold">paid — recovery</span> : null}
                        </span>
                      </label>
                      <span className="shrink-0 font-mono tabular-nums text-foreground">{formatNaira(r.amount)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-muted-foreground">A paid commission becomes a recovery to claw back by hand — never a negative payout.</p>
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">No commissions are owed or paid on this project.</p>
            )}

            {preview.workerName ? (
              <Field label="Pay the worker for delivered chapters" htmlFor="rf-worker" hint={`${preview.workerName} · their full leg is ${formatNaira(preview.workerLegAmount)}.`}>
                <Input id="rf-worker" type="number" inputMode="numeric" min={0} value={workerPartial} onChange={(e) => setWorkerPartial(e.target.value)} placeholder="0" />
              </Field>
            ) : null}

            <Field label="Reason (the client and the recipients see this)" required htmlFor="rf-reason">
              <Textarea id="rf-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being refunded?" />
            </Field>

            <Field label="Bank confirmation" htmlFor="rf-file" hint="Optional — a PDF or screenshot of the transfer back.">
              <label className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-input px-3 text-sm text-foreground", busy && "opacity-60")}>
                <LuUpload className="size-4" aria-hidden />
                {file ? file.name : "Choose file"}
                <input id="rf-file" type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </Field>

            {error ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-danger">
                <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" disabled={!ready} onClick={submit}>
                {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                {keepMoney ? "Keep the money" : `Refund ${formatNaira(Math.round(amountNum))}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
