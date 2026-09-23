"use client";

import * as React from "react";
import Link from "next/link";
import { LuArrowRight, LuLoaderCircle, LuLogOut, LuUserRound } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { signOutAndClear } from "@/lib/pwa/sign-out";

/**
 * Shown on a sign-in page when this browser is already signed in. Signing in
 * as someone else first needs a sign-out, which also clears the device (saved
 * pages, phone notifications) so nothing of one person stays with the next.
 */
export function SignedInNotice({ email, roleLabel }: { email: string; roleLabel: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl bg-zone p-4">
        <LuUserRound className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p className="text-sm text-foreground">
          You&apos;re already signed in as <strong className="font-semibold">{email}</strong>{" "}
          <span className="text-muted-foreground">({roleLabel})</span>. To use a different account, sign out first.
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
