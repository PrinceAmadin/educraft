"use client";

import * as React from "react";
import { LuChartLine, LuChevronDown, LuCircleCheck, LuDownload, LuFileSpreadsheet, LuLoaderCircle, LuRefreshCw, LuTriangleAlert, LuUpload } from "react-icons/lu";
import { Field } from "@/components/forms/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
export function SecondaryDataCard({ initial, endpoint, uploadEndpoint, filesBase }: { initial: SecondaryDataStatus; endpoint: string; uploadEndpoint: string; filesBase: string }) {
  const [status, setStatus] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState<{ missing?: MissingItem[]; requests?: RequestLogEntry[] } | null>(null);
  const data = status.latest;

  /** The card's state from the server (after a failed fetch the model has been read, so the upload template exists). */
  async function refreshStatus() {
    const res = await fetch(endpoint, { cache: "no-store" }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as SecondaryDataStatus | null) : null;
    if (body) setStatus(body);
  }

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
        await refreshStatus();
        return;
      }
      await refreshStatus();
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
            ? data.origin === "upload"
              ? `Supplied by hand ${formatDateTime(data.fetchedAt)} for the model in Chapter 3 (each variable's source is below). Chapters 4 and 5 are written from it.`
              : `Fetched ${formatDateTime(data.fetchedAt)} for the model in Chapter 3 (each variable's source is below). Chapters 4 and 5 are written from it.`
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

      {!blocked ? (
        <UploadPanel
          upload={status.upload}
          endpoint={uploadEndpoint}
          // Open by default when the sources could not supply everything.
          startOpen={Boolean(failed?.missing?.some((m) => isPermanentMissing(m.code)) || data?.missing.some((m) => isPermanentMissing(m.code)) || status.routing?.domains.length === 0)}
          onUploaded={() => {
            setError(null);
            setFailed(null);
            void refreshStatus();
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * The last resort: the specialist supplies the dataset by hand, for variables
 * no source publishes. The template is the model's columns with every value
 * already fetched filled in; the upload replaces the whole dataset.
 */
function UploadPanel({
  upload,
  endpoint,
  startOpen,
  onUploaded,
}: {
  upload: SecondaryDataStatus["upload"];
  endpoint: string;
  startOpen: boolean;
  onUploaded: () => void;
}) {
  const [open, setOpen] = React.useState(startOpen);
  const [file, setFile] = React.useState<File | null>(null);
  const [source, setSource] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [problems, setProblems] = React.useState<string[]>([]);
  const [done, setDone] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const id = React.useId();

  React.useEffect(() => {
    if (startOpen) setOpen(true);
  }, [startOpen]);

  function downloadTemplate() {
    if (!upload) return;
    const url = URL.createObjectURL(new Blob([upload.templateCsv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `dataset-template-${upload.period.start}-${upload.period.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function send() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setProblems([]);
    setDone(false);
    try {
      const csv = await file.text();
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, source }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "That didn't work. Try again.");
        setProblems(Array.isArray(body?.problems) ? body.problems : []);
        return;
      }
      setDone(true);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      onUploaded();
    } catch {
      setError("Could not reach EduCraft. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 border-t border-border/60 pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${id}-upload`}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm font-semibold text-foreground"
      >
        <span className="flex items-center gap-2">
          <LuUpload className="size-4 text-primary" aria-hidden />
          Supply the data yourself
        </span>
        <LuChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open ? (
        <div id={`${id}-upload`} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            For variables no source publishes. Download the template, fill in the empty cells, save it as CSV (in Excel: Save As, CSV) and upload it with where the data comes from. It replaces the dataset above;
            columns you leave unchanged keep their source.
          </p>

          {upload ? (
            <>
              <div className="space-y-1.5">
                <Button type="button" variant="outline" onClick={downloadTemplate}>
                  <LuDownload aria-hidden />
                  Download template
                </Button>
                <p className="text-xs text-muted-foreground">
                  Year, then {upload.variables.map((v) => v.symbol).join(", ")}, one row per year from {upload.period.start} to {upload.period.end}.
                </p>
              </div>

              <Field label="Dataset (CSV)" htmlFor={`${id}-file`} required>
                <label
                  className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-input-border bg-input px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-card has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${busy ? "pointer-events-none opacity-50" : ""}`}
                >
                  <input
                    ref={fileInput}
                    id={`${id}-file`}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    disabled={busy}
                    onChange={(e) => {
                      setFile(e.target.files?.[0] ?? null);
                      setDone(false);
                    }}
                  />
                  <LuFileSpreadsheet className="size-4 text-primary" aria-hidden />
                  <span className="min-w-0 break-all">{file ? file.name : "Choose the CSV file"}</span>
                </label>
              </Field>

              <Field label="Where the data comes from" htmlFor={`${id}-source`} hint="Cited under every table of this data, e.g. CBN Statistical Bulletin 2023; NBS Labour Force Survey." required>
                <Input id={`${id}-source`} value={source} maxLength={200} onChange={(e) => setSource(e.target.value)} placeholder="e.g. CBN Statistical Bulletin 2023" disabled={busy} />
              </Field>

              {error ? (
                <div className="space-y-2" role="alert">
                  <p className="flex items-start gap-2 text-sm text-danger">
                    <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {error}
                  </p>
                  {problems.length > 1 ? (
                    <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                      {problems.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              {done ? (
                <p className="flex items-start gap-2 text-sm text-success" role="status">
                  <LuCircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Uploaded. If Report writing is waiting for the data, press Continue there.
                </p>
              ) : null}

              <Button type="button" onClick={() => void send()} disabled={busy || !file || source.trim().length < 3}>
                {busy ? <LuLoaderCircle className="animate-spin" aria-hidden /> : <LuUpload aria-hidden />}
                {busy ? "Uploading…" : "Upload dataset"}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Press Fetch data first: it reads the model&apos;s variables and period from Chapter 3, and the file must follow them.</p>
          )}
        </div>
      ) : null}
    </div>
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
        {data.origin === "upload" ? <span className="text-xs text-muted-foreground">Supplied by hand: no source was asked.</span> : <RequestSummary requests={data.requests} />}
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
