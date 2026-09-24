"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuChevronLeft, LuChevronRight, LuDownload, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import type { ReportType } from "@/lib/services/finance/reports";
import { cn } from "@/lib/utils";

const TYPES: { key: ReportType; label: string }[] = [
  { key: "monthly", label: "Monthly" },
  { key: "semester", label: "Semester" },
  { key: "annual", label: "Annual" },
];

function shift(type: ReportType, key: string, delta: number): string {
  if (type === "monthly") {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  if (type === "semester") {
    const [y, s] = key.split("-S").map(Number);
    const idx = y * 2 + (s - 1) + delta;
    return `${Math.floor(idx / 2)}-S${(idx % 2) + 1}`;
  }
  return String(Number(key) + delta);
}

/** Report type tabs, a period stepper and the .docx download. */
export function ReportControls({ type, period, latest }: { type: ReportType; period: string; latest: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const go = (t: ReportType, p?: string) => router.push(`/admin/finance/reports?type=${t}${p ? `&period=${p}` : ""}`);

  async function exportDocx() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/finance/reports/export?type=${type}&period=${encodeURIComponent(period)}`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "The report could not be exported.");
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `educraft-${type}-report-${period}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The report could not be exported.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Report type" className="inline-flex gap-1 rounded-xl bg-zone p-1">
        {TYPES.map((t) => (
          <Link
            key={t.key}
            href={`/admin/finance/reports?type=${t.key}`}
            aria-current={t.key === type ? "page" : undefined}
            className={cn("inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium transition-colors", t.key === type ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 surface p-1">
          <Button size="icon-sm" variant="ghost" aria-label="Previous period" onClick={() => go(type, shift(type, period, -1))}>
            <LuChevronLeft className="size-4" aria-hidden />
          </Button>
          <span className="min-w-[5.5rem] px-1 text-center font-mono text-sm text-foreground">{period}</span>
          <Button size="icon-sm" variant="ghost" aria-label="Next period" disabled={period >= latest} onClick={() => go(type, shift(type, period, 1))}>
            <LuChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
        <Button size="sm" onClick={exportDocx} disabled={busy}>
          {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuDownload className="size-4" aria-hidden />}
          Export .docx
        </Button>
      </div>
      {error ? <p className="w-full text-sm text-danger">{error}</p> : null}
    </div>
  );
}
