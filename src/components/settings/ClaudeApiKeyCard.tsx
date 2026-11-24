"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuKeyRound, LuLoaderCircle, LuLock, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm";
import { Field } from "@/components/forms/Field";
import type { AnthropicKeyStatus } from "@/lib/anthropic-key";
import { formatDate } from "@/lib/utils";

/**
 * The Anthropic API key, changed without a code edit or a deploy (founder's
 * call, 24 Nov 2026). Rendered on Settings > General and on the AI usage tab,
 * from this one component so the two cannot drift apart.
 *
 * The key is never sent to the browser: everything here is drawn from the
 * masked status. The founder alone sees it — `canEdit` is the same
 * SUPER_ADMIN test the balance card uses, and the route refuses anyone else.
 */

const ENDPOINT = "/api/admin/settings/anthropic-key";

type Tone = "ok" | "warn" | "danger";

function describe(status: AnthropicKeyStatus): { tone: Tone; line: string; detail: string | null } {
  if (status.unreadable) {
    return {
      tone: "warn",
      line: "The saved key could not be read",
      detail: status.hasEnvFallback
        ? "AUTH_SECRET has changed since it was saved, so HQ is using the key from the environment instead. Paste the key again to fix it."
        : "AUTH_SECRET has changed since it was saved, and there is no key in the environment. Paste the key again — report generation fails until you do.",
    };
  }
  if (status.source === "setting") {
    const who = status.setByName ? ` by ${status.setByName}` : "";
    const when = status.setAt ? ` on ${formatDate(status.setAt)}` : "";
    return {
      tone: "ok",
      line: `Using the key saved here — ${status.hint ?? "saved"}`,
      detail: `Set${who}${when}.${status.verifiedAt ? "" : " Anthropic could not be reached to check it when it was saved."}`,
    };
  }
  if (status.source === "env") {
    return {
      tone: "ok",
      line: "Using the key from the environment",
      detail: "No key is saved here, so HQ falls back to ANTHROPIC_API_KEY in Vercel. Save one here to change accounts without a deploy.",
    };
  }
  return {
    tone: "danger",
    line: "No Anthropic API key anywhere",
    detail: "Nothing is saved here and ANTHROPIC_API_KEY is not set, so report generation, research and the quality gate all fail. Paste a key to start.",
  };
}

const TONE_TEXT: Record<Tone, string> = { ok: "text-foreground", warn: "text-gold", danger: "text-danger" };

export function ClaudeApiKeyCard({ status, canEdit }: { status: AnthropicKeyStatus; canEdit: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [open, setOpen] = React.useState(false);
  const [key, setKey] = React.useState("");
  const [balance, setBalance] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState(false);

  const { tone, line, detail } = describe(status);

  async function save() {
    setError(null);
    if (!key.trim()) return setError("Paste the API key.");
    const balanceUsd = balance.trim() ? Number(balance) : undefined;
    if (balance.trim() && (!Number.isFinite(balanceUsd) || (balanceUsd as number) < 0)) {
      return setError("Enter the credit balance in US dollars, or leave it blank.");
    }
    setBusy(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim(), balanceUsd }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; verified?: boolean; note?: string | null } | null;
      if (!res.ok) throw new Error(body?.error ?? "Could not save the key.");
      setOpen(false);
      setKey("");
      setBalance("");
      setNote(
        body?.verified
          ? "Saved — Anthropic accepted the key."
          : (body?.note ?? "Saved, but Anthropic could not be reached to check it."),
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the key.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: "Remove the saved key?",
      description: status.hasEnvFallback
        ? "HQ will go back to the ANTHROPIC_API_KEY set in Vercel."
        : "There is no key in the environment, so every Claude call will fail until you save another one.",
      confirmLabel: "Remove it",
      tone: "danger",
    });
    if (!ok) return;
    setRemoving(true);
    setNote(null);
    try {
      const res = await fetch(ENDPOINT, { method: "DELETE" });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "Could not remove the key.");
      setNote("The saved key was removed.");
      router.refresh();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not remove the key.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="meta-label flex items-center gap-1.5">
            <LuKeyRound className="size-3.5 text-primary" aria-hidden />
            Claude API key
          </p>
          <p className={`mt-1 font-medium ${TONE_TEXT[tone]}`}>
            {tone !== "ok" ? <LuTriangleAlert className="mr-1.5 inline size-4 align-[-2px]" aria-hidden /> : null}
            <span className="font-mono text-[15px] tabular-nums">{line}</span>
          </p>
          {detail ? <p className="mt-1 max-w-prose text-sm text-muted-foreground">{detail}</p> : null}
        </div>
        {canEdit ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setError(null); setOpen(true); }}>
              {status.source === "setting" || status.unreadable ? "Change key" : "Save a key"}
            </Button>
            {status.hasSavedKey ? (
              <Button type="button" variant="ghost" size="sm" disabled={removing} onClick={remove}>
                {removing ? "Removing…" : "Remove saved key"}
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <LuLock className="size-3.5" aria-hidden />
            Only the founder can change this
          </p>
        )}
      </div>
      {note ? <p className="mt-3 text-xs text-muted-foreground">{note}</p> : null}

      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change the Claude API key</DialogTitle>
            <DialogDescription>
              Paste the key from the Anthropic Console. HQ checks it with Anthropic before saving, stores it
              encrypted, and every Claude call uses it from the next call onward — no deploy needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="API key" htmlFor="anthropic-key" required hint="Starts with sk-ant-. It is never shown again after saving.">
              <Input
                id="anthropic-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-ant-api03-…"
              />
            </Field>
            <Field
              label="Credit balance (US$)"
              htmlFor="anthropic-balance"
              hint="Optional. Fill this in for a new Claude account — it resets the balance on this page and starts counting spend afresh."
            >
              <Input
                id="anthropic-balance"
                inputMode="decimal"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="200"
              />
            </Field>
            {error ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-danger">
                <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={busy} onClick={save}>
                {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                {busy ? "Checking…" : "Check and save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
