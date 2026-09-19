"use client";

import * as React from "react";
import { LuCircleAlert } from "react-icons/lu";
import { cn } from "@/lib/utils";

/**
 * On/off switch for the Monday summary email, on the ambassador's own profile.
 * Only this email is optional; account emails (approval, commission) are not
 * affected, and the copy says so.
 */
export function WeeklyEmailToggle({
  initialOn,
  hasEmail,
}: {
  initialOn: boolean;
  hasEmail: boolean;
}) {
  const [on, setOn] = React.useState(initialOn);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function toggle() {
    const next = !on;
    setOn(next); // optimistic; rolled back below if the save fails
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ambassador/profile/email-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeklyEmail: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not save.");
      }
    } catch (e) {
      setOn(!next);
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id="weekly-email-label" className="text-sm font-medium text-foreground">
            Weekly summary email
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Every Monday morning: last week&apos;s clicks, your top country and device, and your leaderboard
            position. Emails about your approval and commission are not affected.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="weekly-email-label"
          disabled={busy}
          onClick={toggle}
          className={cn(
            "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60",
            on ? "bg-primary" : "bg-border"
          )}
        >
          <span
            className={cn(
              "inline-block size-5 rounded-full bg-white shadow transition-transform",
              on ? "translate-x-6" : "translate-x-1"
            )}
          />
          <span className="sr-only">{on ? "On" : "Off"}</span>
        </button>
      </div>
      {!hasEmail ? (
        <p className="mt-2 text-xs text-gold">You have no email on file, so nothing can be sent yet. Ask an admin to add one.</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-danger">
          <LuCircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
