"use client";

import * as React from "react";
import { LuCircleAlert, LuFileText, LuLoaderCircle, LuUpload, LuX } from "react-icons/lu";
import { acceptAttribute, allowedKindsLabel, type UploadPurpose } from "@/lib/files/policy";
import { humanSize, uploadPrivateFile, type UploadedRef } from "@/lib/files/upload-client";
import { cn } from "@/lib/utils";

/**
 * Pick one file and upload it straight away (to the private store), showing
 * progress. The parent gets the upload reference and sends it with its own
 * action (submit a chapter, send a message). Clearing it only forgets it.
 */
export function PrivateFilePicker({
  endpoint,
  purpose,
  targetId,
  value,
  onChange,
  onBusyChange,
  label = "Choose a file",
  disabled = false,
  id,
}: {
  endpoint: string;
  purpose: UploadPurpose;
  targetId: string;
  value: UploadedRef | null;
  onChange: (ref: UploadedRef | null) => void;
  onBusyChange?: (busy: boolean) => void;
  label?: string;
  disabled?: boolean;
  id: string;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [name, setName] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const abort = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abort.current?.abort(), []);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setName(file.name);
    setProgress(0);
    onBusyChange?.(true);
    abort.current = new AbortController();
    try {
      const ref = await uploadPrivateFile(file, {
        endpoint,
        purpose,
        targetId,
        onProgress: setProgress,
        signal: abort.current.signal,
      });
      onChange(ref);
    } catch (err) {
      if (!abort.current?.signal.aborted) setError(err instanceof Error ? err.message : "The upload failed. Try again.");
      onChange(null);
    } finally {
      setProgress(null);
      onBusyChange?.(false);
      if (input.current) input.current.value = "";
    }
  }

  const uploading = progress !== null;

  return (
    <div className="space-y-2">
      {value && !uploading ? (
        <div className="flex items-center gap-3 rounded-xl bg-zone px-3.5 py-3">
          <LuFileText className="size-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{value.fileName}</p>
            <p className="text-xs text-muted-foreground">Uploaded · {humanSize(value.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setName(null);
            }}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Remove ${value.fileName}`}
          >
            <LuX className="size-4" aria-hidden />
          </button>
        </div>
      ) : uploading ? (
        <div className="rounded-xl bg-zone px-3.5 py-3" aria-live="polite">
          <div className="flex items-center gap-3">
            <LuLoaderCircle className="size-5 shrink-0 animate-spin text-primary" aria-hidden />
            <p className="min-w-0 flex-1 truncate text-sm text-foreground">{name}</p>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{progress}%</span>
            <button
              type="button"
              onClick={() => abort.current?.abort()}
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Cancel
            </button>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-card">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <label
          className={cn(
            "flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-input-border bg-input px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-card",
            "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
            disabled && "pointer-events-none opacity-50"
          )}
        >
          <input
            ref={input}
            id={id}
            type="file"
            accept={acceptAttribute(purpose)}
            className="sr-only"
            disabled={disabled}
            onChange={(e) => onPick(e.target.files?.[0])}
          />
          <LuUpload className="size-4 text-primary" aria-hidden />
          {label}
        </label>
      )}

      {!value && !uploading ? <p className="text-xs text-muted-foreground">{allowedKindsLabel(purpose)}</p> : null}

      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
