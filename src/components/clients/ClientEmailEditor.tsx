"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { realEmail } from "@/lib/client-email";

/**
 * The client's sign-in email: shows whether a code can be sent, and lets an admin
 * set or fix it (a mistyped intake address otherwise locks the client out).
 */
export function ClientEmailEditor({ clientId, email }: { clientId: string; email: string | null }) {
  const router = useRouter();
  const usable = realEmail(email);
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(usable ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/email`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not save the email.");
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the email.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {usable ? (
            <a href={`mailto:${usable}`} className="break-all hover:text-primary">
              {usable}
            </a>
          ) : (
            <span className="text-subtle">{email ? "Placeholder, no real email" : "Not provided"}</span>
          )}
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
            {usable ? "Change" : "Add email"}
          </button>
        </div>
        <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
          {usable ? (
            <>
              <LuCheck className="size-3.5 text-success" aria-hidden /> Can sign in
            </>
          ) : (
            <>
              <LuCircleAlert className="size-3.5 text-gold" aria-hidden /> Cannot sign in until an email is added
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        type="email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="client@example.com"
        aria-label="Client sign-in email"
        autoComplete="off"
      />
      {error ? (
        <p role="alert" className="inline-flex items-center gap-1 text-xs text-danger">
          <LuCircleAlert className="size-3.5" aria-hidden /> {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving || !value.trim()}>
          {saving ? "Saving…" : "Save email"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setError(null);
            setValue(usable ?? "");
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
