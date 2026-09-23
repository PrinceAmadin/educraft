"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The delivery date the client sees (never the internal deadline). */
export function ExpectedDeliveryEditor({ projectCode, current }: { projectCode: string; current: string | null }) {
  const router = useRouter();
  // YYYY-MM-DD in Lagos time for the date input.
  const initial = current
    ? new Date(current).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" })
    : "";
  const [value, setValue] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectCode)}/expected-delivery`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: value || null }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not save the date.");
      }
      setMessage({ ok: true, text: "Saved. The client sees the new date." });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not save the date." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="expected-delivery">Expected delivery</Label>
        <Input id="expected-delivery" type="date" value={value} onChange={(e) => setValue(e.target.value)} className="w-48" />
      </div>
      <Button type="submit" variant="outline" disabled={busy || value === initial}>
        {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
        Save date
      </Button>
      {message ? <p className={message.ok ? "w-full text-sm text-success" : "w-full text-sm text-danger"}>{message.text}</p> : null}
    </form>
  );
}
