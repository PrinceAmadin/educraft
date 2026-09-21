"use client";

import * as React from "react";
import { LuCircleAlert, LuLoaderCircle, LuMegaphone } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Failure = { name: string; email: string; error: string };

/** Email every active ambassador with an address on file — the old panel's Broadcast. */
export function BroadcastButton({ recipientCount }: { recipientCount: number }) {
  const [open, setOpen] = React.useState(false);
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<string | null>(null);
  const [failures, setFailures] = React.useState<Failure[]>([]);

  function openDialog() {
    setSubject("");
    setMessage("");
    setError(null);
    setFailures([]);
    setOutcome(null);
    setOpen(true);
  }

  async function send() {
    if (!subject.trim() || !message.trim()) {
      setError("Enter a title and the details.");
      return;
    }
    setBusy(true);
    setError(null);
    setFailures([]);
    try {
      const res = await fetch("/api/admin/ambassadors/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      });
      const body = (await res.json().catch(() => null)) as
        | { sent: number; failed: number; total: number; failures?: Failure[] }
        | { error: string }
        | null;
      if (!res.ok || !body) throw new Error((body as { error?: string })?.error ?? "Could not send.");
      if ("sent" in body) {
        setOutcome(
          body.failed > 0
            ? `Sent to ${body.sent} of ${body.total} ambassadors — ${body.failed} failed.`
            : `Sent to all ${body.sent} ambassadors.`
        );
        setFailures(body.failures ?? []);
        setSubject("");
        setMessage("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={openDialog}>
        <LuMegaphone className="size-4" aria-hidden />
        Broadcast
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Broadcast to ambassadors</DialogTitle>
            <DialogDescription>
              Write the update once. Every active ambassador gets it by email, and those with a dashboard login also see it in their notifications. {recipientCount === 1 ? "1 ambassador has" : `${recipientCount} ambassadors have`} an email on file right now.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Update title" required htmlFor="bc-subject">
              <Input
                id="bc-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. New commission rates from October"
              />
            </Field>
            <Field label="Details" required htmlFor="bc-body">
              <Textarea
                id="bc-body"
                rows={7}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write the full update. Line breaks are kept in the email."
              />
            </Field>

            {outcome ? <p className="text-sm text-success">{outcome}</p> : null}
            {failures.length > 0 ? (
              <div className="space-y-1.5 text-sm">
                <p className="text-muted-foreground">Not delivered. Fix the address on their page, then message them directly:</p>
                <ul className="space-y-1">
                  {failures.map((f) => (
                    <li key={f.email} className="text-danger">
                      <span className="font-medium">{f.name}</span> <span className="font-mono text-xs">{f.email}</span>
                      <span className="block text-xs text-muted-foreground">{f.error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {error ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-danger">
                <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button type="button" disabled={busy || recipientCount === 0} onClick={send}>
                {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                {recipientCount === 1 ? "Send to 1 ambassador" : `Send to all ${recipientCount}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
