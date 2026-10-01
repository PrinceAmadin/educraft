"use client";

import * as React from "react";
import { LuCircleAlert, LuCircleCheck, LuLoaderCircle, LuTrash2, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CLEANUP_TEXT, confirmMatches, confirmPhrase, reasonIsValid } from "@/lib/project-cleanup";
import type { CleanupPreview, DeleteResult } from "@/lib/services/project-cleanup";
import { formatNaira } from "@/lib/utils";

/**
 * Founder only. Opens on a selection of project codes, asks the server what
 * each delete would remove (and what stops it), then deletes the ones that
 * can go once a reason and the typed phrase are given. The server checks the
 * reason, the phrase and every refusal again.
 */
export function DeleteProjectsDialog({
  codes,
  open,
  onOpenChange,
  onFinished,
}: {
  codes: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the founder closes the dialog after a delete ran (some projects may have gone). */
  onFinished: (results: DeleteResult[]) => void;
}) {
  const [previews, setPreviews] = React.useState<CleanupPreview[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<DeleteResult[] | null>(null);
  const codesKey = codes.join(",");

  React.useEffect(() => {
    if (!open) return;
    setPreviews(null);
    setLoadError(null);
    setReason("");
    setConfirm("");
    setError(null);
    setResults(null);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/cleanup/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "preview", codes: codesKey.split(",") }),
        });
        const body = (await res.json().catch(() => null)) as { previews?: CleanupPreview[]; error?: string } | null;
        if (!res.ok || !body?.previews) throw new Error(body?.error ?? "Could not read these projects.");
        if (!cancelled) setPreviews(body.previews);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not read these projects.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, codesKey]);

  const deletable = (previews ?? []).filter((p) => p.refusals.length === 0).map((p) => p.code);
  const phrase = deletable.length ? confirmPhrase(deletable) : "";
  const ready = deletable.length > 0 && reasonIsValid(reason) && confirmMatches(confirm, deletable);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cleanup/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", codes: deletable, reason, confirm }),
      });
      const body = (await res.json().catch(() => null)) as { results?: DeleteResult[]; error?: string } | null;
      if (!res.ok || !body?.results) throw new Error(body?.error ?? "Nothing was deleted. Try again.");
      setResults(body.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nothing was deleted. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function close(next: boolean) {
    if (busy) return;
    if (!next && results) onFinished(results);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{results ? "Deletion finished" : CLEANUP_TEXT.dialogTitle(codes.length)}</DialogTitle>
          <DialogDescription>
            {results ? "What happened to each project." : previews && deletable.length === 0 ? "The reasons are below." : CLEANUP_TEXT.dialogIntro}
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <ResultList results={results} />
        ) : loadError ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {loadError}
          </p>
        ) : !previews ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            <LuLoaderCircle className="size-4 animate-spin" aria-hidden />
            Reading what goes with {codes.length === 1 ? "it" : "them"}…
          </p>
        ) : (
          <>
            <ul className="space-y-4">
              {previews.map((p) => (
                <PreviewItem key={p.code} preview={p} />
              ))}
            </ul>

            {deletable.length ? (
              <div className="space-y-4 rounded-2xl bg-zone p-4">
                <Field label={CLEANUP_TEXT.reasonLabel} htmlFor="cleanup-reason" hint={CLEANUP_TEXT.reasonHint} required>
                  <Textarea
                    id="cleanup-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    placeholder="Made while testing the intake form"
                  />
                </Field>
                <Field label={CLEANUP_TEXT.confirmLabel(phrase)} htmlFor="cleanup-confirm" required>
                  <Input
                    id="cleanup-confirm"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                  />
                </Field>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{codes.length === 1 ? "This project can't be deleted." : "None of these can be deleted."}</p>
            )}

            {error ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-danger">
                <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}
          </>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {results ? (
            <Button type="button" onClick={() => close(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => close(false)} disabled={busy}>
                Cancel
              </Button>
              {deletable.length ? (
                <Button type="button" variant="destructive" onClick={submit} disabled={!ready || busy}>
                  {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuTrash2 className="size-4" aria-hidden />}
                  {busy ? "Deleting…" : CLEANUP_TEXT.deleteButton(deletable.length)}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewItem({ preview: p }: { preview: CleanupPreview }) {
  const r = p.removes;
  const lines: { label: string; amount?: number }[] = [
    ...r.payments.map((x) => ({ label: `Payment ${x.paymentId} · ${x.label}`, amount: x.amount })),
    ...(r.buckets.retained ? [{ label: "EduCraft's share in the four buckets", amount: r.buckets.retained }] : []),
    ...r.pots.map((x) => ({ label: `Pot · ${x.label}`, amount: x.amount })),
    ...r.payouts.map((x) => ({ label: `Payout · ${x.label}`, amount: x.amount })),
    ...r.expenses.map((x) => ({ label: `Expense · ${x.label}`, amount: x.amount })),
    ...(r.referral ? [{ label: r.referral }] : []),
    ...(r.files ? [{ label: `${r.files} stored file${r.files === 1 ? "" : "s"}` }] : []),
    {
      label: p.client.deleted
        ? `Client ${p.client.name} (${p.client.code})${p.client.loginDeleted ? " and their client-only login" : ""}`
        : `Client ${p.client.name} stays (${p.client.otherProjects} other project${p.client.otherProjects === 1 ? "" : "s"})`,
    },
  ];

  return (
    <li className="space-y-2 border-t border-border/70 pt-4 first:border-t-0 first:pt-0">
      <div>
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-mono font-medium text-foreground">{p.code}</span>
          <span className="text-muted-foreground">{p.title ?? "Untitled project"}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {p.clientName} · {p.status.replace(/_/g, " ").toLowerCase()}
        </p>
      </div>

      {p.refusals.length ? (
        <div className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
          <p className="font-medium">{CLEANUP_TEXT.cannotDelete}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {p.refusals.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <p className="meta-label">Goes with it</p>
          <ul className="space-y-1 text-sm">
            {lines.map((l) => (
              <li key={l.label} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-foreground">{l.label}</span>
                {l.amount != null ? <span className="shrink-0 font-mono tabular-nums text-foreground">{formatNaira(l.amount)}</span> : null}
              </li>
            ))}
          </ul>
          {p.warnings.length ? (
            <ul className="space-y-1 text-sm">
              {p.warnings.map((w) => (
                <li key={w} className={w === CLEANUP_TEXT.noSignal ? "flex items-start gap-2 text-danger" : "flex items-start gap-2 text-gold"}>
                  <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {w}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </li>
  );
}

function ResultList({ results }: { results: DeleteResult[] }) {
  return (
    <ul className="space-y-3">
      {results.map((r) => (
        <li key={r.code} className="text-sm">
          <p className={r.ok ? "flex items-start gap-2 text-foreground" : "flex items-start gap-2 text-danger"}>
            {r.ok ? <LuCircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
            <span>
              <span className="font-mono font-medium">{r.code}</span> {r.ok ? `deleted. ${r.line ?? ""}` : r.error}
              {r.ok && r.clientDeleted ? " The client went too." : ""}
              {r.ok && r.loginDeleted ? " So did their login." : ""}
            </span>
          </p>
          {r.refusals?.length ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-11 text-danger">
              {r.refusals.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
