"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  LuArchive,
  LuArchiveRestore,
  LuCircleAlert,
  LuCircleCheck,
  LuDownload,
  LuHammer,
  LuLoaderCircle,
  LuLock,
  LuMessageCircle,
  LuSettings2,
  LuUpload,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PrivateFilePicker } from "@/components/files/PrivateFilePicker";
import type { DeliverableView, VersionView } from "@/lib/services/deliverables";
import { LOCK_TEXT } from "@/lib/files/policy";
import { humanSize, type UploadedRef } from "@/lib/files/upload-client";
import { ACCESS_LABELS, DELIVERABLE_ACCESS } from "@/lib/validations/deliverables";
import { documentReadyMessage, greetingName, waLink } from "@/lib/whatsapp";
import { CHAPTER_REVIEW_TEXT, type ChapterReviewState } from "@/lib/chapter-review";
import { ReadbackSummary } from "@/components/projects/documents/ReadbackSummary";
import { cn, formatDate } from "@/lib/utils";

export interface ClientContact {
  waNumber: string | null;
  fullName: string;
  clientId: string;
  documentsUrl: string;
}

const STATUS: Record<DeliverableView["status"], { label: string; tone: string }> = {
  NOT_STARTED: { label: "Nothing uploaded", tone: "bg-zone text-muted-foreground" },
  IN_REVIEW: { label: "Needs review", tone: "bg-gold/10 text-gold" },
  CHANGES_REQUESTED: { label: "Returned to worker", tone: "bg-danger/10 text-danger" },
  RELEASED: { label: "Released", tone: "bg-success/10 text-success" },
};

function clientSees(d: DeliverableView): string {
  if (d.archived) return "Archived: the client doesn't see it";
  if (d.clientHidden) return "Not listed for the client (they get it as the complete document)";
  if (d.gate.state === "hidden") return "Client sees: not ready yet";
  if (d.gate.state === "open") return "Client can download it";
  return `Client sees it locked: ${LOCK_TEXT[d.gate.reason].toLowerCase()}`;
}

/** Chapter review states, as the COO's chip shows them. */
const REVIEW_TONE: Record<ChapterReviewState, string> = {
  WRITING: "bg-zone text-muted-foreground",
  DRAFT_READY: "bg-zone text-foreground",
  RETURNED: "bg-danger/10 text-danger",
  AWAITING_APPROVAL: "bg-gold/10 text-gold",
  APPROVED: "bg-success/10 text-success",
  CHANGES_REQUESTED: "bg-danger/10 text-danger",
  UPDATE_WAITING: "bg-gold/10 text-gold",
};

/**
 * One chapter or document on the admin Documents tab: review the waiting
 * upload (release it to the client or return it with a note), see what the
 * client can download, upload EduCraft's own copy, and set when the client
 * may download it.
 */
export function DeliverableReviewCard({
  projectCode,
  deliverable: d,
  canReleaseFinal,
  isSuperAdmin,
  contact,
  chapterReview = false,
}: {
  projectCode: string;
  deliverable: DeliverableView;
  /** The complete document is released only after the quality check passed. */
  canReleaseFinal: boolean;
  isSuperAdmin: boolean;
  contact: ClientContact;
  /** The report is under chapter review: its complete document is built from the approved chapters. */
  chapterReview?: boolean;
}) {
  const router = useRouter();
  const code = encodeURIComponent(projectCode);
  const pending = d.versions.find((v) => v.status === "SUBMITTED") ?? null;
  const released = d.versions.filter((v) => v.releaseNo != null).sort((a, b) => (b.releaseNo ?? 0) - (a.releaseNo ?? 0));
  const status = d.review ? { label: CHAPTER_REVIEW_TEXT.state[d.review.state], tone: REVIEW_TONE[d.review.state] } : STATUS[d.status];
  const isFinal = d.kind === "FINAL";
  const stale = isFinal && pending ? pending.staleChapters : [];
  const releaseBlocked = (isFinal && !canReleaseFinal) || stale.length > 0;

  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [returning, setReturning] = React.useState(false);
  const [returnNote, setReturnNote] = React.useState("");
  const [waUrl, setWaUrl] = React.useState<string | null>(null);
  const [panel, setPanel] = React.useState<"none" | "upload" | "settings">("none");

  const readyText = contact.waNumber
    ? waLink(
        contact.waNumber,
        documentReadyMessage({
          fullName: contact.fullName,
          title: d.title,
          isFinal,
          projectCode,
          clientId: contact.clientId,
          documentsUrl: contact.documentsUrl,
        })
      )
    : null;

  async function call(label: string, url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const data = (await res.json().catch(() => null)) as (Record<string, unknown> & { error?: string }) | null;
      if (!res.ok) throw new Error(data?.error ?? "That didn't go through. Try again.");
      router.refresh();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through. Try again.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function review(v: VersionView, decision: "release" | "return") {
    const data = await call(decision, `/api/admin/projects/${code}/deliverables/versions/${v.id}`, {
      method: "POST",
      body: JSON.stringify({ decision, note: decision === "return" ? returnNote : "" }),
    });
    if (!data) return;
    if (decision === "return") {
      setReturning(false);
      setReturnNote("");
    } else {
      setWaUrl(typeof data.whatsappUrl === "string" ? data.whatsappUrl : readyText);
    }
  }

  return (
    <article className={cn("space-y-4 py-6 first:pt-0", d.archived && "opacity-60")}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className="text-[15px] font-semibold text-foreground">{d.title}</h3>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", status.tone)}>{status.label}</span>
            {isFinal ? <span className="text-xs text-muted-foreground">Complete document</span> : null}
          </div>
          {d.review ? <p className="mt-1 text-[13px] text-foreground">{CHAPTER_REVIEW_TEXT.staffLine[d.review.state]}</p> : null}
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
            {d.gate.state === "locked" ? <LuLock className="size-3.5" aria-hidden /> : null}
            {clientSees(d)} · {ACCESS_LABELS[d.access].toLowerCase()}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Upload EduCraft's copy of ${d.title}`}
            aria-pressed={panel === "upload"}
            onClick={() => setPanel(panel === "upload" ? "none" : "upload")}
          >
            <LuUpload aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Settings for ${d.title}`}
            aria-pressed={panel === "settings"}
            onClick={() => setPanel(panel === "settings" ? "none" : "settings")}
          >
            <LuSettings2 aria-hidden />
          </Button>
        </div>
      </header>

      {d.review ? (
        <ChapterReviewPanel projectCode={projectCode} deliverable={d} pending={pending} onApproved={(url) => setWaUrl(url)} />
      ) : pending ? (
        <div className="space-y-3 rounded-2xl bg-zone p-4">
          <a
            href={`/api/admin/projects/${code}/files/${pending.fileId}`}
            className="flex items-center gap-3 text-sm text-foreground hover:underline"
          >
            <LuDownload className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{pending.fileName}</span>
              <span className="block text-xs text-muted-foreground">
                Upload {pending.version} by {pending.submittedByRole === "ADMIN" ? "EduCraft" : "the worker"} ·{" "}
                {formatDate(pending.createdAt)}
                {pending.fileSize ? ` · ${humanSize(pending.fileSize)}` : ""}
              </span>
            </span>
          </a>
          {pending.workerNote ? (
            <p className="whitespace-pre-wrap text-sm text-foreground">
              <span className="meta-label mr-1.5">Note</span>
              {pending.workerNote}
            </p>
          ) : null}

          {returning ? (
            <div className="space-y-2">
              <label htmlFor={`ret-${d.id}`} className="meta-label">
                What should the worker change?
              </label>
              <Textarea
                id={`ret-${d.id}`}
                rows={3}
                value={returnNote}
                maxLength={2000}
                onChange={(e) => setReturnNote(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={!returnNote.trim() || busy !== null}
                  onClick={() => review(pending, "return")}
                >
                  {busy === "return" ? <LuLoaderCircle className="animate-spin" aria-hidden /> : null}
                  Send back to the worker
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setReturning(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy !== null || releaseBlocked}
                onClick={() => review(pending, "release")}
              >
                {busy === "release" ? <LuLoaderCircle className="animate-spin" aria-hidden /> : null}
                Release to the client
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => setReturning(true)}>
                Return with a note
              </Button>
              {stale.length ? (
                <span className="text-xs text-danger">{CHAPTER_REVIEW_TEXT.finalStale(stale)}</span>
              ) : releaseBlocked ? (
                <span className="text-xs text-muted-foreground">Released after it passes the quality check.</span>
              ) : null}
            </div>
          )}
          {isFinal && pending.builtFromApproved && !stale.length ? <p className="text-xs text-success">{CHAPTER_REVIEW_TEXT.finalBuilt}</p> : null}
        </div>
      ) : null}

      {isFinal && chapterReview && !d.archived ? <RebuildFromChapters projectCode={projectCode} /> : null}

      {waUrl ? (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-success/10 px-3 text-sm font-medium text-success transition-colors hover:bg-success/15"
        >
          <LuMessageCircle className="size-4" aria-hidden />
          Released. Tell {greetingName(contact.fullName)} on WhatsApp
        </a>
      ) : null}

      {released.length > 0 ? (
        <div>
          <p className="meta-label">{d.review ? "Approved versions" : "Released to the client"}</p>
          <ul className="mt-1.5 space-y-0.5">
            {released.map((v) => (
              <li key={v.id}>
                <a
                  href={`/api/admin/projects/${code}/files/${v.fileId}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-elevated"
                >
                  <LuDownload className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    Version {v.releaseNo} · {v.fileName}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(v.releasedAt)}</span>
                </a>
              </li>
            ))}
          </ul>
          {!waUrl && readyText && !d.archived && !d.clientHidden && (!d.review || d.gate.state === "open") ? (
            <a
              href={readyText}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex min-h-9 items-center gap-1.5 px-2 text-[13px] font-medium text-primary hover:underline"
            >
              <LuMessageCircle className="size-4" aria-hidden />
              Send the WhatsApp message
            </a>
          ) : null}
        </div>
      ) : null}

      {!d.review && !pending && released.length === 0 && d.versions.length > 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Last upload {d.versions[0].status === "RETURNED" ? "was returned" : "was replaced"} ·{" "}
          {formatDate(d.versions[0].createdAt)}
          {d.versions[0].reviewNote ? `: ${d.versions[0].reviewNote}` : ""}
        </p>
      ) : null}

      {panel === "upload" ? (
        isFinal && chapterReview ? (
          <p className="rounded-2xl bg-zone p-4 text-sm text-muted-foreground">{CHAPTER_REVIEW_TEXT.finalByHandRefused}</p>
        ) : (
          <AdminUploadForm
            projectCode={projectCode}
            deliverableId={d.id}
            title={d.title}
            releaseBlocked={releaseBlocked}
            reviewed={d.review != null}
            onReleased={(url) => setWaUrl(url ?? readyText)}
            onDone={() => setPanel("none")}
          />
        )
      ) : null}

      {panel === "settings" ? (
        <SettingsForm
          projectCode={projectCode}
          deliverable={d}
          isSuperAdmin={isSuperAdmin}
          onDone={() => setPanel("none")}
        />
      ) : null}

      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </article>
  );
}

function AdminUploadForm({
  projectCode,
  deliverableId,
  title,
  releaseBlocked,
  reviewed,
  onReleased,
  onDone,
}: {
  projectCode: string;
  deliverableId: string;
  title: string;
  releaseBlocked: boolean;
  /** A chapter under review: a .docx, and "release" is the approval. */
  reviewed: boolean;
  onReleased: (whatsappUrl: string | null) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const code = encodeURIComponent(projectCode);
  const [file, setFile] = React.useState<UploadedRef | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [release, setRelease] = React.useState(!releaseBlocked);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${code}/deliverables/${deliverableId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload: { pathname: file.pathname, ticket: file.ticket, fileName: file.fileName },
          note,
          release: release && !releaseBlocked,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; refusals?: string[]; released?: boolean; whatsappUrl?: string | null } | null;
      if (!res.ok) {
        // The upload itself is kept when approving it was refused: the card shows what to fix.
        if (data?.refusals?.length) router.refresh();
        throw new Error(data?.refusals?.length ? data.refusals.join(" ") : (data?.error ?? "That didn't go through. Try again."));
      }
      if (data?.released) onReleased(data.whatsappUrl ?? null);
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl bg-zone p-4">
      <p className="text-sm font-medium text-foreground">
        Upload EduCraft&apos;s copy of {title}
        {reviewed ? <span className="ml-1 font-normal text-muted-foreground">(a Word file, .docx: it is read back into the report)</span> : null}
      </p>
      <PrivateFilePicker
        id={`admin-file-${deliverableId}`}
        endpoint={`/api/admin/projects/${code}/upload`}
        purpose="deliverable"
        targetId={deliverableId}
        value={file}
        onChange={setFile}
        onBusyChange={setUploading}
        {...(reviewed ? { accept: ".docx", hint: "Word (.docx), up to 50 MB" } : {})}
      />
      <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Note (optional, staff only)" aria-label="Note" />
      <label className="flex min-h-11 items-center gap-2.5 text-sm text-foreground">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={release && !releaseBlocked}
          disabled={releaseBlocked}
          onChange={(e) => setRelease(e.target.checked)}
        />
        {reviewed ? "Approve it now (if it reads back cleanly)" : "Release it to the client now"}
        {releaseBlocked ? <span className="text-xs text-muted-foreground">(after the quality check)</span> : null}
      </label>
      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={submit} disabled={!file || uploading || busy}>
          {busy ? <LuLoaderCircle className="animate-spin" aria-hidden /> : null}
          {release && !releaseBlocked ? (reviewed ? "Upload and approve" : "Upload and release") : "Upload"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Chapter review on the COO's card: the AI draft with its automated check (the specialist works from
 * it), the specialist's upload read back (approve it, or return it with correction notes), and
 * correction notes on an approved chapter (it stays in use until the correction is approved).
 */
function ChapterReviewPanel({
  projectCode,
  deliverable: d,
  pending,
  onApproved,
}: {
  projectCode: string;
  deliverable: DeliverableView;
  pending: VersionView | null;
  onApproved: (whatsappUrl: string | null) => void;
}) {
  const router = useRouter();
  const code = encodeURIComponent(projectCode);
  const state = d.review!.state;
  const draft = d.versions.find((v) => v.aiDraft && v.status !== "SUPERSEDED") ?? d.versions.find((v) => v.aiDraft) ?? null;
  const upload = pending && !pending.aiDraft ? pending : null;
  const [mode, setMode] = React.useState<"none" | "confirm" | "notes">("none");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [problems, setProblems] = React.useState<string[]>([]);

  const readback = upload?.readback ?? null;
  const blocked = Boolean(readback && (readback.blocking.length || readback.summary?.placeholders.length));
  const canNote = state !== "WRITING" && state !== "RETURNED";
  const chapter = d.chapter ?? 0;

  async function post(label: string, url: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(label);
    setProblems([]);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => null)) as (Record<string, unknown> & { error?: string; refusals?: string[] }) | null;
      if (!res.ok) {
        setProblems(data?.refusals?.length ? data.refusals : [data?.error ?? "That didn't go through. Try again."]);
        return null;
      }
      router.refresh();
      return data;
    } catch {
      setProblems(["That didn't go through. Try again."]);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!upload) return;
    const data = await post("approve", `/api/admin/projects/${code}/deliverables/versions/${upload.id}`, { decision: "approve", readbackHash: readback?.hash });
    if (!data) return;
    setMode("none");
    onApproved(typeof data.whatsappUrl === "string" ? data.whatsappUrl : null);
  }

  async function sendNotes() {
    const data = await post("notes", `/api/admin/projects/${code}/deliverables/${d.id}/changes`, { note });
    if (!data) return;
    setMode("none");
    setNote("");
  }

  const notesLabel =
    state === "APPROVED" || state === "CHANGES_REQUESTED"
      ? "Request changes"
      : state === "DRAFT_READY"
        ? "Add correction notes for the specialist"
        : "Return with correction notes";

  return (
    <div className="space-y-3 rounded-2xl bg-zone p-4" data-chapter-review={state}>
      {d.review!.changeNote ? (
        <div className="rounded-xl bg-danger/10 p-3">
          <p className="meta-label text-danger">Your requested changes{d.review!.changeNoteAt ? ` · ${formatDate(d.review!.changeNoteAt)}` : ""}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{d.review!.changeNote}</p>
        </div>
      ) : null}

      {upload ? (
        <div className="space-y-3">
          <a href={`/api/admin/projects/${code}/files/${upload.fileId}`} className="flex items-center gap-3 text-sm text-foreground hover:underline">
            <LuDownload className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{upload.fileName}</span>
              <span className="block text-xs text-muted-foreground">
                The specialist&apos;s version (upload {upload.version}) · {formatDate(upload.createdAt)}
                {upload.fileSize ? ` · ${humanSize(upload.fileSize)}` : ""}
              </span>
            </span>
          </a>
          {upload.workerNote ? (
            <p className="whitespace-pre-wrap text-sm text-foreground">
              <span className="meta-label mr-1.5">Specialist&apos;s note</span>
              {upload.workerNote}
            </p>
          ) : null}
          <ReadbackSummary readback={readback} audience="staff" />
        </div>
      ) : draft && (state === "DRAFT_READY" || state === "RETURNED" || state === "WRITING") ? (
        <div className="space-y-2">
          <a href={`/api/admin/projects/${code}/files/${draft.fileId}`} className="flex items-center gap-3 text-sm text-foreground hover:underline">
            <LuDownload className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{draft.fileName}</span>
              <span className="block text-xs text-muted-foreground">AI draft · {formatDate(draft.createdAt)} · with the specialist for review</span>
            </span>
          </a>
          {draft.workerNote ? <p className="whitespace-pre-wrap text-[13px] text-muted-foreground">{draft.workerNote}</p> : null}
          {draft.reviewNote ? (
            <p className="whitespace-pre-wrap text-sm text-foreground">
              <span className="meta-label mr-1.5">Your notes</span>
              {draft.reviewNote}
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === "confirm" && upload ? (
        <div className="space-y-3 rounded-xl bg-card p-3 shadow-soft" role="group" aria-label={`Confirm approving ${d.title}`}>
          <p className="text-sm text-foreground">{CHAPTER_REVIEW_TEXT.approveConfirm(chapter, !d.clientHidden && (d.access === "DOWNPAYMENT" || d.access === "ALWAYS"))}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void approve()} disabled={busy !== null}>
              {busy === "approve" ? <LuLoaderCircle className="animate-spin" aria-hidden /> : <LuCircleCheck aria-hidden />}
              Approve {d.title}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("none")}>
              Cancel
            </Button>
          </div>
        </div>
      ) : mode === "notes" ? (
        <div className="space-y-2">
          <label htmlFor={`notes-${d.id}`} className="meta-label">
            {notesLabel}
          </label>
          <Textarea id={`notes-${d.id}`} rows={4} value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} placeholder={CHAPTER_REVIEW_TEXT.returnHint} />
          {state === "APPROVED" || state === "CHANGES_REQUESTED" ? <p className="text-xs text-muted-foreground">{CHAPTER_REVIEW_TEXT.changesHint}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" size="sm" disabled={note.trim().length < 3 || busy !== null} onClick={() => void sendNotes()}>
              {busy === "notes" ? <LuLoaderCircle className="animate-spin" aria-hidden /> : null}
              Send to the specialist
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode("none")}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {upload ? (
            <Button type="button" size="sm" disabled={busy !== null || blocked} onClick={() => setMode("confirm")} className="min-h-10">
              <LuCircleCheck aria-hidden />
              Approve
            </Button>
          ) : null}
          {canNote ? (
            <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => setMode("notes")} className="min-h-10">
              {notesLabel}
            </Button>
          ) : null}
          {upload && blocked ? <span className="text-xs text-muted-foreground">Approve once the problems above are fixed.</span> : null}
        </div>
      )}

      {problems.length ? (
        <div className="flex items-start gap-2 text-sm text-danger" role="alert">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {problems.length === 1 ? <span>{problems[0]}</span> : (
            <ul className="list-disc space-y-1 pl-4">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Chapter review: the complete document built again from the approved chapters (the quality check runs). */
function RebuildFromChapters({ projectCode }: { projectCode: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "ok" | "error"; text: string } | null>(null);
  async function rebuild() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectCode)}/report/rebuild`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { error?: string; passed?: boolean; qualityScore?: number; totalChecks?: number; autoSubmitError?: string | null } | null;
      if (!res.ok) throw new Error(data?.error ?? "That didn't go through. Try again.");
      setMessage(
        data?.passed
          ? { tone: "ok", text: `Rebuilt from the approved chapters and checked (${data.qualityScore} of ${data.totalChecks}).${data.autoSubmitError ? ` It could not be recorded: ${data.autoSubmitError}` : ""}` }
          : { tone: "error", text: `Rebuilt and checked: ${data?.qualityScore ?? "—"} of ${data?.totalChecks ?? 89}, not passed. See the Report tab for what to fix.` },
      );
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "That didn't go through. Try again." });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button type="button" variant="outline" size="sm" onClick={() => void rebuild()} disabled={busy} className="min-h-10">
        {busy ? <LuLoaderCircle className="animate-spin" aria-hidden /> : <LuHammer aria-hidden />}
        {busy ? "Rebuilding and checking…" : "Rebuild from approved chapters"}
      </Button>
      {message ? (
        <p className={cn("text-xs", message.tone === "ok" ? "text-success" : "text-danger")} role="status">
          {message.text}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Builds the complete document from the approved chapters and runs the quality check (about a minute).</p>
      )}
    </div>
  );
}

function SettingsForm({
  projectCode,
  deliverable: d,
  isSuperAdmin,
  onDone,
}: {
  projectCode: string;
  deliverable: DeliverableView;
  isSuperAdmin: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const code = encodeURIComponent(projectCode);
  const [title, setTitle] = React.useState(d.title);
  const [access, setAccess] = React.useState(d.access);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${code}/deliverables/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "That didn't save. Try again.");
      }
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const changed: Record<string, unknown> = {};
  if (title.trim() !== d.title) changed.title = title.trim();
  if (access !== d.access) changed.access = access;

  return (
    <div className="space-y-3 rounded-2xl bg-zone p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`title-${d.id}`} className="meta-label">
            Name the client sees
          </label>
          <Input id={`title-${d.id}`} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`access-${d.id}`} className="meta-label">
            Client can download it
          </label>
          <Select id={`access-${d.id}`} value={access} onChange={(e) => setAccess(e.target.value as typeof access)}>
            {DELIVERABLE_ACCESS.map((a) => (
              <option
                key={a}
                value={a}
                disabled={
                  (a === "ALWAYS" && !isSuperAdmin && d.access !== "ALWAYS") ||
                  // Chapter 3 onwards only in the complete project: the founder's rule to lift.
                  (d.access === "WITH_COMPLETE" && !isSuperAdmin && a !== "WITH_COMPLETE" && a !== "WITHHELD")
                }
              >
                {ACCESS_LABELS[a]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy || Object.keys(changed).length === 0} onClick={() => patch(changed)}>
          {busy ? <LuLoaderCircle className="animate-spin" aria-hidden /> : null}
          Save
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => patch({ archived: !d.archived })}>
          {d.archived ? <LuArchiveRestore aria-hidden /> : <LuArchive aria-hidden />}
          {d.archived ? "Restore" : "Archive"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
