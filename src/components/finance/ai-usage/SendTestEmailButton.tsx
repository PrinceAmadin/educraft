"use client";

import * as React from "react";
import { LuLoaderCircle, LuMail } from "react-icons/lu";
import { Button } from "@/components/ui/button";

/** Founder-only: send the three sample cashflow emails to the test recipient (Item 5). */
export function SendTestEmailButton() {
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/finance/email-test", { method: "POST" });
      const b = (await res.json().catch(() => null)) as { recipient?: string; results?: { ok: boolean }[]; error?: string } | null;
      if (!res.ok) throw new Error(b?.error ?? "Could not send.");
      const failed = (b?.results ?? []).filter((r) => !r.ok).length;
      setOk(failed === 0);
      setMsg(failed ? `${failed} of 3 failed — check the server logs.` : `Sent 3 test emails to ${b?.recipient}.`);
    } catch (e) {
      setOk(false);
      setMsg(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-zone px-5 py-4">
      <p className="text-sm font-medium text-foreground">Email test</p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Send one of each cashflow email (commission, payout, weekly statement) to the test recipient, to confirm delivery before the first real run.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={send}>
          {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuMail className="size-4" aria-hidden />}
          Send test emails
        </Button>
        {msg ? <span className={ok ? "text-[13px] text-success" : "text-[13px] text-danger"}>{msg}</span> : null}
      </div>
    </section>
  );
}
