"use client";

import * as React from "react";
import { LuCircleCheck, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/forms/Field";
import { FormSection } from "@/components/forms/FormSection";
import { FormProgress } from "@/components/intake/FormProgress";
import { Notice } from "@/components/ambassador-panel/shared";

const NIGERIAN_BANKS = [
  "Access Bank",
  "Citibank Nigeria",
  "Coronation Merchant Bank",
  "Ecobank Nigeria",
  "FBNQuest Merchant Bank",
  "Fidelity Bank",
  "First Bank of Nigeria",
  "First City Monument Bank (FCMB)",
  "Globus Bank",
  "Greenwich Merchant Bank",
  "Guaranty Trust Bank (GTBank)",
  "Jaiz Bank",
  "Keystone Bank",
  "Kuda Bank",
  "Moniepoint Microfinance Bank",
  "Nova Merchant Bank",
  "Opay",
  "PalmPay",
  "Parallex Bank",
  "Polaris Bank",
  "PremiumTrust Bank",
  "Providus Bank",
  "Rand Merchant Bank",
  "Rubies Microfinance Bank",
  "Stanbic IBTC Bank",
  "Standard Chartered Bank Nigeria",
  "Sterling Bank",
  "SunTrust Bank Nigeria",
  "TAJ Bank",
  "Titan Trust Bank",
  "Union Bank of Nigeria",
  "United Bank for Africa (UBA)",
  "Unity Bank",
  "VFD Microfinance Bank",
  "Wema Bank",
  "Zenith Bank",
];
const OTHER_BANK = "__other__";

const STEPS = [
  { id: "personal", label: "Personal details" },
  { id: "payment", label: "Payment information" },
  { id: "review", label: "Review and agree" },
];

const EMPTY = {
  slotId: "",
  fullName: "",
  universityFull: "",
  universityAbbr: "",
  email: "",
  phone: "",
  bankName: "",
  accountNumber: "",
  accountName: "",
  agreedToTerms: false,
};

/**
 * The original three-step ambassador application (new recruits, with bank
 * details for commission). The slot is assigned automatically on load.
 */
export function PanelApplyForm() {
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState(EMPTY);
  const [bankChoice, setBankChoice] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/ambassador-panel/admin?action=get-next-slot")
      .then((r) => r.json())
      .then((d: { slotId?: string }) => {
        if (d.slotId) setForm((p) => ({ ...p, slotId: d.slotId as string }));
      })
      .catch(() => {});
  }, []);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  function validate(s: number): string | null {
    if (s === 0) {
      if (!form.fullName.trim()) return "Please enter your full name.";
      if (!form.universityFull.trim()) return "Please enter your university's full name.";
      if (!form.universityAbbr.trim()) return "Please enter your university abbreviation.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Please enter a valid email address.";
      if (form.phone.replace(/\D/g, "").length < 10) return "Please enter a valid phone number (at least 10 digits).";
    }
    if (s === 1) {
      if (!form.bankName.trim()) return "Please choose your bank.";
      if (form.accountNumber.replace(/\D/g, "").length < 10) return "Account number must be at least 10 digits.";
      if (!form.accountName.trim()) return "Please enter your account name.";
    }
    if (s === 2 && !form.agreedToTerms) return "You must agree to the terms to submit your application.";
    return null;
  }

  async function submit() {
    const err = validate(2);
    if (err) return setError(err);
    if (!form.slotId) return setError("We couldn't assign a slot. Refresh the page and try again.");
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/ambassador-panel/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, agreedToTerms: form.agreedToTerms ? "true" : "false" }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "Submission failed. Please try again.");
      setStatus("done");
    } catch (e) {
      setStatus("idle");
      setError(e instanceof Error ? e.message : "Submission failed. Please try again.");
    }
  }

  if (status === "done") {
    return (
      <div className="space-y-5">
        <LuCircleCheck className="size-8 text-success" aria-hidden />
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Application submitted</h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Your application for <span className="font-mono text-foreground">EduCraftA-{form.slotId}</span> has been received. The
          EduCraft team will review it and respond within 24–48 hours.
        </p>
        <ol className="space-y-2 rounded-2xl bg-zone p-5 text-sm text-foreground">
          <li>1. We review your application.</li>
          <li>2. If approved, you get a welcome email with your referral link.</li>
          <li>3. If not, we tell you why.</li>
        </ol>
      </div>
    );
  }

  return (
    <div className="space-y-9">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zone px-5 py-4">
        <span className="text-sm text-muted-foreground">Your assigned slot</span>
        <span className="font-mono text-base font-medium text-foreground">EduCraftA-{form.slotId || "…"}</span>
      </div>

      <FormProgress steps={STEPS} current={step} />

      {step === 0 ? (
        <FormSection title="Personal details">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Full name" required htmlFor="ap-name" hint="As it appears on your ID" className="sm:col-span-2">
              <Input id="ap-name" value={form.fullName} onChange={set("fullName")} autoComplete="name" />
            </Field>
            <Field label="University (full name)" required htmlFor="ap-uni">
              <Input id="ap-uni" value={form.universityFull} onChange={set("universityFull")} placeholder="University of Benin" />
            </Field>
            <Field label="University abbreviation" required htmlFor="ap-abbr" hint="Used on your ambassador link">
              <Input id="ap-abbr" value={form.universityAbbr} onChange={set("universityAbbr")} placeholder="UNIBEN" />
            </Field>
            <Field label="Email address" required htmlFor="ap-email" hint="Commission notifications are sent here">
              <Input id="ap-email" type="email" inputMode="email" value={form.email} onChange={set("email")} autoComplete="email" />
            </Field>
            <Field label="Phone number" required htmlFor="ap-phone">
              <Input id="ap-phone" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="08012345678" autoComplete="tel" />
            </Field>
          </div>
        </FormSection>
      ) : null}

      {step === 1 ? (
        <FormSection title="Payment information" description="Used to pay your commission. It must match your bank records exactly.">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Bank" required htmlFor="ap-bank" className="sm:col-span-2">
              <Select
                id="ap-bank"
                value={bankChoice}
                onChange={(e) => {
                  const v = e.target.value;
                  setBankChoice(v);
                  setForm((p) => ({ ...p, bankName: v === OTHER_BANK ? "" : v }));
                }}
              >
                <option value="">Choose your bank</option>
                {NIGERIAN_BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
                <option value={OTHER_BANK}>My bank isn&apos;t listed</option>
              </Select>
            </Field>
            {bankChoice === OTHER_BANK ? (
              <Field label="Bank name" required htmlFor="ap-bank-other" className="sm:col-span-2">
                <Input id="ap-bank-other" value={form.bankName} onChange={set("bankName")} autoFocus />
              </Field>
            ) : null}
            <Field label="Account number" required htmlFor="ap-acct">
              <Input id="ap-acct" inputMode="numeric" maxLength={10} value={form.accountNumber} onChange={set("accountNumber")} className="font-mono" />
            </Field>
            <Field label="Account name" required htmlFor="ap-acct-name" hint="Exactly as on your bank account">
              <Input id="ap-acct-name" value={form.accountName} onChange={set("accountName")} />
            </Field>
          </div>
        </FormSection>
      ) : null}

      {step === 2 ? (
        <FormSection title="Review and agree">
          <dl className="divide-y divide-border/80 text-sm">
            {[
              ["Slot", `EduCraftA-${form.slotId}`],
              ["Full name", form.fullName],
              ["University", `${form.universityFull} (${form.universityAbbr})`],
              ["Email", form.email],
              ["Phone", form.phone],
              ["Bank", form.bankName],
              ["Account number", form.accountNumber],
              ["Account name", form.accountName],
            ].map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className={k === "Account number" || k === "Slot" ? "text-right font-mono text-foreground" : "max-w-[60%] text-right text-foreground"}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>

          <div className="rounded-2xl bg-zone p-5 text-sm leading-relaxed text-foreground">
            <p className="font-semibold">EduCraft Ambassador terms</p>
            <p className="mt-2 text-muted-foreground">By joining the EduCraft Ambassador Programme, you agree to:</p>
            <ol className="mt-2 space-y-1 text-muted-foreground">
              <li>1. Represent EduCraft professionally and accurately to all potential clients.</li>
              <li>2. Earn a 10% commission on every confirmed order placed through your referral link.</li>
              <li>3. Commission is paid after the client&apos;s order is completed and payment is received by EduCraft.</li>
              <li>4. Never misrepresent EduCraft services or pricing to clients.</li>
              <li>5. EduCraft may deactivate your ambassador account if these terms are broken.</li>
              <li>6. Payment is made to the bank account provided in this application.</li>
              <li>7. You confirm that all details provided are accurate and belong to you.</li>
            </ol>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl p-1 text-sm">
            <input
              type="checkbox"
              checked={form.agreedToTerms}
              onChange={(e) => setForm((p) => ({ ...p, agreedToTerms: e.target.checked }))}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="text-foreground">
              I have read and agree to the EduCraft Ambassador terms. The information I&apos;ve given is accurate and I
              understand the commission structure.
            </span>
          </label>
        </FormSection>
      ) : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          disabled={step === 0 || status === "loading"}
          onClick={() => {
            setError(null);
            setStep((s) => Math.max(0, s - 1));
          }}
        >
          Back
        </Button>
        {step < 2 ? (
          <Button
            type="button"
            onClick={() => {
              const err = validate(step);
              if (err) return setError(err);
              setError(null);
              setStep((s) => s + 1);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            Continue
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={status === "loading" || !form.agreedToTerms}>
            {status === "loading" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
            {status === "loading" ? "Submitting…" : "Submit application"}
          </Button>
        )}
      </div>
    </div>
  );
}
