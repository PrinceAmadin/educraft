"use client";

import * as React from "react";
import { LuCircleAlert, LuLoaderCircle, LuMail } from "react-icons/lu";
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

/** Email one ambassador directly — the old panel's Tracking "Message". */
export function MessageAmbassadorButton({
  ambassadorId,
  ambassadorName,
  hasEmail,
}: {
  ambassadorId: string;
  ambassadorName: string;
  hasEmail: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<string | null>(null);

  function openDialog() {
    setTitle("");
    setMessage("");
    setError(null);
    setOpen(true);
  }

  async function send() {
    if (!title.trim() || !message.trim()) {
      setError("Enter a subject and a message.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ambassadors/${ambassadorId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), message: message.trim() }),
      });
      const body = (await res.json().catch(() => null)) as
        | { sent: boolean; to: string | null; error?: string }
        | { error: string }
        | null;
      if (!res.ok || !body) throw new Error((body as { error?: string })?.error ?? "Could not send.");
      if ("sent" in body && body.sent) {
        setOutcome(`Sent to ${body.to}.`);
        setOpen(false);
      } else {
        setError("error" in body ? (body.error ?? "Could not send.") : "No email on file.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={openDialog} disabled={!hasEmail} title={hasEmail ? undefined : "No email on file"}>
        <LuMail className="size-4" aria-hidden />
        Message
      </Button>
      {outcome ? <p className="mt-2 text-xs text-success">{outcome}</p> : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Message {ambassadorName}</DialogTitle>
            <DialogDescription>Sent by email, and as a notification if they have a portal login.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Subject" required htmlFor="msg-title">
              <Input
                id="msg-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Well done this month!"
              />
            </Field>
            <Field label="Message" required htmlFor="msg-body">
              <Textarea
                id="msg-body"
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message…"
              />
            </Field>

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
              <Button type="button" disabled={busy} onClick={send}>
                {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                Send
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
