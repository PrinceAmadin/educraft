"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert, LuCopy, LuLoaderCircle, LuMegaphone, LuStar } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { TierBadge } from "@/components/ambassadors/TierBadge";
import { spotlightMessage } from "@/lib/ambassadors/spotlight";
import type { SpotlightCandidate } from "@/lib/services/ambassador-platform/leaderboard";

/**
 * FRIDAY SPOTLIGHT SUGGESTION: the week's top ambassador with a copy-ready
 * message. The HOG may pick someone else (the message follows), copy it for
 * WhatsApp, and log it as this week's Friday post.
 */
export function SpotlightPicker({ topId, candidates, weekLabel, logged }: { topId: string | null; candidates: SpotlightCandidate[]; weekLabel: string; logged: { note: string | null; postedAt: string } | null }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState<string>(topId ?? candidates[0]?.ambassadorId ?? "");
  const [copied, setCopied] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const selected = candidates.find((c) => c.ambassadorId === selectedId) ?? null;
  const message = selected ? spotlightMessage(selected) : "";
  const overridden = Boolean(topId && selectedId && selectedId !== topId);

  async function logPosted() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ambassadors/content-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentType: "FRIDAY_SPOTLIGHT", note: `Spotlight: ${selected.fullName}` }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not log it.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="spotlight" aria-labelledby="spotlight-heading" className="rounded-2xl bg-zone p-5">
      <h2 id="spotlight-heading" className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
        <LuStar className="size-4 text-gold" aria-hidden />
        Friday spotlight suggestion
      </h2>
      <p className="mt-0.5 font-mono text-xs text-muted-foreground">{weekLabel}</p>

      {candidates.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No referrals or conversions this week or month yet. The week&apos;s top ambassador appears here.</p>
      ) : (
        <>
          <label className="mt-3 block">
            <span className="mb-1 block meta-label">{overridden ? "Your pick (overriding the suggestion)" : "Top ambassador this week"}</span>
            <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="h-11 text-sm" aria-label="Spotlight ambassador">
              {candidates.map((c) => (
                <option key={c.ambassadorId} value={c.ambassadorId}>
                  {c.fullName} · {c.thisWeek} this week{c.ambassadorId === topId ? " (suggested)" : ""}
                </option>
              ))}
            </Select>
          </label>
          {selected ? (
            <>
              <p className="mt-3 text-sm text-foreground">
                <Link href={`/admin/ambassadors/${selected.ambassadorId}`} className="font-medium hover:text-primary">
                  {selected.fullName}
                </Link>{" "}
                — {selected.thisWeek} conversion{selected.thisWeek === 1 ? "" : "s"} this week
                <span className="text-muted-foreground"> ({trend(selected.thisWeek, selected.lastWeek)} from last week)</span>
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {selected.school ? <span>School: {selected.school}</span> : null}
                <TierBadge tier={selected.tier} />
                <span>{selected.thisMonth} this month</span>
              </p>
              <blockquote className="mt-3 whitespace-pre-line rounded-xl bg-card p-3 text-sm text-foreground shadow-soft">{message}</blockquote>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(message);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      setCopied(false);
                    }
                  }}
                >
                  {copied ? <LuCheck className="size-4" aria-hidden /> : <LuCopy className="size-4" aria-hidden />}
                  {copied ? "Copied" : "Copy message"}
                </Button>
                <Button type="button" size="sm" onClick={logPosted} disabled={busy}>
                  {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuMegaphone className="size-4" aria-hidden />}
                  {logged ? "Log again" : "Log as this week's spotlight"}
                </Button>
              </div>
            </>
          ) : null}
        </>
      )}
      {logged ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-success">
          <LuCheck className="size-3.5" aria-hidden />
          Posted this week{logged.note ? ` — ${logged.note}` : ""}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-danger" role="alert">
          <LuCircleAlert className="size-4" aria-hidden />
          {error}
        </p>
      ) : null}
    </section>
  );
}

function trend(now: number, before: number): string {
  const d = now - before;
  return d > 0 ? `up ${d}` : d < 0 ? `down ${Math.abs(d)}` : "same";
}

/** Copies any prepared text (the leaderboard message). */
export function CopyTextButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <LuCheck className="size-4" aria-hidden /> : <LuCopy className="size-4" aria-hidden />}
      {copied ? "Copied" : label}
    </Button>
  );
}
