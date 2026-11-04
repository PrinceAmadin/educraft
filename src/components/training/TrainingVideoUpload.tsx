"use client";

import * as React from "react";
import { upload } from "@vercel/blob/client";
import { LuCircleAlert, LuLoaderCircle, LuUpload } from "react-icons/lu";
import { Button } from "@/components/ui/button";

/** Mirrors the server's cap in `api/admin/settings/training-video/route.ts`. */
const MAX_BYTES = 500 * 1024 * 1024;
const ACCEPT = { video: ".mp4,.webm", poster: ".png,.jpg,.jpeg,.webp" } as const;

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(0)} MB`;

/**
 * Uploads a training episode's video (or its poster) straight from the
 * browser to the public Blob store and hands back the URL — the ambassador
 * tour's uploader pointed at the `training/` prefix. The file never passes
 * through HQ: the route only mints a token, and `multipart` means a dropped
 * chunk does not restart the whole upload.
 */
export function TrainingVideoUpload({
  label,
  kind,
  disabled,
  onUploaded,
}: {
  label: string;
  kind: "video" | "poster";
  disabled?: boolean;
  onUploaded: (url: string) => void;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const busy = progress !== null;

  async function onPick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError(`That file is ${mb(file.size)}. The limit is ${mb(MAX_BYTES)}.`);
      return;
    }
    setProgress(0);
    try {
      const blob = await upload(`training/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/admin/settings/training-video",
        contentType: file.type || undefined,
        multipart: true,
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });
      onUploaded(blob.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload failed.");
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept={ACCEPT[kind]}
        className="hidden"
        onChange={(e) => void onPick(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
      >
        {busy ? (
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <LuUpload className="size-4" aria-hidden />
        )}
        {busy ? `Uploading… ${progress}%` : label}
      </Button>
      {busy ? (
        <div
          role="progressbar"
          aria-label={`Uploading the ${kind}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress ?? 0}
          className="h-1.5 w-full overflow-hidden rounded-full bg-border"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress ?? 0}%` }} />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
