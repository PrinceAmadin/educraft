"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_EXPECTED_HOURS, EDITABLE_EXPECTATIONS, type ExpectedHours } from "@/lib/operations/pipeline-stages";
import type { ProjectStatus } from "@prisma/client";

/**
 * How long a project may sit in each status before the pipeline shows it
 * amber (1.5×) and red (2×). Blank puts a status back on its default.
 */
export function OperationsTimingForm({ hours }: { hours: ExpectedHours }) {
  const router = useRouter();
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(EDITABLE_EXPECTATIONS.map((e) => [e.status, hours[e.status] != null ? String(hours[e.status]) : ""]))
  );
  const [busy, setBusy] = React.useState(false);
  const [state, setState] = React.useState<"idle" | "saved" | "error">("idle");
  const [message, setMessage] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    setState("idle");
    setMessage(null);
    try {
      const payload: Record<string, number | null> = {};
      for (const e of EDITABLE_EXPECTATIONS) {
        const raw = values[e.status]?.trim();
        payload[e.status] = raw ? Number(raw) : null;
      }
      const res = await fetch("/api/admin/settings/operations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: payload }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not save.");
      }
      setState("saved");
      router.refresh();
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">Operations timing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Hours a project may sit in each status before the pipeline flags it: amber at one and a half times the number, red at twice. Leave a field blank to use the default.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        {EDITABLE_EXPECTATIONS.map((e) => (
          <label key={e.status} className="block">
            <span className="text-sm font-medium text-foreground">{e.label}</span>
            <span className="block text-[12px] text-muted-foreground">{e.hint}</span>
            <span className="mt-1.5 flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={24 * 90}
                inputMode="numeric"
                value={values[e.status] ?? ""}
                onChange={(ev) => setValues((v) => ({ ...v, [e.status]: ev.target.value }))}
                placeholder={String(DEFAULT_EXPECTED_HOURS[e.status as ProjectStatus] ?? "")}
                className="h-11 max-w-[8rem] font-mono"
                aria-label={`${e.label}, hours`}
              />
              <span className="text-[13px] text-muted-foreground">hours (default {DEFAULT_EXPECTED_HOURS[e.status as ProjectStatus]})</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => void save()} disabled={busy}>
          {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          Save timing
        </Button>
        {state === "saved" ? (
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
  );
}
