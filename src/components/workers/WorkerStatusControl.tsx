"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert } from "react-icons/lu";
import { Select } from "@/components/ui/select";
import { WORKER_STATUSES } from "@/lib/worker-metrics";

export function WorkerStatusControl({
  workerId,
  current,
}: {
  workerId: string;
  current: string;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(current);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function change(next: string) {
    const prev = value;
    setValue(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/workers/${workerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not update status.");
      }
      router.refresh();
    } catch (err) {
      setValue(prev);
      setError(err instanceof Error ? err.message : "Could not update status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label
        htmlFor="worker-status"
        className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
      >
        Status
      </label>
      <Select
        id="worker-status"
        value={value}
        disabled={saving}
        onChange={(e) => change(e.target.value)}
        className="h-11 max-w-xs text-sm"
      >
        {WORKER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      {error ? (
        <p className="flex items-center gap-1 text-xs text-danger">
          <LuCircleAlert className="size-3.5" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
