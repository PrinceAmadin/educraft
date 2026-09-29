"use client";

import * as React from "react";
import { LuChartLine, LuDownload, LuLoaderCircle, LuRefreshCw, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import type { SecondaryDataResponse, SecondaryDataStatus } from "@/lib/services/secondary-data";
import { isPermanentMissing, MISSING_CODE_LABELS, type MissingItem } from "@/lib/data-fetchers/dataset-csv";
import type { RequestLogEntry } from "@/lib/data-fetchers/timed-fetch";
import { formatDateTime } from "@/lib/utils";

/**
 * A Mode 5 project's dataset, fetched for the model its Chapter 3 specifies
 * from the sources its department routes to. The assigned worker sees it on
 * their project page and the founder / COO on the Report tab: what was
 * fetched, from where, what is missing and why, the CSV, and Fetch again
 * (free until Chapter 4 starts; after that the data is frozen).
 */
export function SecondaryDataCard({ initial, endpoint, filesBase }: { initial: SecondaryDataStatus; endpoint: string; filesBase: string }) {
  const [status, setStatus] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState<{ missing?: MissingItem[]; requests?: RequestLogEntry[] } | null>(null);
  const data = status.latest;

  async function fetchData() {
    setBusy(true);
    setError(null);
    setFailed(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "That didn't work. Try again.");
        if (body?.missing || body?.requests) setFailed({ missing: body.missing, requests: body.requests });
        return;
      }
      setStatus((s) => ({ ...s, latest: body as SecondaryDataResponse }));
    } catch {
      setError("Could not reach EduCraft. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const blocked = status.chapterFourStarted
    ? "Chapter 4 has been started from this data, so it can no longer change."
    : !status.chapterThreeReady
      ? "Chapter 3 must be written first: the variables and the period are read from it."
      : null;

  return (
    <section className="space-y-5 rounded-2xl bg-zone p-4 sm:p-6" aria-labelledby="secondary-data-heading">
      <div className="space-y-1.5">
        <p className="eyebrow flex items-center gap-2 text-primary">
          <LuChartLine className="size-4" aria-hidden />
          Mode 5 · secondary data
        </p>
        <h2 id="secondary-data-heading" className="text-lg font-semibold tracking-tight text-foreground">
          {data ? `Dataset ${data.period.start}–${data.period.end}, annual` : "Dataset not fetched yet"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {data
            ? `Fetched ${formatDateTime(data.fetchedAt)} for the model in Chapter 3 (each variable's source is below). Chapters 4 and 5 are written from it.`
            : "Once Chapter 3 is written, the data for its model is fetched from the sources for this department. Chapters 4 and 5 are written from it."}
        </p>
        {status.routing ? (
          <p className="text-xs text-muted-foreground">
            {status.routing.basis}
            {status.routing.sources.length ? <span className="block">Sources: {status.routing.sources.join(" · ")}</span> : null}
          </p>
        ) : null}
      </div>

      {data ? <DatasetDetails data={data} filesBase={filesBase} /> : null}

      {error ? (
        <div className="space-y-2" role="alert">
          <p className="flex items-start gap-2 text-sm text-danger">
            <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
          {failed?.missing?.length ? <MissingList items={failed.missing} /> : null}
          {failed?.requests?.length ? <RequestSummary requests={failed.requests} /> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant={data ? "outline" : "default"} onClick={() => void fetchData()} disabled={busy || Boolean(blocked)}>
          {busy ? <LuLoaderCircle className="animate-spin" aria-hidden /> : <LuRefreshCw aria-hidden />}
          {busy ? "Fetching…" : data ? "Fetch again" : "Fetch data"}
        </Button>
        {busy ? <p className="text-xs text-muted-foreground">This takes a few seconds.</p> : blocked ? <p className="text-xs text-muted-foreground">{blocked}</p> : null}
      </div>
    </section>
  );
}

function DatasetDetails({ data, filesBase }: { data: SecondaryDataResponse; filesBase: string }) {
  const years = data.rowCount;
  return (
    <div className="space-y-5">
      {data.spec.equation ? (
        <div className="space-y-1">
          <p className="meta-label">Model{data.spec.technique ? ` · ${data.spec.technique}` : ""}</p>
          <p className="break-words font-mono text-sm text-foreground">{data.spec.equation}</p>
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="meta-label">Variables</p>
        <ul className="divide-y divide-border/60">
          {data.columns.map((c) => (
            <li key={c.symbol} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
              <span className="w-28 shrink-0 break-words font-mono text-sm font-semibold text-foreground">
                {c.symbol}
                {c.role === "dependent" ? <span className="block font-sans text-xs font-normal text-muted-foreground">dependent</span> : null}
              </span>
              <span className="min-w-0 flex-1 text-sm text-foreground">
                {c.name}
                {c.unit ? <span className="text-muted-foreground">, {c.unit}</span> : null}
                <span className="block text-xs text-muted-foreground">
                  {c.source ? `${c.source}${c.code ? ` (${c.code})` : ""}${c.sourceNote ? ` · ${c.sourceNote}` : ""}` : "Not fetched"}
                </span>
              </span>
              <span className={`shrink-0 font-mono text-xs tabular-nums ${c.years < years ? "text-gold" : "text-muted-foreground"}`}>
                {c.years} of {years} years
              </span>
            </li>
          ))}
        </ul>
      </div>

      {data.missing.length ? (
        <div className="space-y-2">
          <p className="meta-label text-gold">Missing ({data.missing.length})</p>
          <MissingList items={data.missing} />
        </div>
      ) : null}

      {data.spec.notes.length ? (
        <div className="space-y-2">
          <p className="meta-label">Read from Chapter 3</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {data.spec.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <a
          href={`${filesBase}/files/${encodeURIComponent(data.fileId)}`}
          className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none"
        >
          <LuDownload className="size-4" aria-hidden />
          Download CSV
        </a>
        <RequestSummary requests={data.requests} />
      </div>
    </div>
  );
}

function MissingList({ items }: { items: MissingItem[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((m, i) => (
        <li key={`${m.symbol}-${i}`} className="space-y-0.5 text-sm">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-mono font-semibold text-foreground">{m.symbol}</span>
            <span className="text-muted-foreground">{m.name}</span>
            {m.code ? (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isPermanentMissing(m.code) ? "bg-gold/15 text-gold" : "bg-card text-muted-foreground"}`}>{MISSING_CODE_LABELS[m.code]}</span>
            ) : null}
          </p>
          <p className="text-foreground">{m.reason}</p>
        </li>
      ))}
    </ul>
  );
}

function RequestSummary({ requests }: { requests: RequestLogEntry[] }) {
  if (!requests.length) return <span className="text-xs text-muted-foreground">No live requests (every series came from the last copy).</span>;
  const slowest = Math.max(...requests.map((r) => r.ms));
  const failed = requests.filter((r) => !r.ok);
  return (
    <span className="text-xs text-muted-foreground">
      {requests.length} request{requests.length === 1 ? "" : "s"} · slowest <span className="font-mono tabular-nums">{(slowest / 1000).toFixed(1)} s</span>
      {failed.length ? <span className="text-gold"> · {failed.length} did not answer in time or failed</span> : null}
    </span>
  );
}
