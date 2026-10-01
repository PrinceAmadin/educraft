"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuLoaderCircle, LuRefreshCw } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Generate (or regenerate) the weekly statement. A date picks the week; empty = the last completed week. */
export function GenerateStatement({ hasForWeek }: { hasForWeek: boolean }) {
  const router = useRouter();
  const [week, setWeek] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/statements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(week ? { week } : {}),
      });
      const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !body?.id) throw new Error(body?.error ?? "Could not generate the statement.");
      router.push(`/admin/finance/statements?id=${body.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the statement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input type="date" value={week} onChange={(e) => setWeek(e.target.value)} className="max-w-[11rem]" aria-label="A date in the week to report" />
      <Button size="sm" disabled={busy} onClick={generate}>
        {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuRefreshCw className="size-4" aria-hidden />}
        {week ? "Generate for this week" : hasForWeek ? "Regenerate last week" : "Generate last week"}
      </Button>
      {error ? <span className="text-sm text-danger">{error}</span> : null}
    </div>
  );
}
