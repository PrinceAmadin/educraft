"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { LuCircleAlert, LuExternalLink, LuLoaderCircle, LuMailCheck } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CLIENT_ID_EXAMPLE, normalizeClientIdInput } from "@/lib/id-format";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;
const PASSWORD_MIN = 8;

type Step = "signin" | "request" | "setup";

/** In-app browsers (WhatsApp, Facebook, Instagram) keep their own sign-in, separate from Chrome/Safari. */
const IN_APP_BROWSER = /WhatsApp|FBAN|FBAV|Instagram/i;

/**
 * Returning clients: Client ID (or email) + password. First time (or forgot
 * password): the code goes to the email already on the client, never to a
 * typed address, and proves ownership before a password can be set. The
 * wording never says whether an ID or email exists.
 */
export function ClientLoginForm({ initialId = "", callbackUrl = "/client" }: { initialId?: string; callbackUrl?: string }) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("signin");
  const [identifier, setIdentifier] = React.useState(initialId);
  const [inAppBrowser, setInAppBrowser] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    setInAppBrowser(IN_APP_BROWSER.test(navigator.userAgent));
  }, []);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /** "ecc 9" -> "ECC-0009", an email -> lower case, anything else -> an error. */
  function idOrError(): string | null {
    const raw = identifier.trim();
    const id = normalizeClientIdInput(raw);
    if (id) return id;
    if (EMAIL_PATTERN.test(raw)) return raw.toLowerCase();
    setError(`Enter your Client ID (like ${CLIENT_ID_EXAMPLE}) or your email.`);
    return null;
  }

  async function login(id: string, pass: string) {
    const result = await signIn("client-password", { identifier: id, password: pass, redirect: false });
    if (!result || result.error) return false;
    router.push(callbackUrl);
    router.refresh();
    return true;
  }

  async function signInSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const id = idOrError();
    if (!id) return;
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setBusy(true);
    const ok = await login(id, password);
    if (!ok) {
      setBusy(false);
      setError("That Client ID or email and password did not match. If this is your first time, or you forgot your password, use the link below.");
    }
  }

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const id = idOrError();
    if (!id) return;
    setBusy(true);
    try {
      const res = await fetch("/api/client/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: id }),
      });
      if (res.status === 429) {
        setError("Too many attempts. Please wait a few minutes and try again.");
        return;
      }
      if (!res.ok) throw new Error();
      setIdentifier(id);
      setCode("");
      setCooldown(RESEND_SECONDS);
      setStep("setup");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function setupSubmit(e: React.FormEvent) {
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
        body: JSON.stringify({ identifier, code, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong. Please try again.");
        setBusy(false);
        return;
      }
      if (!(await login(identifier, password))) {
        setBusy(false);
        setStep("signin");
        setError("Your password is saved. Please sign in.");
      }
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

  const idField = (
    <div className="space-y-2">
      <Label htmlFor="identifier">Client ID or email</Label>
      <Input
        id="identifier"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        placeholder={`${CLIENT_ID_EXAMPLE} or you@email.com`}
        autoComplete="username"
        autoCapitalize="none"
        inputMode="email"
        spellCheck={false}
        aria-invalid={!!error}
      />
    </div>
  );

  const inAppHint = inAppBrowser ? (
    <p className="flex items-start gap-2 rounded-lg bg-zone px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
      <LuExternalLink className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span>
        Opened from WhatsApp? Tap the menu and choose <span className="font-medium text-foreground">Open in browser</span>{" "}
        (Chrome or Safari) so you stay signed in next time.
      </span>
    </p>
  ) : null;

  const link = "font-medium text-primary underline-offset-4 hover:underline";

  const spinner = (label: string, idle: string) => (
    <>
      {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {busy ? label : idle}
    </>
  );

  if (step === "signin") {
    return (
      <form onSubmit={signInSubmit} noValidate className="space-y-5">
        {inAppHint}
        {errorBox}
        {idField}
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            aria-invalid={!!error}
          />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {spinner("Signing in…", "Sign in")}
        </Button>
        <p className="text-sm text-muted-foreground">
          First time here, or forgot your password?{" "}
          <button
            type="button"
            className={link}
            onClick={() => {
              setError(null);
              setPassword("");
              setStep("request");
            }}
          >
            Set it up with an email code
          </button>
        </p>
      </form>
    );
  }

  if (step === "request") {
    return (
      <form onSubmit={sendCode} noValidate className="space-y-5">
        {errorBox}
        {idField}
        <p className="text-xs text-muted-foreground">
          We email a 6-digit code to the address you used at intake. Enter it to choose your password, and you will not need a code again.
        </p>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {spinner("Sending…", "Email me a code")}
        </Button>
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={() => {
            setError(null);
            setStep("signin");
          }}
        >
          Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={setupSubmit} noValidate className="space-y-5">
      <div className="flex items-start gap-3 rounded-lg bg-zone px-4 py-3.5 text-sm text-foreground">
        <LuMailCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p className="leading-relaxed">
          If <span className="font-mono">{identifier}</span> is registered, we have sent a 6-digit code to the email
          used at intake. It can take a minute, so check your spam folder too.
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
        {spinner("Saving…", "Save password and sign in")}
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
            setStep("signin");
            setError(null);
            setCode("");
            setPassword("");
            setConfirm("");
          }}
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Back to sign in
        </button>
      </div>
    </form>
  );
}
