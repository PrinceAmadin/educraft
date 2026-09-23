"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuCircleCheck, LuDownload, LuLoaderCircle, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PrivateFilePicker } from "@/components/files/PrivateFilePicker";
import type { UploadedRef } from "@/lib/files/upload-client";
import { humanSize } from "@/lib/files/upload-client";
import { cn, formatDate } from "@/lib/utils";

export interface WorkerVersion {
  id: string;
  version: number;
  releaseNo: number | null;
  status: "SUBMITTED" | "RELEASED" | "RETURNED" | "SUPERSEDED";
  submittedByRole: string;
  workerNote: string | null;
  reviewNote: string | null;
  createdAt: string;
  fileId: string;
  fileName: string;
  fileSize: number | null;
}

export interface WorkerDeliverable {
  id: string;
  title: string;
  kind: "CHAPTER" | "FINAL" | "OTHER";
  status: "NOT_STARTED" | "IN_REVIEW" | "CHANGES_REQUESTED" | "RELEASED";
  versions: WorkerVersion[];
  canSubmit: boolean;
  closedReason: string | null;
  /** Submitting this one sends the project to the quality check. */
  goesToQa: boolean;
}

const STATUS: Record<WorkerDeliverable["status"], { label: string; tone: string }> = {
  NOT_STARTED: { label: "Not uploaded", tone: "bg-zone text-muted-foreground" },
  IN_REVIEW: { label: "Waiting for review", tone: "bg-gold/10 text-gold" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "bg-danger/10 text-danger" },
  RELEASED: { label: "Released to client", tone: "bg-success/10 text-success" },
};

function versionLabel(v: WorkerVersion): string {
  if (v.status === "RELEASED") return v.releaseNo && v.releaseNo > 1 ? `Released as version ${v.releaseNo}` : "Released";
  if (v.status === "RETURNED") return "Returned";
  if (v.status === "SUPERSEDED") return "Replaced by a newer upload";
  return "Waiting for review";
}

/**
 * The worker's chapters and documents: upload each one, see whether it was
 * released or returned (with the admin's note), and download what's there.
 * Workers never see payment state or anything client-side.
 */
export function WorkerDeliverablesPanel({
  projectCode,
  deliverables,
}: {
  projectCode: string;
  deliverables: WorkerDeliverable[];
}) {
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Upload each chapter as it is ready. EduCraft reviews it and releases it to the client, or sends it back with a
        note. The complete document goes to the quality check.
      </p>
      <ul className="divide-y divide-border/80">
        {deliverables.map((d) => (
          <li key={d.id} className="py-5 first:pt-0">
            <DeliverableRow projectCode={projectCode} deliverable={d} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeliverableRow({ projectCode, deliverable: d }: { projectCode: string; deliverable: WorkerDeliverable }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<UploadedRef | null>(null);
  const [note, setNote] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  const latest = d.versions[0];
  const returned = latest?.status === "RETURNED" ? latest : null;
  const status = STATUS[d.status];
  const code = encodeURIComponent(projectCode);

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/worker/projects/${code}/deliverables/${d.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload: { pathname: file.pathname, ticket: file.ticket, fileName: file.fileName }, note }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; movedToQa?: boolean } | null;
      if (!res.ok) throw new Error(data?.error ?? "That didn't go through. Try again.");
      setDone(data?.movedToQa ? "Submitted. The project is now in the quality check." : "Submitted for review.");
      setOpen(false);
      setFile(null);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3 className="text-[15px] font-semibold text-foreground">{d.title}</h3>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", status.tone)}>{status.label}</span>
        {d.goesToQa ? <span className="text-xs text-muted-foreground">Goes to the quality check</span> : null}
      </div>

      {returned?.reviewNote ? (
        <div className="rounded-xl bg-danger/10 p-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <LuTriangleAlert className="size-4" aria-hidden />
            What to change
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">{returned.reviewNote}</p>
        </div>
      ) : null}

      {d.versions.length > 0 ? (
        <ul className="space-y-1">
          {d.versions.slice(0, 4).map((v) => (
            <li key={v.id}>
              <a
                href={`/api/worker/projects/${code}/files/${v.fileId}`}
                className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
              >
                <LuDownload className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-foreground">{v.fileName}</span>
                  <span className="block text-xs text-muted-foreground">
                    Upload {v.version}
                    {v.submittedByRole === "ADMIN" ? " (by EduCraft)" : ""} · {formatDate(v.createdAt)}
                    {v.fileSize ? ` · ${humanSize(v.fileSize)}` : ""} · {versionLabel(v)}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {done ? (
        <p className="flex items-center gap-2 text-sm text-success" role="status">
          <LuCircleCheck className="size-4" aria-hidden />
          {done}
        </p>
      ) : null}

      {!d.canSubmit ? (
        d.closedReason ? <p className="text-xs text-muted-foreground">{d.closedReason}</p> : null
      ) : open ? (
        <div className="space-y-3 rounded-2xl bg-zone p-4">
          <PrivateFilePicker
            id={`file-${d.id}`}
            endpoint={`/api/worker/projects/${code}/upload`}
            purpose="deliverable"
            targetId={d.id}
            value={file}
            onChange={setFile}
            onBusyChange={setUploading}
            label={`Choose the ${d.title} file`}
          />
          <div>
            <label htmlFor={`note-${d.id}`} className="meta-label">
              Note for EduCraft (optional)
            </label>
            <Textarea
              id={`note-${d.id}`}
              rows={2}
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1.5 min-h-[72px]"
              placeholder="Anything the reviewer should know"
            />
          </div>
          {error ? (
            <p className="flex items-start gap-2 text-sm text-danger" role="alert">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={submit} disabled={!file || uploading || busy}>
              {busy ? <LuLoaderCircle className="animate-spin" aria-hidden /> : null}
              {d.goesToQa ? "Submit for the quality check" : "Submit for review"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant={d.status === "CHANGES_REQUESTED" || d.status === "NOT_STARTED" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setOpen(true);
            setDone(null);
          }}
        >
          {d.versions.length === 0 ? `Upload ${d.title}` : "Upload a new version"}
        </Button>
      )}
    </div>
  );
}
