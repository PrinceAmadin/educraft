"use client";

import * as React from "react";
import { LuCircleAlert, LuLoaderCircle, LuSend } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDateTime } from "@/lib/utils";
import { MESSAGE_MAX_LENGTH } from "@/lib/validations/client-portal";
import type { ThreadMessage } from "@/lib/services/client-messages";

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
}) {
  const [messages, setMessages] = React.useState<ThreadMessage[]>(initial);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [inView, setInView] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
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
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json().catch(() => null)) as { message?: ThreadMessage; error?: string } | null;
      if (!res.ok || !data?.message) throw new Error(data?.error ?? "Your message did not send. Try again.");
      setMessages((prev) => [...prev, data.message!]);
      setDraft("");
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
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.body}</p>
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
        <label htmlFor="message-draft" className="sr-only">
          Your message
        </label>
        <div className="flex items-end gap-2">
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
          <Button type="submit" size="icon" className="size-12 shrink-0" disabled={busy || !draft.trim()} aria-label="Send message">
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
