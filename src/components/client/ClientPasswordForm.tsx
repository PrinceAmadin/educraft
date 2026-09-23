"use client";

import * as React from "react";
import { LuCircleAlert, LuCircleCheck, LuLoaderCircle, LuMailCheck } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatWait, type CodeRequestResult } from "@/lib/code-request";

const PASSWORD_MIN = 8;
const RESEND_SECONDS = 60;

type Step = "idle" | "code" | "done";

/**
 * Change password while signed in. Same proof as first-time setup: a 6-digit
 * code emailed to the address on the client record, then the new password.
 */
export function ClientPasswordForm({ clientId }: { clientId: string }) {
  const [step, setStep] = React.useState<Step>("idle");
  const [sent, setSent] = React.useState<{ to: string; earlier: boolean } | null>(null);
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/client/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: clientId }),
      });
      if (res.status === 429) return setError("Too many attempts. Please wait a few minutes and try again.");
      if (!res.ok) throw new Error();
      const result = (await res.json()) as CodeRequestResult;
      const retryAfter = result.retryAfter ?? RESEND_SECONDS;
      if (result.status === "sent") {
        setSent({ to: result.sentTo ?? "your email", earlier: false });
        setCode("");
        setCooldown(RESEND_SECONDS);
        setStep("code");
      } else if (result.status === "wait" && result.codeStillValid) {
        setSent({ to: result.sentTo ?? "your email", earlier: true });
        setCooldown(retryAfter);
        setStep("code");
      } else if (result.status === "wait") {
        setCooldown(retryAfter);
        setError(`You have asked for several codes in a short time. Please try again in ${formatWait(retryAfter)}.`);
      } else {
        setError("We couldn't send a code to the email on your record. Please message EduCraft on WhatsApp.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your email.");
    if (password.length < PASSWORD_MIN) return setError(`Your password needs at least ${PASSWORD_MIN} characters.`);
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    try {
      const res = await fetch("/api/client/password/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: clientId, code, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        return setError(data?.error ?? "Something went wrong. Please try again.");
      }
      setPassword("");
      setConfirm("");
      setCode("");
      setStep("done");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const errorBox = error ? (
    <p role="alert" className="flex items-start gap-2 text-sm text-danger">
      <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {error}
    </p>
  ) : null;

  if (step === "done") {
    return (
      <p className="flex items-center gap-2 text-sm text-success">
        <LuCircleCheck className="size-4 shrink-0" aria-hidden />
        Your password is changed. Use it next time you sign in.
      </p>
    );
  }

  if (step === "idle") {
    return (
      <div className="space-y-3">
        {errorBox}
        <p className="text-[13px] text-muted-foreground">
          We email a 6-digit code to the address on your record, then you choose a new password.
        </p>
        <Button type="button" variant="outline" onClick={() => void sendCode()} disabled={busy}>
          {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          Email me a code
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={save} noValidate className="max-w-sm space-y-4">
      <p className="flex items-start gap-2.5 text-sm text-foreground">
        <LuMailCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>
          {sent?.earlier ? "We already sent a code to " : "We sent a code to "}
          <strong className="font-medium [overflow-wrap:anywhere]">{sent?.to ?? "your email"}</strong>
          {sent?.earlier ? " a short while ago, and it still works. " : ". "}
          It can take a minute, so check spam too.
        </span>
      </p>
      {errorBox}
      <div className="space-y-2">
        <Label htmlFor="pw-code">6-digit code</Label>
        <Input
          id="pw-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          className="text-center font-mono text-xl tracking-[0.5em]"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw-new">New password</Label>
        <Input id="pw-new" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <p className="text-xs text-muted-foreground">At least {PASSWORD_MIN} characters.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw-confirm">Confirm password</Label>
        <Input id="pw-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          Save new password
        </Button>
        <button
          type="button"
          onClick={() => void sendCode()}
          disabled={busy || cooldown > 0}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
        >
          {cooldown > 0 ? `Send a new code in ${formatWait(cooldown)}` : "Send a new code"}
        </button>
      </div>
    </form>
  );
}
