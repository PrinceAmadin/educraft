"use client";

import * as React from "react";
import { LuArrowDown, LuCirclePause, LuCircleCheck, LuUpload } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { DataFilesPicker } from "@/components/files/DataFilesPicker";
import type { UploadedRef } from "@/lib/files/upload-client";
import type { PauseView } from "@/lib/generation/progress-events";
import { cn } from "@/lib/utils";

/**
 * D6: the report is waiting for data. The title and message depend on the
 * mode and the pause (survey results, build specification, test results, lab
 * results: PAUSE_PHASE_TEXT); the status line says whether the client has sent
 * anything. "Upload files" adds the specialist's own files to the pause (D4's
 * add_files, e.g. the SPSS output they ran); checking and verifying happen in
 * the review card below.
 */
export function PauseBanner({
  pause,
  uploadEndpoint,
  actionEndpoint,
  onFilesAdded,
}: {
  pause: PauseView;
  uploadEndpoint: string;
  actionEndpoint: string;
  onFilesAdded?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [files, setFiles] = React.useState<UploadedRef[]>([]);
  const [pickerKey, setPickerKey] = React.useState(0);
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const needsAction = pause.status === "client_sent";
  const canUpload = pause.status === "waiting_for_client" || pause.status === "client_sent";

  async function addFiles() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(actionEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_files", pauseId: pause.pauseId, files: files.map((f) => ({ pathname: f.pathname, ticket: f.ticket, fileName: f.fileName })) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage({ tone: "error", text: (Array.isArray(data?.problems) && data.problems[0]) || data?.error || "That didn't work. Try again." });
        return;
      }
      setMessage({ tone: "ok", text: `Added ${files.length === 1 ? "1 file" : `${files.length} files`} to the data.` });
      setFiles([]);
      setPickerKey((k) => k + 1);
      setOpen(false);
      onFilesAdded?.();
    } catch {
      setMessage({ tone: "error", text: "Could not reach EduCraft. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={cn("space-y-4 rounded-2xl p-4 sm:p-5", needsAction ? "bg-gold/10" : "bg-zone")} aria-labelledby={`pause-banner-${pause.pauseId}`} data-pause-phase={pause.pausePhase ?? ""}>
      <div className="space-y-1.5">
        <p className="eyebrow flex items-center gap-2 text-gold">
          <LuCirclePause className="size-4" aria-hidden />
          Paused after Chapter {pause.afterChapter}
        </p>
        <h3 id={`pause-banner-${pause.pauseId}`} className="text-lg font-semibold tracking-tight text-foreground">
          {pause.title}
        </h3>
        <p className="max-w-3xl text-sm leading-relaxed text-foreground">{pause.message}</p>
      </div>

      {pause.uploadRequired.length ? (
        <div className="space-y-1.5">
          <p className="meta-label">What Chapter {pause.afterChapter + 1} needs</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {pause.uploadRequired.map((u) => (
              <li key={u} className="flex items-start gap-2 text-sm text-foreground">
                <LuCircleCheck className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                {u}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className={cn("text-sm", needsAction ? "font-semibold text-foreground" : "text-muted-foreground")} role="status">
        {pause.statusLine}
        {pause.round > 1 ? ` (request ${pause.round})` : ""}
      </p>
      {pause.note ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Your note to the client:</span> {pause.note}
        </p>
      ) : null}

      {canUpload ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant={needsAction ? "default" : "outline"} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={`pause-upload-${pause.pauseId}`}>
              <LuUpload aria-hidden />
              Upload files
            </Button>
            <a href={`#pause-${pause.pauseId}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none">
              <LuArrowDown className="size-4" aria-hidden />
              Review and verify
            </a>
          </div>
          <div id={`pause-upload-${pause.pauseId}`} hidden={!open} className="space-y-3">
            <DataFilesPicker key={pickerKey} id={`pause-files-${pause.pauseId}`} endpoint={uploadEndpoint} targetId={pause.pauseId} onChange={setFiles} onBusyChange={setUploading} disabled={busy} label="Choose files" />
            {files.length ? (
              <Button type="button" disabled={busy || uploading} onClick={() => void addFiles()}>
                {busy ? "Adding…" : `Add ${files.length === 1 ? "this file" : `these ${files.length} files`} to the data`}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {message ? (
        <p className={cn("text-sm", message.tone === "error" ? "text-danger" : "text-success")} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
