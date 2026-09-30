"use client";

import * as React from "react";
import { LuCircleAlert, LuLoaderCircle, LuUserMinus, LuUserPlus } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FlaggerRow } from "@/lib/services/project-cleanup";
import { formatDate } from "@/lib/utils";

/**
 * Who may flag a project as a test. The COO always may (by role); the founder
 * appoints anyone else by their login email, worker ID or ambassador ID, and
 * removing them takes effect on their next request.
 */
export function FlaggersSection({ initial }: { initial: FlaggerRow[] }) {
  const [flaggers, setFlaggers] = React.useState(initial);
  const [identifier, setIdentifier] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  async function call(method: "POST" | "DELETE", payload: object, key: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/cleanup/flaggers", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as { flaggers?: FlaggerRow[]; name?: string; error?: string } | null;
      if (!res.ok || !body?.flaggers) throw new Error(body?.error ?? "That could not be saved.");
      setFlaggers(body.flaggers);
      if (method === "POST") {
        setIdentifier("");
        setNotice(`${body.name ?? "They"} can now flag test projects.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "That could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <ul>
        {flaggers.map((f) => (
          <li key={f.userId} className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 py-3 first:border-t-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{f.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {f.email} · {f.byRole ? "COO, always" : `appointed ${formatDate(f.appointedAt)}`}
              </p>
            </div>
            {f.byRole ? null : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => call("DELETE", { userId: f.userId }, f.userId)}
              >
                {busy === f.userId ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuUserMinus className="size-4" aria-hidden />}
                Remove
              </Button>
            )}
          </li>
        ))}
        {flaggers.length === 0 ? <li className="py-3 text-sm text-muted-foreground">No COO login is active yet, and nobody is appointed.</li> : null}
      </ul>

      <form
        className="space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (identifier.trim()) void call("POST", { identifier }, "add");
        }}
      >
        <Label htmlFor="flagger-identifier">Add someone</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="flagger-identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Email, ECW-0003 or EC-A-00030"
            autoComplete="off"
            className="sm:max-w-sm"
          />
          <Button type="submit" variant="outline" disabled={busy !== null || !identifier.trim()}>
            {busy === "add" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuUserPlus className="size-4" aria-hidden />}
            Appoint
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">They flag from a project&apos;s page or with &quot;Flag a test project&quot; in their account menu.</p>
      </form>

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
