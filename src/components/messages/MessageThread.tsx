"use client";

import * as React from "react";
import { LuCircleAlert, LuFileText, LuLoaderCircle, LuPaperclip, LuSend, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDateTime } from "@/lib/utils";
import { MESSAGE_MAX_ATTACHMENTS, MESSAGE_MAX_LENGTH } from "@/lib/validations/client-portal";
import type { ThreadMessage } from "@/lib/services/client-messages";
import { acceptAttribute, allowedKindsLabel } from "@/lib/files/policy";
import { MESSAGE_TARGET } from "@/lib/files/paths";
import { humanSize, uploadPrivateFile, type UploadedRef } from "@/lib/files/upload-client";

interface PendingFile {
  key: string;
  name: string;
  progress: number | null;
  ref: UploadedRef | null;
  error: string | null;
}

const REFRESH_MS = 30_000;

/**
 * One thread between a client and EduCraft, used on both sides. The viewer's
 * own messages sit on the right. It refreshes (and so marks the other side's
 * messages read) only while it is actually on screen: the admin project page
 * mounts every tab at once, hidden, and opening the page must not clear the
 * unread count. Sending adds the message at once.
 */
export function MessageThread({
  endpoint,
  viewer,
  initial,
  otherName,
  emptyHint,
  readOnly = false,
  uploadEndpoint,
  filesBase,
}: {
  /** GET returns { messages }, POST { body } returns { message }. */
  endpoint: string;
  viewer: "CLIENT" | "ADMIN";
  initial: ThreadMessage[];
  /** How the other side is labelled: "EduCraft" for clients, the client's name for admins. */
  otherName: string;
  emptyHint: string;
  /** Preview: no composer and no refresh, so it never marks anything read. */
  readOnly?: boolean;
  /** The viewer's upload route; set to allow attaching files. */
  uploadEndpoint?: string;
  /** Where attachments download from, e.g. /api/client/projects/EC-00008/files */
  filesBase?: string;
}) {
  const [messages, setMessages] = React.useState<ThreadMessage[]>(initial);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [inView, setInView] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [files, setFiles] = React.useState<PendingFile[]>([]);
  const endRef = React.useRef<HTMLDivElement>(null);
  const uploading = files.some((f) => f.progress !== null);
  const ready = files.filter((f) => f.ref).map((f) => f.ref!);

  async function attach(list: FileList | null) {
    if (!list || !uploadEndpoint) return;
    setError(null);
    const room = MESSAGE_MAX_ATTACHMENTS - files.length;
    const picked = Array.from(list).slice(0, Math.max(0, room));
    if (list.length > picked.length) setError(`Attach up to ${MESSAGE_MAX_ATTACHMENTS} files at a time.`);
    for (const file of picked) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setFiles((prev) => [...prev, { key, name: file.name, progress: 0, ref: null, error: null }]);
      try {
        const ref = await uploadPrivateFile(file, {
          endpoint: uploadEndpoint,
          purpose: "message",
          targetId: MESSAGE_TARGET,
          onProgress: (p) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, progress: p } : f))),
        });
        setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, progress: null, ref } : f)));
      } catch (err) {
        const message = err instanceof Error ? err.message : "That file didn't upload.";
        setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, progress: null, error: message } : f)));
      }
    }
  }
  const count = messages.length;

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [count]);

  React.useEffect(() => {
    const el = rootRef.current;
    if (!el || readOnly || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [readOnly]);

  React.useEffect(() => {
    if (!inView || readOnly) return;
    let stopped = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { messages?: ThreadMessage[] };
        if (!stopped && data.messages) setMessages(data.messages);
      } catch {
        /* offline for a moment: try again next tick */
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    const onVisible = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [endpoint, inView, readOnly]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if ((!body && ready.length === 0) || busy || uploading) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          attachments: ready.map((r) => ({ pathname: r.pathname, ticket: r.ticket, fileName: r.fileName })),
        }),
      });
      const data = (await res.json().catch(() => null)) as { message?: ThreadMessage; error?: string } | null;
      if (!res.ok || !data?.message) throw new Error(data?.error ?? "Your message did not send. Try again.");
      setMessages((prev) => [...prev, data.message!]);
      setDraft("");
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your message did not send. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="space-y-5">
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      ) : (
        <ol className="space-y-3" aria-label="Messages">
          {messages.map((m) => {
            const mine = m.side === viewer;
            const who = mine ? (viewer === "ADMIN" ? m.authorName ?? "You" : "You") : viewer === "CLIENT" ? "EduCraft" : otherName;
            return (
              <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 sm:max-w-[70%]",
                    mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-zone text-foreground"
                  )}
                >
                  {m.body ? <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.body}</p> : null}
                  {m.attachments?.length ? (
                    <ul className={cn("space-y-1", m.body && "mt-2")}>
                      {m.attachments.map((a) => {
                        const inner = (
                          <>
                            <LuFileText className="size-4 shrink-0" aria-hidden />
                            <span className="min-w-0 flex-1 truncate">{a.fileName}</span>
                            {a.fileSize ? <span className="shrink-0 text-[11px] opacity-75">{humanSize(a.fileSize)}</span> : null}
                          </>
                        );
                        const cls = cn(
                          "flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-sm",
                          mine ? "bg-primary-foreground/15" : "bg-card"
                        );
                        return (
                          <li key={a.id}>
                            {filesBase && !readOnly ? (
                              <a href={`${filesBase}/${a.id}`} className={cn(cls, "hover:underline")}>
                                {inner}
                              </a>
                            ) : (
                              <span className={cls}>{inner}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  <p className={cn("mt-1 text-[11px]", mine ? "text-primary-foreground/75" : "text-muted-foreground")}>
                    {who} · {formatDateTime(m.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div ref={endRef} />

      {readOnly ? null : (
      <form onSubmit={send} className="space-y-2">
        {error ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
        {files.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Files to send">
            {files.map((f) => (
              <li
                key={f.key}
                className={cn(
                  "flex max-w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs",
                  f.error ? "bg-danger/10 text-danger" : "bg-zone text-foreground"
                )}
              >
                {f.progress !== null ? (
                  <LuLoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <LuFileText className="size-3.5 shrink-0" aria-hidden />
                )}
                <span className="max-w-[12rem] truncate">{f.error ?? f.name}</span>
                {f.progress !== null ? <span className="font-mono tabular-nums">{f.progress}%</span> : null}
                {f.progress === null ? (
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((x) => x.key !== f.key))}
                    className="-mr-1 inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${f.name}`}
                  >
                    <LuX className="size-3.5" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <label htmlFor="message-draft" className="sr-only">
          Your message
        </label>
        <div className="flex items-end gap-2">
          {uploadEndpoint ? (
            <label
              className={cn(
                "inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-zone text-muted-foreground transition-colors hover:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                files.length >= MESSAGE_MAX_ATTACHMENTS && "pointer-events-none opacity-50"
              )}
              title={allowedKindsLabel("message")}
            >
              <input
                type="file"
                multiple
                accept={acceptAttribute("message")}
                className="sr-only"
                onChange={(e) => {
                  void attach(e.target.files);
                  e.target.value = "";
                }}
              />
              <LuPaperclip className="size-5" aria-hidden />
              <span className="sr-only">Attach a file</span>
            </label>
          ) : null}
          <Textarea
            id="message-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_MAX_LENGTH))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
            }}
            rows={2}
            placeholder={viewer === "CLIENT" ? "Write to EduCraft…" : `Reply to ${otherName}…`}
            className="min-h-12 flex-1 resize-y"
          />
          <Button type="submit" size="icon" className="size-12 shrink-0" disabled={busy || uploading || (!draft.trim() && ready.length === 0)} aria-label="Send message">
            {busy ? <LuLoaderCircle className="size-5 animate-spin" aria-hidden /> : <LuSend className="size-5" aria-hidden />}
          </Button>
        </div>
        {viewer === "CLIENT" ? (
          <p className="text-xs text-muted-foreground">Our team usually replies within a few hours.</p>
        ) : null}
      </form>
      )}
    </div>
  );
}
