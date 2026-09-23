"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { clearDeviceBeforeSwitch } from "@/lib/pwa/sign-out";
import { LuCircleAlert, LuInfo, LuLoaderCircle, LuMailCheck } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EDUCRAFT_WHATSAPP_URL, formatWait, type CodeAccount, type CodeRequestResult } from "@/lib/code-request";

const RESEND_SECONDS = 60;
const PASSWORD_MIN = 8;

type Alert = { tone: "error" | "info"; body: React.ReactNode };

const inlineLink = "font-medium underline underline-offset-4";

const contactUs = (
  <a href={EDUCRAFT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className={inlineLink}>
    message EduCraft on WhatsApp
  </a>
);

/** What to tell someone when no code went out. `typed` is what they entered: an email or an ID. */
function refusal(result: CodeRequestResult, typed: string): Alert {
  const isEmail = typed.includes("@");
  const shown = <strong className="font-medium [overflow-wrap:anywhere]">{typed}</strong>;
  switch (result.status) {
    case "invalid":
      return { tone: "error", body: "Enter the email address you registered with." };
    case "not_registered":
      return {
        tone: "error",
        body: isEmail ? (
          <>{shown} is not registered with EduCraft. Check the spelling, or use the email you registered with.</>
        ) : (
          <>No account has the ID {shown}. Check it, or enter your email instead.</>
        ),
      };
    case "pending":
      return {
        tone: "info",
        body: "Your application is still being reviewed. We will email you once it is approved, and you then sign in with the password you chose when you applied.",
      };
    case "inactive":
      return { tone: "error", body: <>This account is not active at the moment, so a password can&apos;t be set. Please {contactUs}.</> };
    case "no_email":
      return { tone: "error", body: <>There is no email on this record yet, so we can&apos;t send a code. Please {contactUs} to add one.</> };
    case "needs_admin":
      return {
        tone: "error",
        body: <>We found your account, but it needs a quick fix on our side before you can set a password. Please {contactUs}.</>,
      };
    case "unavailable":
      return { tone: "error", body: <>This email can&apos;t set a password here. Please {contactUs}.</> };
    default:
      return { tone: "error", body: "Something went wrong. Please try again." };
  }
}

/**
 * Forgot password (or first-time setup) for every kind of login: workers,
 * ambassadors and clients. They type their email (or ID); the server works out
 * which kind of account it is, emails a code to the address on that record, and
 * says which password the code sets (`account`). Workers and ambassadors then
 * sign in at /login; a client is signed straight into /client. Says plainly when
 * the email is not registered (or under review, or suspended) instead of "if
 * that matches an account…".
 */
export function SetPasswordForm({ initialIdentifier = "" }: { initialIdentifier?: string }) {
  const router = useRouter();
  const [step, setStep] = React.useState<"request" | "setup">("request");
  const [identifier, setIdentifier] = React.useState(initialIdentifier);
  const [sent, setSent] = React.useState<{ to: string; earlier: boolean; account: CodeAccount } | null>(null);
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [alert, setAlert] = React.useState<Alert | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

  const fail = (body: React.ReactNode) => setAlert({ tone: "error", body });

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setAlert(null);
    const id = identifier.trim();
    if (!id) return fail("Enter your email or ID.");
    setBusy(true);
    try {
      const res = await fetch("/api/portal/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: id }),
      });
      if (res.status === 429) return fail("Too many attempts. Please wait a few minutes and try again.");
      if (!res.ok) throw new Error();
      const result = (await res.json()) as CodeRequestResult;
      const retryAfter = result.retryAfter ?? RESEND_SECONDS;

      // Older responses carried no `account`: they were always worker/ambassador codes.
      const account = result.account ?? "team";

      if (result.status === "sent") {
        setSent({ to: result.sentTo ?? id, earlier: false, account });
        setCode("");
        setCooldown(RESEND_SECONDS);
        setStep("setup");
      } else if (result.status === "wait" && result.codeStillValid) {
        // One went out moments ago and still works: send them to it rather than leave them waiting.
        setSent({ to: result.sentTo ?? id, earlier: true, account });
        setCooldown(retryAfter);
        setStep("setup");
      } else if (result.status === "wait") {
        setCooldown(retryAfter);
        fail(`You have asked for several codes in a short time. Please try again in ${formatWait(retryAfter)}.`);
      } else {
        // Back to the email field, so the message sits next to what they typed.
        setStep("request");
        setAlert(refusal(result, id));
      }
    } catch {
      fail("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAlert(null);
    if (!/^\d{6}$/.test(code)) return fail("Enter the 6-digit code from your email.");
    if (password.length < PASSWORD_MIN) return fail(`Your password needs at least ${PASSWORD_MIN} characters.`);
    if (password !== confirm) return fail("The two passwords do not match.");
    const id = identifier.trim();
    const isClient = sent?.account === "client";
    setBusy(true);
    try {
      // The code proves the inbox for one kind of login; save the password on that one.
      const res = await fetch(isClient ? "/api/client/password/set" : "/api/portal/password/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: id, code, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        fail(data?.error ?? "Something went wrong. Please try again.");
        setBusy(false);
        return;
      }
      if (isClient) {
        // Clients have their own sign-in (Client ID or email): sign them straight in.
        await clearDeviceBeforeSwitch();
        const signedIn = await signIn("client-password", { identifier: id, password, redirect: false });
        if (signedIn && !signedIn.error) {
          router.push("/client");
          router.refresh();
        } else {
          router.push(`/client/login?id=${encodeURIComponent(id)}`);
        }
        return;
      }
      const done = (await res.json().catch(() => null)) as { signInEmail?: string } | null;
      const email = done?.signInEmail ? `&email=${encodeURIComponent(done.signInEmail)}` : "";
      router.push(`/login?passwordSet=1${email}`);
    } catch {
      setBusy(false);
      fail("Something went wrong. Please try again.");
    }
  }

  const alertBox = alert ? (
    alert.tone === "error" ? (
      <div role="alert" className="flex items-start gap-2.5 rounded-lg bg-danger/10 px-3.5 py-3 text-sm text-danger">
        <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{alert.body}</span>
      </div>
    ) : (
      <div role="status" className="flex items-start gap-2.5 rounded-lg bg-zone px-3.5 py-3 text-sm text-foreground">
        <LuInfo className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>{alert.body}</span>
      </div>
    )
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
        {alertBox}
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
            aria-invalid={alert?.tone === "error"}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          We send a 6-digit code to the email you registered with, never to a different address.
        </p>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {spinner("Checking…", "Email me a code")}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={saveSubmit} noValidate className="space-y-5">
      <div className="flex items-start gap-3 rounded-lg bg-zone px-4 py-3.5 text-sm text-foreground">
        <LuMailCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p className="leading-relaxed">
          {sent?.earlier ? "We already sent a code to " : "We sent a 6-digit code to "}
          <strong className="font-medium [overflow-wrap:anywhere]">{sent?.to ?? identifier.trim()}</strong>
          {sent?.earlier ? " a short while ago, and it still works. " : ". "}
          It can take a minute, so check your spam folder too.
        </p>
      </div>
      {alertBox}
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
        {spinner("Saving…", sent?.account === "client" ? "Save password and sign in" : "Save password")}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button
          type="button"
          onClick={() => sendCode()}
          disabled={busy || cooldown > 0}
          className="font-medium text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
        >
          {cooldown > 0 ? `Send a new code in ${formatWait(cooldown)}` : "Send a new code"}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep("request");
            setAlert(null);
            setSent(null);
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
