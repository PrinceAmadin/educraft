"use client";

import * as React from "react";
import { LuCircleCheck, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/Field";
import { Notice } from "@/components/ambassador-panel/shared";

/** Existing slot holders verify themselves — ported from the original RegisterPage. */
export function PanelRegisterForm() {
  const [form, setForm] = React.useState({ slotId: "", name: "", school: "", email: "" });
  const [state, setState] = React.useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = React.useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  if (state === "done") {
    return (
      <div className="space-y-5">
        <LuCircleCheck className="size-8 text-success" aria-hidden />
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Registration submitted</h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Your details have gone to the EduCraft team for verification. Once approved, you&apos;ll get a confirmation email
          with your active ambassador link.
        </p>
        <ol className="space-y-2 rounded-2xl bg-zone p-5 text-sm text-foreground">
          <li>1. We review your details within 24–48 hours.</li>
          <li>2. If approved, you receive a confirmation email with your link.</li>
          <li>3. If not, we tell you why.</li>
        </ol>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!form.slotId.trim()) return setError("Please enter your Slot ID.");
        if (!form.name.trim()) return setError("Please enter your full name.");
        if (!form.email.trim()) return setError("Please enter your email address.");
        setState("loading");
        setError(null);
        try {
          const res = await fetch("/api/ambassador-panel/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          });
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!res.ok) throw new Error(body?.error ?? "Registration failed. Please try again.");
          setState("done");
        } catch (err) {
          setState("idle");
          setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
        }
      }}
    >
      <Field label="Slot ID" required htmlFor="r-slot" hint="Your position number — ask your EduCraft coordinator if unsure.">
        <Input id="r-slot" value={form.slotId} onChange={set("slotId")} placeholder="e.g. 007 or ECCA-001" className="font-mono" autoComplete="off" />
      </Field>
      <Field label="Full name" required htmlFor="r-name">
        <Input id="r-name" value={form.name} onChange={set("name")} autoComplete="name" />
      </Field>
      <Field label="School / university" htmlFor="r-school">
        <Input id="r-school" value={form.school} onChange={set("school")} placeholder="e.g. EUI, UNIBEN" />
      </Field>
      <Field label="Email address" required htmlFor="r-email" hint="Approval and commission notifications are sent here.">
        <Input id="r-email" type="email" inputMode="email" value={form.email} onChange={set("email")} autoComplete="email" />
      </Field>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={state === "loading"}>
        {state === "loading" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
        {state === "loading" ? "Submitting…" : "Submit for approval"}
      </Button>
      <p className="text-[13px] text-muted-foreground">
        Your information is used only for identity verification and commission notifications.
      </p>
    </form>
  );
}
