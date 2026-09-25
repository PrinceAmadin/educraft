"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle, LuUserMinus, LuUserPlus, LuUsers } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TierBadge } from "@/components/ambassadors/TierBadge";
import { ActivityBadge } from "@/components/ambassadors/platform/ActivityBadge";
import { MAX_SUB_AMBASSADORS } from "@/lib/commission";
import { percentLabel, subTeamThresholdLabel, tierLabel } from "@/lib/ambassadors/tier-utils";
import { COMMISSION_RATES } from "@/lib/finance/commission-config";
import type { DirectoryDetail } from "@/lib/services/ambassador-platform/directory";
import type { AmbassadorTier } from "@prisma/client";

export interface SubCandidate {
  id: string;
  ambassadorId: string;
  fullName: string;
  tier: AmbassadorTier;
}

/**
 * "SUB-AMBASSADOR TEAM (3 Subs)" on the detail page: the Core's subs, an
 * Add Sub-ambassador picker (existing solo ambassadors), remove per row,
 * and the slots left out of ten. A Bronze Core sees why the button is off.
 */
export function SubTeam({ coreId, coreName, coreTier, subTeam, canHaveSubs, slotsLeft, candidates }: { coreId: string; coreName: string; coreTier: AmbassadorTier; subTeam: DirectoryDetail["subTeam"]; canHaveSubs: boolean; slotsLeft: number; candidates: SubCandidate[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function add(subId: string) {
    setBusy(subId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ambassadors/${coreId}/add-sub`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subId }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not add them.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add them.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(subId: string, name: string) {
    if (!window.confirm(`Remove ${name} from ${coreName}'s team? Past commission is kept; future jobs stop paying the Core override.`)) return;
    setBusy(subId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ambassadors/${coreId}/remove-sub/${subId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not remove them.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove them.");
    } finally {
      setBusy(null);
    }
  }

  const needle = query.trim().toLowerCase();
  const options = needle ? candidates.filter((c) => [c.fullName, c.ambassadorId].some((v) => v.toLowerCase().includes(needle))) : candidates;

  return (
    <section className="surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <LuUsers className="size-4 text-muted-foreground" aria-hidden />
          Sub-ambassador team
          <span className="font-mono text-xs text-muted-foreground">
            {subTeam.length} Sub{subTeam.length === 1 ? "" : "s"}
          </span>
        </h2>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} disabled={!canHaveSubs || slotsLeft === 0}>
          <LuUserPlus className="size-4" aria-hidden />
          Add Sub-ambassador
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {!canHaveSubs
          ? `${tierLabel(coreTier)} cannot lead a team yet — a Core activates their sub-team at ${subTeamThresholdLabel()}.`
          : slotsLeft === 0
            ? `Team is full — the maximum is ${MAX_SUB_AMBASSADORS}.`
            : `${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} remaining — max ${MAX_SUB_AMBASSADORS}. EduCraft pays ${percentLabel(COMMISSION_RATES.ambassador)} in total: the Sub earns their tier rate, the Core the rest.`}
      </p>
      {error ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-danger" role="alert">
          <LuCircleAlert className="size-4" aria-hidden />
          {error}
        </p>
      ) : null}
      {subTeam.length > 0 ? (
        <ul className="mt-2 divide-y divide-border/80">
          {subTeam.map((s) => (
            <li key={s.id} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
              <Link href={`/admin/ambassadors/${s.id}`} className="min-w-0 flex-1 basis-40 hover:text-primary focus-visible:outline-none focus-visible:underline">
                <span className="block truncate text-sm text-foreground">{s.fullName}</span>
                <span className="block font-mono text-xs text-muted-foreground">{s.ambassadorId}</span>
              </Link>
              <Button type="button" size="icon-sm" variant="ghost" className="sm:order-last" aria-label={`Remove ${s.fullName} from the team`} disabled={busy === s.id} onClick={() => remove(s.id, s.fullName)}>
                {busy === s.id ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuUserMinus className="size-4" aria-hidden />}
              </Button>
              <span className="flex basis-full items-center gap-2 sm:basis-auto">
                <TierBadge tier={s.tier} />
                <ActivityBadge status={s.activity} />
                <span className="ml-auto font-mono text-sm tabular-nums text-foreground sm:ml-0 sm:w-16 sm:text-right">
                  {s.lifetimeConversions} conv{s.lifetimeConversions === 1 ? "" : "s"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-2xl bg-zone px-4 py-5 text-sm text-muted-foreground">No Sub-ambassadors yet.</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a Sub-ambassador to {coreName}</DialogTitle>
            <DialogDescription>Only ambassadors who are not in a team and lead none themselves are listed. Or add a brand-new Sub from the directory.</DialogDescription>
          </DialogHeader>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or ID" aria-label="Search ambassadors" autoFocus />
          <ul className="max-h-72 divide-y divide-border/80 overflow-y-auto">
            {options.length === 0 ? <li className="py-6 text-center text-sm text-muted-foreground">No one matches.</li> : null}
            {options.map((c) => (
              <li key={c.id}>
                <button type="button" className="flex min-h-12 w-full items-center justify-between gap-3 px-1 py-2 text-left hover:bg-elevated disabled:opacity-60" disabled={busy != null} onClick={() => add(c.id)}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">{c.fullName}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{c.ambassadorId}</span>
                  </span>
                  {busy === c.id ? <LuLoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden /> : <TierBadge tier={c.tier} />}
                </button>
              </li>
            ))}
          </ul>
          {error ? (
            <p className="flex items-center gap-1.5 text-sm text-danger" role="alert">
              <LuCircleAlert className="size-4" aria-hidden />
              {error}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
