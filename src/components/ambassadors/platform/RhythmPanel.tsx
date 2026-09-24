"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert, LuClock, LuCopy, LuLoaderCircle, LuLock, LuStar } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import type { Spotlight } from "@/lib/services/ambassador-platform/dashboard";
import type { WeekRhythm, RhythmDay } from "@/lib/services/ambassador-platform/content";
import { TierBadge } from "@/components/ambassadors/TierBadge";
import { cn, formatDate } from "@/lib/utils";

/**
 * THIS WEEK'S RHYTHM — Monday content drop, Wednesday check-in, Friday
 * spotlight — with a one-tap "Done" that writes the content log, and the
 * Friday spotlight suggestion (top ambassador of the week) with its
 * copy-ready WhatsApp message.
 */
export function RhythmPanel({ rhythm, spotlight }: { rhythm: WeekRhythm; spotlight: Spotlight | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function markDone(day: RhythmDay) {
    setBusy(day.type);
    setError(null);
    try {
      const res = await fetch("/api/admin/ambassadors/content-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentType: day.type }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not log it.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log it.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <aside className="space-y-6">
      <section aria-labelledby="rhythm-heading" className="rounded-2xl bg-zone p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="rhythm-heading" className="text-[15px] font-semibold text-foreground">
            This week&apos;s rhythm
          </h2>
          <span className="font-mono text-xs text-muted-foreground">{rhythm.label}</span>
        </div>
        <ul className="mt-3 space-y-3">
          {rhythm.days.map((d) => (
            <li key={d.type} className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm text-foreground">
                  <span className="font-medium">{d.day}</span> — {d.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  <State day={d} />
                </span>
              </span>
              {d.state === "DONE" ? (
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success" aria-label="Done">
                  <LuCheck className="size-4" aria-hidden />
                </span>
              ) : d.type === "FRIDAY_SPOTLIGHT" ? (
                // The winner is picked (and the post logged) on the leaderboard, next to the rankings.
                <Button asChild size="sm" variant={d.state === "DUE_TODAY" || d.state === "MISSED" ? "default" : "outline"}>
                  <Link href="/admin/ambassadors/leaderboard?view=week#spotlight">{d.action}</Link>
                </Button>
              ) : (
                <Button type="button" size="sm" variant={d.state === "DUE_TODAY" || d.state === "MISSED" ? "default" : "outline"} disabled={busy != null} onClick={() => markDone(d)}>
                  {busy === d.type ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                  {d.action}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {error ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-danger" role="alert">
            <LuCircleAlert className="size-4" aria-hidden />
            {error}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="spotlight-heading" className="rounded-2xl bg-zone p-5">
        <h2 id="spotlight-heading" className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
          <LuStar className="size-4 text-gold" aria-hidden />
          Friday spotlight suggestion
        </h2>
        {!spotlight ? (
          <p className="mt-2 text-sm text-muted-foreground">No referrals logged this week yet — the top ambassador of the week appears here.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-foreground">
              <Link href={`/admin/ambassadors/${spotlight.ambassadorId}`} className="font-medium hover:text-primary">
                {spotlight.fullName}
              </Link>{" "}
              — {spotlight.thisWeek} conversion{spotlight.thisWeek === 1 ? "" : "s"} this week
              {spotlight.lastWeek > 0 || spotlight.thisWeek > 0 ? <span className="text-muted-foreground"> ({delta(spotlight.thisWeek, spotlight.lastWeek)} from last week)</span> : null}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {spotlight.school ? <span>School: {spotlight.school}</span> : null}
              <TierBadge tier={spotlight.tier} />
            </p>
            <blockquote className="mt-3 rounded-xl bg-card p-3 text-sm text-foreground shadow-soft">{spotlight.message}</blockquote>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(spotlight.message);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                <LuCopy className="size-4" aria-hidden />
                {copied ? "Copied" : "Copy message"}
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/admin/ambassadors/leaderboard">Pick a different ambassador</Link>
              </Button>
            </div>
          </>
        )}
      </section>
    </aside>
  );
}

function delta(now: number, before: number): string {
  const d = now - before;
  return d > 0 ? `up ${d}` : d < 0 ? `down ${Math.abs(d)}` : "same";
}

function State({ day }: { day: RhythmDay }) {
  if (day.state === "DONE") return <span className="text-success">Done{day.postedAt ? ` · ${formatDate(day.postedAt)}` : ""}</span>;
  if (day.state === "DUE_TODAY")
    return (
      <span className="inline-flex items-center gap-1 text-gold">
        <LuClock className="size-3" aria-hidden />
        Due today
      </span>
    );
  if (day.state === "MISSED") return <span className="text-danger">Not logged — {formatDate(day.date)}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1")}>
      <LuLock className="size-3" aria-hidden />
      Upcoming · {formatDate(day.date)}
    </span>
  );
}
