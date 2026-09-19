import type { Metadata } from "next";
import Link from "next/link";
import { LuBellOff, LuBellRing, LuCircleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

export const metadata: Metadata = {
  title: "Weekly summary email",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Public, login-free page behind the link in every weekly summary email. It
 * asks before changing anything (so a mail scanner opening the link cannot
 * unsubscribe someone) and lets them turn the email back on. Only the weekly
 * summary is optional: welcome and commission emails are not affected.
 */
export default async function WeeklyUnsubscribePage({
  searchParams,
}: {
  searchParams: { t?: string; done?: string };
}) {
  const token = searchParams.t ?? "";
  const id = verifyUnsubscribeToken(token);
  const ambassador = id
    ? await db.ambassador.findUnique({
        where: { id },
        select: { fullName: true, weeklyEmailOptOut: true },
      })
    : null;

  if (!ambassador) {
    return (
      <Shell icon={<LuCircleAlert className="size-8" aria-hidden />} tone="danger" title="This link is not valid">
        <p>
          It may have been copied incompletely. You can change this any time from your ambassador profile, or
          reply to the email and we will do it for you.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </Shell>
    );
  }

  const first = ambassador.fullName.trim().split(/\s+/)[0] || "there";
  const optedOut = ambassador.weeklyEmailOptOut;
  const justResubscribed = searchParams.done === "resubscribed" && !optedOut;

  if (optedOut) {
    return (
      <Shell icon={<LuBellOff className="size-8" aria-hidden />} tone="muted" title="You are unsubscribed">
        <p>
          {first}, we will not send you the weekly summary any more. You will still get emails about your
          approval and commission, since those are about your account.
        </p>
        <TokenForm token={token} action="resubscribe">
          <Button type="submit" variant="outline" className="mt-6">
            Turn the weekly summary back on
          </Button>
        </TokenForm>
      </Shell>
    );
  }

  if (justResubscribed) {
    return (
      <Shell icon={<LuBellRing className="size-8" aria-hidden />} tone="success" title="The weekly summary is back on">
        <p>You will get it again every Monday morning. You can turn it off any time from the link in the email.</p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/ambassador">Open my dashboard</Link>
        </Button>
      </Shell>
    );
  }

  return (
    <Shell icon={<LuBellOff className="size-8" aria-hidden />} tone="muted" title="Stop the weekly summary?">
      <p>
        {first}, this email shows how your link did last week, every Monday. If you would rather not get it,
        confirm below. Your dashboard and leaderboard are not affected, and emails about your approval and
        commission will still reach you.
      </p>
      <TokenForm token={token} action="unsubscribe">
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button type="submit" size="lg">
            Yes, stop the weekly summary
          </Button>
          <Button asChild variant="ghost">
            <Link href="/ambassador">Keep it</Link>
          </Button>
        </div>
      </TokenForm>
    </Shell>
  );
}

function TokenForm({
  token,
  action,
  children,
}: {
  token: string;
  action: "unsubscribe" | "resubscribe";
  children: React.ReactNode;
}) {
  return (
    <form method="post" action="/api/unsubscribe/weekly">
      <input type="hidden" name="t" value={token} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="from" value="page" />
      {children}
    </form>
  );
}

function Shell({
  icon,
  tone,
  title,
  children,
}: {
  icon: React.ReactNode;
  tone: "success" | "danger" | "muted";
  title: string;
  children: React.ReactNode;
}) {
  const bubble = tone === "success" ? "bg-success/15 text-success" : tone === "danger" ? "bg-danger/15 text-danger" : "bg-zone text-muted-foreground";
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center sm:py-24">
      <span className={`rounded-full p-3 ${bubble}`}>{icon}</span>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
      <div className="mt-2 max-w-prose text-muted-foreground [&_p]:leading-relaxed">{children}</div>
    </div>
  );
}
