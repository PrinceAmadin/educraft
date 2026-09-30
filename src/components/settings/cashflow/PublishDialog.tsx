"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/forms/Field";
import type { DiffLine, Violation } from "@/lib/finance/cashflow-rules";
import type { CashflowStructure } from "@/lib/finance/cashflow-types";
import { formatDate } from "@/lib/utils";

/**
 * "You are about to publish Cashflow Version 3. This replaces Version 2
 * (active since 4 September 2026). Changes: … Continue?" — then the POST.
 */
export function PublishDialog({
  open,
  onClose,
  structure,
  currentVersion,
  activeSince,
  diff,
  tiersChanged,
  warnings,
  onPublished,
}: {
  open: boolean;
  onClose: () => void;
  structure: CashflowStructure;
  currentVersion: number;
  activeSince: string;
  diff: DiffLine[];
  tiersChanged: boolean;
  warnings: Violation[];
  onPublished: (versionNumber: number) => void;
}) {
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [serverViolations, setServerViolations] = React.useState<Violation[]>([]);

  async function publish() {
    setBusy(true);
    setError(null);
    setServerViolations([]);
    try {
      const res = await fetch("/api/admin/cashflow/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ structure, reason: reason.trim() || undefined, basedOnVersion: currentVersion }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; violations?: Violation[]; versionNumber?: number } | null;
      if (!res.ok) {
        if (body?.violations?.length) setServerViolations(body.violations.filter((v) => v.severity === "error"));
        throw new Error(body?.error ?? "The version could not be published.");
      }
      setReason("");
      onPublished(body?.versionNumber ?? currentVersion + 1);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The version could not be published.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Publish Cashflow version {currentVersion + 1}</DialogTitle>
          <DialogDescription>
            This replaces version {currentVersion} (active since {formatDate(activeSince)}). Projects created from now on use the new version; every existing project keeps the version it was created under.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="meta-label">Changes</p>
            {diff.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">Nothing changed.</p>
            ) : (
              <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto text-sm">
                {diff.map((d, i) => (
                  <li key={`${d.section}-${d.label}-${i}`} className="text-foreground">
                    <span className="font-medium">{d.label}</span>
                    <span className="text-muted-foreground">
                      {d.from == null ? ` — added: ${d.to}` : d.to == null ? ` — removed (was ${d.from})` : `: ${d.from} → ${d.to}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {tiersChanged ? (
            <p className="flex items-start gap-2 rounded-xl bg-gold/10 px-3 py-2 text-sm text-gold">
              <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              Tier thresholds or rates changed: every ambassador is re-tiered by the new ladder after publishing. Jobs keep the rates they were allocated at.
            </p>
          ) : null}
          {warnings.length ? (
            <ul className="space-y-1 text-[13px] text-gold">
              {warnings.map((w, i) => (
                <li key={`${w.code}-${i}`}>{w.message}</li>
              ))}
            </ul>
          ) : null}
          <Field label="Why this change" htmlFor="publish-reason" hint="Kept with the version and in the audit log.">
            <Textarea id="publish-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="Optional" />
          </Field>
          {serverViolations.length ? (
            <ul className="space-y-1 text-sm text-danger">
              {serverViolations.map((v, i) => (
                <li key={`${v.code}-${i}`}>{v.message}</li>
              ))}
            </ul>
          ) : null}
          {error ? (
            <p className="flex items-start gap-2 text-sm text-danger" role="alert">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || diff.length === 0} onClick={publish}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              {busy ? "Publishing…" : `Publish version ${currentVersion + 1}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
