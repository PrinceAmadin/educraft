"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { cn, formatDateTime } from "@/lib/utils";
import type { TimelineEntry } from "@/lib/services/operations/project-ops";

const INITIAL = 12;

/** The COO's notes and every status change on one clock, newest first, with a place to add a note. */
export function NotesTimeline({ code, entries }: { code: string; entries: TimelineEntry[] }) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  const visible = showAll ? entries : entries.slice(0, INITIAL);

  async function submit() {
    if (!note.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${code}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: note.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not save the note.");
      }
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the note.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="timeline-heading" className="space-y-3">
      <h2 id="timeline-heading" className="text-[15px] font-semibold text-foreground">
        Notes &amp; timeline
      </h2>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" aria-label="New note" />
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={busy || !note.trim()}>
            {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
            Save note
          </Button>
          {error ? (
            <span className="flex items-center gap-1 text-xs text-danger">
              <LuCircleAlert className="size-3.5" aria-hidden />
              {error}
            </span>
          ) : null}
        </div>
      </form>

      {entries.length === 0 ? (
        <p className="rounded-2xl bg-zone px-4 py-6 text-center text-[13px] text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <ol className="relative space-y-4 pl-5">
          <span className="absolute bottom-2 left-[5px] top-2 w-px bg-border" aria-hidden />
          {visible.map((e) => (
            <li key={e.id} className="relative">
              <span className={cn("absolute -left-5 top-1.5 size-2.5 rounded-full border-2 border-background", e.kind === "status" ? "bg-primary" : e.noteKind === "NOTE" ? "bg-gold" : "bg-muted-foreground")} aria-hidden />
              <p className="text-[12px] text-muted-foreground">
                {formatDateTime(e.at)}
                {e.actor ? ` · ${e.actor}` : ""}
              </p>
              {e.kind === "status" && e.toStatus ? (
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm">
                  <StatusBadge status={e.toStatus} short />
                  {e.body && e.body !== e.title ? <span className="text-foreground">{e.body}</span> : null}
                </p>
              ) : (
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
                  {e.noteKind && e.noteKind !== "NOTE" ? <span className="meta-label mr-1.5">{e.title}</span> : null}
                  {e.body}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      {entries.length > INITIAL ? (
        <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
          {showAll ? "Show fewer" : `Show all ${entries.length}`}
        </Button>
      ) : null}
    </section>
  );
}
