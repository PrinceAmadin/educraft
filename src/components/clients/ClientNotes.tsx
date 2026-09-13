"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ClientNotes({
  clientId,
  initialNotes,
}: {
  clientId: string;
  initialNotes: string | null;
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
      const res = await fetch(`/api/admin/clients/${clientId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value }),
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
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Internal notes</h2>
        <span className="text-xs text-muted-foreground">Admin and ops only</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setState("idle");
        }}
        rows={6}
        placeholder="Anything worth remembering about this client — preferences, payment history, sensitivities…"
        className={cn(
          "mt-2 w-full rounded-lg border border-input-border bg-input p-3 text-sm text-foreground transition-colors",
          "placeholder:text-subtle",
          "focus-visible:border-ring focus-visible:bg-card focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20"
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
    </div>
  );
}
