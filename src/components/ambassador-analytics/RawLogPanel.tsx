"use client";

import * as React from "react";
import { LuChevronLeft, LuChevronRight, LuDownload, LuLoaderCircle, LuListX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  timestamp: string;
  country: string | null;
  region: string | null;
  city: string | null;
  device: string | null;
  os: string | null;
  browser: string | null;
  source: string | null;
  quality: string;
  isFraud: boolean;
}
interface Page { rows: Row[]; total: number; page: number; pageCount: number }

const WAT = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

const QUALITY_TONE: Record<string, string> = {
  UNIQUE: "bg-success/15 text-success",
  RETURN: "bg-primary/15 text-primary",
  DUPLICATE: "bg-gold/15 text-gold",
  BOT: "bg-danger/15 text-danger",
};

const LABELS: Record<string, string> = {
  ios: "iOS", macos: "macOS", chromeos: "ChromeOS", whatsapp: "WhatsApp", tiktok: "TikTok",
  linkedin: "LinkedIn", youtube: "YouTube", twitter: "Twitter/X",
};
const cap = (s: string | null) =>
  s ? (LABELS[s.toLowerCase()] ?? s.charAt(0).toUpperCase() + s.slice(1)) : "-";

function QualityPill({ q }: { q: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", QUALITY_TONE[q] ?? "bg-zone")}>
      {cap(q.toLowerCase())}
    </span>
  );
}

const COLS = "lg:grid-cols-[8.5rem_4rem_minmax(0,1fr)_minmax(0,1fr)_5rem_5rem_minmax(0,1fr)_5.5rem_6rem_3.5rem]";

/**
 * Every recorded visit, 50 per page, from /api/ambassador/link/log (which
 * scopes to the signed-in ambassador). Desktop: a table; phone: stacked rows.
 */
export function RawLogPanel({ exportHref }: { exportHref: string }) {
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<Page | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/ambassador/link/log?page=${page}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not load the log.");
        return (await r.json()) as Page;
      })
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Could not load the log."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total.toLocaleString("en-NG")} visits recorded, newest first. Times are Nigerian time.` : "Loading visits"}
        </p>
        <Button asChild size="sm" variant="outline">
          <a href={exportHref} download>
            <LuDownload className="size-4" aria-hidden />
            Export CSV
          </a>
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">{error}</p>
      ) : !data && loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Loading
        </div>
      ) : data && data.total === 0 ? (
        <EmptyState icon={LuListX} title="No visits yet" description="Every time someone opens your link, it appears here." />
      ) : data ? (
        <div className={cn("transition-opacity", loading && "opacity-50")}>
          <div className={`hidden gap-3 border-b border-border/60 px-1 pb-2 lg:grid ${COLS}`}>
            {["Time", "Country", "Region", "City", "Device", "OS", "Browser", "Source", "Quality", "Fraud"].map((h) => (
              <span key={h} className="meta-label">{h}</span>
            ))}
          </div>
          <ul>
            {data.rows.map((r) => (
              <li key={r.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-border/40 px-1 py-2.5 text-sm last:border-0 ${COLS}`}>
                <span className="font-mono text-xs tabular-nums text-foreground">{WAT.format(new Date(r.timestamp))}</span>
                <span className="justify-self-end lg:hidden"><QualityPill q={r.quality} /></span>
                <span className="hidden lg:block">{r.country ?? "-"}</span>
                <span className="hidden truncate lg:block">{r.region ?? "-"}</span>
                <span className="hidden truncate lg:block">{r.city ?? "-"}</span>
                <span className="hidden lg:block">{cap(r.device)}</span>
                <span className="hidden lg:block">{cap(r.os)}</span>
                <span className="hidden truncate lg:block">{r.browser ?? "-"}</span>
                <span className="hidden lg:block">{cap(r.source)}</span>
                <span className="hidden lg:block"><QualityPill q={r.quality} /></span>
                <span className={cn("hidden lg:block", r.isFraud ? "font-medium text-danger" : "text-muted-foreground")}>{r.isFraud ? "Yes" : "No"}</span>
                {/* Phone: one summary line under the time. */}
                <span className="col-span-2 truncate text-xs text-muted-foreground lg:hidden">
                  {[r.city, r.region, r.country].filter(Boolean).join(", ") || "Location unknown"} · {cap(r.device)} · {r.browser ?? "-"} · {cap(r.source)}
                  {r.isFraud ? <span className="text-danger"> · Blocked</span> : null}
                </span>
              </li>
            ))}
          </ul>

          {data.pageCount > 1 ? (
            <div className="mt-4 flex items-center justify-between gap-3">
              <Button size="sm" variant="ghost" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                <LuChevronLeft className="size-4" aria-hidden /> Newer
              </Button>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                Page {data.page} of {data.pageCount}
              </span>
              <Button size="sm" variant="ghost" disabled={page >= data.pageCount || loading} onClick={() => setPage((p) => p + 1)}>
                Older <LuChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
