"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert, LuInfo, LuLock } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/Field";
import { NAME_CHANGE_TEXT } from "@/lib/ambassadors/name-change";
import { formatDate } from "@/lib/utils";

export interface NameFormState {
  fullName: string;
  canChange: boolean;
  /** Why the window is shut, already written for them. null while it is open. */
  cooldownMessage: string | null;
  bankNudge: string | null;
  history: { oldName: string; newName: string; createdAt: string }[];
}

/**
 * The ambassador correcting their own name. The reassurance about the referral
 * code is not decoration: it is the whole reason this is safe to self-serve, and
 * it is the first thing an ambassador worries about.
 */
export function AmbassadorNameForm({ initial }: { initial: NameFormState }) {
  const router = useRouter();
  const [fullName, setFullName] = React.useState(initial.fullName);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [bankNudge, setBankNudge] = React.useState(initial.bankNudge);

  const dirty = fullName.trim() !== initial.fullName;
  const locked = !initial.canChange;

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/ambassador/profile/name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName }),
      });
      const data = (await res.json().catch(() => null)) as
        | { fullName?: string; bankNudge?: string | null; error?: string }
        | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not save your name.");
      // Show what was actually STORED, not what was typed: the server trims and
      // title-cases a name typed in capitals, and leaving the typed version in
      // the box makes a saved change look unsaved until the page is reloaded.
      if (data?.fullName) setFullName(data.fullName);
      setSaved(true);
      setBankNudge(data?.bankNudge ?? null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your name.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">{NAME_CHANGE_TEXT.help}</p>

      <div className="max-w-md">
        <Field label="Full name" htmlFor="a-name">
          <Input
            id="a-name"
            value={fullName}
            disabled={locked || saving}
            autoComplete="name"
            onChange={(e) => {
              setFullName(e.target.value);
              setError(null);
              setSaved(false);
            }}
          />
        </Field>
      </div>

      {/* A save spends the 30-day allowance, so the control locks the instant it
          succeeds. The confirmation is therefore rendered on its own, outside
          this branch, or it would vanish at the very moment it is earned. */}
      {locked ? (
        <p className="inline-flex items-start gap-2 text-xs text-muted-foreground">
          <LuLock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {initial.cooldownMessage} {NAME_CHANGE_TEXT.cooldownHelp}
          </span>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={save} disabled={saving || !dirty}>
            {saving ? NAME_CHANGE_TEXT.saving : NAME_CHANGE_TEXT.save}
          </Button>
          {error ? (
            <span className="inline-flex items-start gap-1 text-xs text-danger">
              <LuCircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {error}
            </span>
          ) : null}
        </div>
      )}

      {saved ? (
        <p className="inline-flex items-center gap-1 text-xs text-success">
          <LuCheck className="size-3.5" aria-hidden />
          {NAME_CHANGE_TEXT.saved}
        </p>
      ) : null}

      <div className="bg-zone rounded-lg p-3">
        <p className="inline-flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <LuInfo className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{NAME_CHANGE_TEXT.codeFrozen}</span>
        </p>
      </div>

      {bankNudge ? (
        <p className="inline-flex items-start gap-2 text-xs leading-relaxed text-gold">
          <LuCircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{bankNudge}</span>
        </p>
      ) : null}

      {initial.history.length > 0 ? (
        <dl className="border-border space-y-1 border-t pt-3 text-xs text-muted-foreground">
          {initial.history.map((h) => (
            <div key={`${h.createdAt}-${h.oldName}`} className="flex flex-wrap gap-x-2">
              <dt>{NAME_CHANGE_TEXT.formerly(h.oldName)}</dt>
              <dd>{formatDate(h.createdAt)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
