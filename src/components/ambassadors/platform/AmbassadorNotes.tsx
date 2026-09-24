"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert, LuLoaderCircle, LuNotebookPen, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** The HOG's free-text note on an ambassador — inline edit, PATCH `notes`. */
export function AmbassadorNotes({ ambassadorId, notes }: { ambassadorId: string; notes: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(notes ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ambassadors/${ambassadorId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: draft }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not save the note.");
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the note.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 meta-label">
          <LuNotebookPen className="size-3" aria-hidden />
          Notes
        </p>
        {!editing ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {notes ? "Edit" : "Add a note"}
          </Button>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={1000} placeholder="Anything the team should know about this ambassador" />
          {error ? (
            <p className="flex items-center gap-1.5 text-sm text-danger" role="alert">
              <LuCircleAlert className="size-4" aria-hidden />
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setDraft(notes ?? "");
                setEditing(false);
              }}
            >
              <LuX className="size-4" aria-hidden />
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={busy} onClick={save}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuCheck className="size-4" aria-hidden />}
              Save
            </Button>
          </div>
        </div>
      ) : notes ? (
        <p className="mt-1.5 whitespace-pre-line text-sm text-foreground">{notes}</p>
      ) : (
        <p className="mt-1.5 text-sm text-subtle">No notes yet.</p>
      )}
    </div>
  );
}
