"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/Field";

export function AmbassadorBankForm({
  initial,
}: {
  initial: { bankName: string | null; accountNumber: string | null; accountName: string | null };
}) {
  const router = useRouter();
  const [bankName, setBankName] = React.useState(initial.bankName ?? "");
  const [accountNumber, setAccountNumber] = React.useState(initial.accountNumber ?? "");
  const [accountName, setAccountName] = React.useState(initial.accountName ?? "");
  const [saving, setSaving] = React.useState(false);
  const [state, setState] = React.useState<"idle" | "saved" | "error">("idle");
  const [message, setMessage] = React.useState<string | null>(null);

  const dirty =
    bankName !== (initial.bankName ?? "") ||
    accountNumber !== (initial.accountNumber ?? "") ||
    accountName !== (initial.accountName ?? "");

  async function save() {
    setSaving(true);
    setState("idle");
    setMessage(null);
    try {
      const res = await fetch("/api/ambassador/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankName, accountNumber, accountName }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not save.");
      }
      setState("saved");
      router.refresh();
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Bank name" htmlFor="a-bank">
          <Input id="a-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} />
        </Field>
        <Field label="Account number" htmlFor="a-acct">
          <Input
            id="a-acct"
            inputMode="numeric"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
          />
        </Field>
        <Field label="Account name" htmlFor="a-acctname">
          <Input
            id="a-acctname"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save bank details"}
        </Button>
        {state === "saved" && !dirty ? (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <LuCheck className="size-3.5" aria-hidden />
            Saved — finance notified
          </span>
        ) : null}
        {state === "error" ? (
          <span className="inline-flex items-center gap-1 text-xs text-danger">
            <LuCircleAlert className="size-3.5" aria-hidden />
            {message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
