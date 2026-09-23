"use client";

import * as React from "react";
import Link from "next/link";
import { LuArrowRight, LuLoaderCircle, LuLogOut, LuUserRound } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { signOutAndClear } from "@/lib/pwa/sign-out";

/**
 * Shown ABOVE the sign-in form when this browser already holds a session, so
 * nobody signs in on top of someone else's session by mistake.
 *
 * It never replaces the form: signing in with different details simply replaces
 * the session. (While it did replace the form, a stale or unwanted session left
 * the page with no way in at all — it read as "login is broken".) Sign out is
 * still offered, because only that clears the device too (saved pages, phone
 * notifications), so nothing of one person stays with the next.
 */
export function SignedInNotice({ email, roleLabel }: { email: string; roleLabel: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="mb-7 space-y-4 rounded-2xl bg-zone p-4">
      <div className="flex items-start gap-3">
        <LuUserRound className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p className="text-sm text-foreground">
          This device is signed in as <strong className="font-semibold [overflow-wrap:anywhere]">{email}</strong>{" "}
          <span className="text-muted-foreground">({roleLabel})</span>. Sign in below to switch accounts, or carry on
          where you left off.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg" className="flex-1">
          <Link href="/dashboard">
            Go to my dashboard
            <LuArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="flex-1"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void signOutAndClear();
          }}
        >
          {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuLogOut className="size-4" aria-hidden />}
          Sign out
        </Button>
      </div>
    </div>
  );
}
