"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NotesTab({
  projectId,
  initialNotes,
  qaNotes,
}: {
  projectId: string;
  initialNotes: string | null;
  qaNotes: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(initialNotes ?? "");
  const [saving, setSaving] = React.useState(false);
  const [state, setState] = React.useState<"idle" | "saved" | "error">("idle");
  const [message, setMessage] = React.useState<string | null>(null);

  const dirty = value !== (initialNotes ?? "");

  async function save() {
    setSaving(true);
    setState("idle");
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ internalNotes: value }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not save notes.");
      }
      setState("saved");
      router.refresh();
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Could not save notes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Internal notes</h3>
          <span className="text-xs text-muted-foreground">Admin and ops only</span>
        </div>
        <textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setState("idle");
          }}
          rows={8}
          placeholder="Context, decisions, things to watch on this project…"
          className={cn(
            "mt-2 w-full rounded-lg border border-border bg-input p-3 text-sm text-foreground transition-colors",
            "placeholder:text-subtle",
            "focus-visible:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        />
        <div className="mt-2 flex items-center gap-3">
          <Button size="sm" onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save notes"}
          </Button>
          {state === "saved" && !dirty ? (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <LuCheck className="size-3.5" aria-hidden />
              Saved
            </span>
          ) : null}
          {state === "error" ? (
            <span className="inline-flex items-center gap-1 text-xs text-danger">
              <LuCircleAlert className="size-3.5" aria-hidden />
              {message}
            </span>
          ) : null}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-foreground">QA feedback</h3>
        {qaNotes ? (
          <p className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-elevated p-3 text-sm text-foreground">
            {qaNotes}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No QA feedback recorded yet.
          </p>
        )}
      </section>
    </div>
  );
}
