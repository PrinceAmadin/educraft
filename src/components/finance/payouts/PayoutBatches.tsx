"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle, LuTriangleAlert, LuUpload } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn, formatNaira } from "@/lib/utils";

interface RecipientGroup {
  key: string;
  name: string;
  total: number;
  accountLast4: string | null;
  lines: { label: string; amount: number }[];
}
interface BatchView {
  id: string;
  cohort: string;
  cohortLabel: string;
  periodKey: string;
  status: string;
  payable: RecipientGroup[];
  missingBank: RecipientGroup[];
  payableTotal: number;
  clearedAt: string | null;
  emailsScheduledAt: string | null;
  undoOpen: boolean;
  emailsSentAt: string | null;
  batchReference: string | null;
}
interface HistoryRow {
  id: string;
  cohortLabel: string;
  periodKey: string;
  status: string;
  totalAmount: number;
  recipientCount: number;
  clearedAt: string | null;
  batchReference: string | null;
}

const METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "crypto", label: "Crypto" },
  { value: "other", label: "Other" },
];

export function PayoutBatches({ cohorts, history, schedulerQuiet, canClear }: { cohorts: BatchView[]; history: HistoryRow[]; schedulerQuiet: boolean; canClear: boolean }) {
  return (
    <section aria-labelledby="batches-heading" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="batches-heading" className="text-[15px] font-semibold text-foreground">
          Payout batches
        </h2>
        <p className="text-[13px] text-muted-foreground">Pay each cohort together. Emails go out 10 minutes after you clear, so there is time to undo.</p>
      </div>
      {schedulerQuiet ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-gold/10 px-4 py-3 text-sm text-gold">
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          The payout scheduler has gone quiet. Cleared batches will not send their confirmation emails until it is running again.
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        {cohorts.map((c) => (
          <BatchCard key={c.cohort} batch={c} canClear={canClear} />
        ))}
      </div>
      {history.length > 0 ? <BatchHistory rows={history} /> : null}
    </section>
  );
}

function BatchCard({ batch, canClear }: { batch: BatchView; canClear: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-foreground">{batch.cohortLabel}</h3>
        <span className="text-xs text-muted-foreground">{batch.periodKey}</span>
      </div>

      {batch.status === "READY" ? (
        <>
          <p className="mt-2 font-mono text-2xl font-medium tabular-nums text-foreground">{formatNaira(batch.payableTotal)}</p>
          <p className="text-xs text-muted-foreground">
            {batch.payable.length} recipient{batch.payable.length === 1 ? "" : "s"} ready
          </p>
          {batch.missingBank.length > 0 ? (
            <div className="mt-3 rounded-lg bg-gold/10 px-3 py-2 text-[13px] text-gold">
              <p className="font-medium">
                {batch.missingBank.length} held — no bank details ({formatNaira(batch.missingBank.reduce((s, g) => s + g.total, 0))})
              </p>
              <ul className="mt-1 space-y-0.5">
                {batch.missingBank.slice(0, 5).map((g) => (
                  <li key={g.key} className="flex justify-between gap-2">
                    <span className="truncate">{g.name}</span>
                    <span className="font-mono tabular-nums">{formatNaira(g.total)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs">They stay unpaid and get a reminder to add their details.</p>
            </div>
          ) : null}
          {canClear ? (
            <Button size="sm" className="mt-4 w-full" disabled={batch.payable.length === 0} onClick={() => setOpen(true)}>
              Clear payout
            </Button>
          ) : null}
          {open ? <ClearDialog batch={batch} onClose={() => setOpen(false)} /> : null}
        </>
      ) : batch.status === "CLEARED" ? (
        <ClearedState batch={batch} canClear={canClear} />
      ) : (
        <div className="mt-2">
          <p className="font-mono text-2xl font-medium tabular-nums text-foreground">{formatNaira(batch.payableTotal)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {batch.status === "FINALIZED" ? "Paid and confirmation emails sent." : batch.status === "UNDONE" ? "This batch was rolled back." : batch.status}
          </p>
        </div>
      )}
    </div>
  );
}

function ClearedState({ batch, canClear }: { batch: BatchView; canClear: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [remaining, setRemaining] = React.useState<number>(() => (batch.emailsScheduledAt ? new Date(batch.emailsScheduledAt).getTime() - Date.now() : 0));

  React.useEffect(() => {
    if (!batch.undoOpen) return;
    const t = setInterval(() => setRemaining(batch.emailsScheduledAt ? new Date(batch.emailsScheduledAt).getTime() - Date.now() : 0), 1000);
    return () => clearInterval(t);
  }, [batch.undoOpen, batch.emailsScheduledAt]);

  const stillOpen = batch.undoOpen && remaining > 0;
  const mins = Math.max(0, Math.floor(remaining / 60000));
  const secs = Math.max(0, Math.floor((remaining % 60000) / 1000));

  async function undo() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/finance/payouts/batches/${batch.id}/undo`, { method: "POST" });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? "Could not undo.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not undo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <p className="font-mono text-2xl font-medium tabular-nums text-success">{formatNaira(batch.payableTotal)}</p>
      <p className="mt-1 text-xs text-muted-foreground">Marked paid{batch.batchReference ? ` · ${batch.batchReference}` : ""}.</p>
      {stillOpen ? (
        <div className="mt-3 rounded-lg bg-zone px-3 py-2">
          <p className="text-[13px] text-foreground">
            Emails go out in <span className="font-mono tabular-nums">{mins}:{String(secs).padStart(2, "0")}</span>. Undo until then.
          </p>
          {canClear ? (
            <Button size="sm" variant="outline" className="mt-2 w-full" disabled={busy} onClick={undo}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Undo this payout
            </Button>
          ) : null}
          {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">The undo window has closed. Confirmation emails are being sent.</p>
      )}
    </div>
  );
}

function ClearDialog({ batch, onClose }: { batch: BatchView; onClose: () => void }) {
  const router = useRouter();
  const [excluded, setExcluded] = React.useState<Set<string>>(new Set());
  const [method, setMethod] = React.useState("bank_transfer");
  const [reference, setReference] = React.useState(defaultReference(batch));
  const [notes, setNotes] = React.useState("");
  const [fileId, setFileId] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const included = batch.payable.filter((g) => !excluded.has(g.key));
  const includedTotal = included.reduce((s, g) => s + g.total, 0);

  function toggle(key: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/finance/payouts/batches/${batch.id}/bank-confirmation`, { method: "POST", body: form });
      const b = (await res.json().catch(() => null)) as { fileId?: string; fileName?: string; error?: string } | null;
      if (!res.ok || !b?.fileId) throw new Error(b?.error ?? "Could not upload the file.");
      setFileId(b.fileId);
      setFileName(b.fileName ?? file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload the file.");
    } finally {
      setUploading(false);
    }
  }

  async function clear() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/finance/payouts/batches/${batch.id}/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: method, batchReference: reference.trim(), bankConfirmationFileId: fileId, notes: notes.trim() || undefined, excludeRecipientKeys: [...excluded] }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? "Could not clear the batch.");
      }
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear the batch.");
    } finally {
      setBusy(false);
    }
  }

  const ready = fileId != null && reference.trim().length > 0 && included.length > 0 && !busy;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Clear {batch.cohortLabel.toLowerCase()} payout</DialogTitle>
          <DialogDescription>
            Pay {included.length} recipient{included.length === 1 ? "" : "s"} ({formatNaira(includedTotal)}). Confirmation emails go out 10 minutes after you clear, so you can undo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-zone p-3 text-[13px]">
            {batch.payable.map((g) => (
              <li key={g.key} className="flex items-center justify-between gap-3">
                <label className="flex min-w-0 items-center gap-2">
                  <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={!excluded.has(g.key)} onChange={() => toggle(g.key)} />
                  <span className="truncate text-foreground">{g.name}</span>
                  {g.accountLast4 ? <span className="shrink-0 text-xs text-muted-foreground">····{g.accountLast4}</span> : null}
                </label>
                <span className="shrink-0 font-mono tabular-nums text-foreground">{formatNaira(g.total)}</span>
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Paid by" htmlFor="cb-method">
              <Select id="cb-method" value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reference" required htmlFor="cb-ref">
              <Input id="cb-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>

          <Field label="Bank confirmation" required htmlFor="cb-file" hint="A PDF or screenshot of the transfer.">
            <div className="flex items-center gap-3">
              <label className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-input px-3 text-sm text-foreground", uploading && "opacity-60")}>
                <LuUpload className="size-4" aria-hidden />
                {uploading ? "Uploading…" : fileName ? "Replace file" : "Choose file"}
                <input
                  id="cb-file"
                  type="file"
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                  }}
                />
              </label>
              {fileName ? <span className="truncate text-[13px] text-success">{fileName}</span> : null}
            </div>
          </Field>

          <Field label="Notes" htmlFor="cb-notes">
            <Textarea id="cb-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth recording about this run…" />
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
            <Button type="button" disabled={!ready} onClick={clear}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Clear {formatNaira(includedTotal)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function defaultReference(batch: BatchView): string {
  const period = batch.periodKey.replace(/-/g, "");
  return `BATCH-${period}-${batch.cohort.slice(0, 3)}`;
}

function BatchHistory({ rows }: { rows: HistoryRow[] }) {
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-foreground">Recent batches</h3>
      <ul className="mt-2 divide-y divide-border/70">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-[13px]">
            <span className="text-foreground">
              {r.cohortLabel} · {r.periodKey}
              <span className="ml-2 text-muted-foreground">
                {r.status === "FINALIZED" ? "paid, emails sent" : r.status === "CLEARED" ? "paid, undo window open" : "rolled back"}
                {r.batchReference ? ` · ${r.batchReference}` : ""}
              </span>
            </span>
            <span className="font-mono tabular-nums text-foreground">
              {formatNaira(r.totalAmount)} · {r.recipientCount} recipient{r.recipientCount === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
