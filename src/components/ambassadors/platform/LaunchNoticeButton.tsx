"use client";

import * as React from "react";
import { LuBell, LuBellOff, LuCheck, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";

/** "Notify me when this launches" — saves this person's preference. */
export function LaunchNoticeButton({ initial }: { initial: boolean }) {
  const [subscribed, setSubscribed] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ambassadors/growth-associates/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscribe: !subscribed }) });
      const body = (await res.json().catch(() => null)) as { subscribed?: boolean; error?: string } | null;
      if (!res.ok || typeof body?.subscribed !== "boolean") throw new Error(body?.error ?? "Could not save that.");
      setSubscribed(body.subscribed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {subscribed ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-sm text-success">
            <LuCheck className="size-4" aria-hidden />
            You&apos;ll be told when Growth Associates launch
          </span>
          <Button type="button" size="sm" variant="ghost" onClick={toggle} disabled={busy}>
            {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuBellOff className="size-4" aria-hidden />}
            Don&apos;t notify me
          </Button>
        </>
      ) : (
        <Button type="button" onClick={toggle} disabled={busy}>
          {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuBell className="size-4" aria-hidden />}
          Notify me when this launches
        </Button>
      )}
      {error ? <span className="text-sm text-danger">{error}</span> : null}
    </div>
  );
}
