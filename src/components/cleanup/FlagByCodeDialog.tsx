"use client";

import * as React from "react";
import { LuCircleAlert, LuFlaskConical, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * "Flag a test project" from the account menu, for the COO and anyone the
 * founder appointed, on whatever dashboard they are. Only a code and a note:
 * the reply never describes the project.
 */
export function FlagByCodeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [code, setCode] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setError(null);
      setDone(null);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/test-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, note: note.trim() || undefined }),
      });
      const body = (await res.json().catch(() => null)) as { code?: string; message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "That could not be saved.");
      setDone(`${body?.code ?? code}: ${body?.message ?? "Flagged."}`);
      setCode("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Flag a test project</DialogTitle>
          <DialogDescription>
            It goes to the top of the founder&apos;s cleanup list. Nothing is removed unless the founder deletes it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Project code" htmlFor="flag-code" required>
            <Input
              id="flag-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="EC-00007"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          </Field>
          <Field label="Note for the founder" htmlFor="flag-code-note" hint="Optional: who made it and why.">
            <Textarea id="flag-code-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
          </Field>
          {error ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}
          {done ? (
            <p role="status" className="text-sm text-success">
              {done}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              {done ? "Close" : "Cancel"}
            </Button>
            <Button type="submit" disabled={busy || !code.trim()}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuFlaskConical className="size-4" aria-hidden />}
              Flag
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
