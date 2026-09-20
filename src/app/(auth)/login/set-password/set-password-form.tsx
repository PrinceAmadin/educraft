"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle, LuMailCheck } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RESEND_SECONDS = 60;
const PASSWORD_MIN = 8;

/**
 * Existing ambassadors: identify yourself (email or Ambassador ID), enter the code
 * emailed to the address on your record, choose a password, then sign in at /login.
 * The wording never says whether the account exists.
 */
export function SetPasswordForm() {
  const router = useRouter();
  const [step, setStep] = React.useState<"request" | "setup">("request");
  const [identifier, setIdentifier] = React.useState("");
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

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const id = identifier.trim();
    if (!id) return setError("Enter your email or ID.");
    setBusy(true);
    try {
      const res = await fetch("/api/portal/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: id }),
      });
      if (res.status === 429) return setError("Too many attempts. Please wait a few minutes and try again.");
      if (!res.ok) throw new Error();
      setCode("");
      setCooldown(RESEND_SECONDS);
      setStep("setup");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your email.");
    if (password.length < PASSWORD_MIN) return setError(`Your password needs at least ${PASSWORD_MIN} characters.`);
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    try {
      const res = await fetch("/api/portal/password/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), code, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong. Please try again.");
        setBusy(false);
        return;
      }
      router.push("/login?passwordSet=1");
    } catch {
      setBusy(false);
      setError("Something went wrong. Please try again.");
    }
  }

  const errorBox = error ? (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg bg-danger/10 px-3.5 py-3 text-sm text-danger">
      <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{error}</span>
    </div>
  ) : null;

  const spinner = (label: string, idle: string) => (
    <>
      {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {busy ? label : idle}
    </>
  );

  if (step === "request") {
    return (
      <form onSubmit={sendCode} noValidate className="space-y-5">
        {errorBox}
        <div className="space-y-2">
          <Label htmlFor="identifier">Email</Label>
          <Input
            id="identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@gmail.com"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          We send a 6-digit code to the email you registered with, never to a different address.
        </p>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {spinner("Sending…", "Email me a code")}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={saveSubmit} noValidate className="space-y-5">
      <div className="flex items-start gap-3 rounded-lg bg-zone px-4 py-3.5 text-sm text-foreground">
        <LuMailCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p className="leading-relaxed">
          If that matches a worker or ambassador account, we have sent a 6-digit code to its registered email. It can take a minute, so
          check your spam folder too.
        </p>
      </div>
      {errorBox}
      <div className="space-y-2">
        <Label htmlFor="code">6-digit code</Label>
        <Input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          autoFocus
          className="text-center font-mono text-xl tracking-[0.5em]"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">At least {PASSWORD_MIN} characters.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {spinner("Saving…", "Save password")}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button
          type="button"
          onClick={() => sendCode()}
          disabled={busy || cooldown > 0}
          className="font-medium text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
        >
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep("request");
            setError(null);
            setCode("");
            setPassword("");
            setConfirm("");
          }}
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Use a different email
        </button>
      </div>
    </form>
  );
}
