"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert, LuLoaderCircle, LuPencil, LuPlus, LuUndo2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CONTENT_PICKER_LABELS, CONTENT_TYPES, type ContentType, type MilestoneKey } from "@/lib/ambassadors/content-types";

/** Today's date in Lagos (UTC+1), YYYY-MM-DD. */
function todayWat(): string {
  return new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
}

/** "Log content posted": type, date (today by default), the hook or message. */
export function LogContentButton({ defaultType = "MONDAY_FLIER" }: { defaultType?: ContentType }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<ContentType>(defaultType);
  const [date, setDate] = React.useState(todayWat());
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      // Noon in Lagos, so the post lands in the right Monday-to-Sunday week.
      const postedAt = `${date}T11:00:00.000Z`;
      const res = await fetch("/api/admin/ambassadors/content-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentType: type, postedAt, note }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not log it.");
      }
      setOpen(false);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" onClick={() => { setDate(todayWat()); setOpen(true); }}>
        <LuPlus className="size-4" aria-hidden />
        Log content posted
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log posted content</DialogTitle>
            <DialogDescription>What went out to the ambassador community, so the calendar and the consistency numbers stay true.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Type" htmlFor="lc-type">
              <Select id="lc-type" value={type} onChange={(e) => setType(e.target.value as ContentType)}>
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CONTENT_PICKER_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" htmlFor="lc-date">
              <Input id="lc-date" type="date" value={date} max={todayWat()} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Note" htmlFor="lc-note" hint="Optional: what was the hook or message?">
              <Textarea id="lc-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {error ? (
              <p className="flex items-center gap-1.5 text-sm text-danger" role="alert">
                <LuCircleAlert className="size-4" aria-hidden />
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" onClick={save} disabled={busy || !date}>
                {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuCheck className="size-4" aria-hidden />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Undo a post logged by mistake. */
export function UndoLogButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-label={`Undo: ${label}`}
      title="Logged by mistake? Undo"
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-elevated hover:text-foreground disabled:opacity-50"
      onClick={async () => {
        if (!window.confirm(`Remove "${label}" from the log?`)) return;
        setBusy(true);
        await fetch(`/api/admin/ambassadors/content-log/${id}`, { method: "DELETE" });
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuUndo2 className="size-3.5" aria-hidden />}
    </button>
  );
}

/** Set or change the next semester's start date and name. */
export function CampaignSettings({ label, semesterStart }: { label: string | null; semesterStart: string | null }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(label ?? "");
  const [start, setStart] = React.useState(semesterStart ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <>
      <Button type="button" size="sm" variant={semesterStart ? "ghost" : "default"} onClick={() => setOpen(true)}>
        {semesterStart ? <LuPencil className="size-4" aria-hidden /> : <LuPlus className="size-4" aria-hidden />}
        {semesterStart ? "Change semester" : "Set the semester start"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Next semester</DialogTitle>
            <DialogDescription>The pre-season campaign starts 8 weeks before this date, with a push every two weeks.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Semester" htmlFor="cp-label" hint="e.g. Semester 2 2026/2027">
              <Input id="cp-label" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </Field>
            <Field label="Semester starts" htmlFor="cp-start">
              <Input id="cp-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            {error ? (
              <p className="flex items-center gap-1.5 text-sm text-danger" role="alert">
                <LuCircleAlert className="size-4" aria-hidden />
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={busy || name.trim().length < 2 || !start}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  const res = await fetch("/api/admin/ambassadors/campaign", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: name, semesterStart: start }) });
                  setBusy(false);
                  if (!res.ok) {
                    const body = (await res.json().catch(() => null)) as { error?: string } | null;
                    setError(body?.error ?? "Could not save.");
                    return;
                  }
                  setOpen(false);
                  router.refresh();
                }}
              >
                {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuCheck className="size-4" aria-hidden />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Tick a campaign milestone as done (or untick it). */
export function MilestoneToggle({ milestone, done, label }: { milestone: MilestoneKey; done: boolean; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={done}
      className={done ? "inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-success/15 px-3 text-xs font-medium text-success" : "inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-card px-3 text-xs font-medium text-foreground shadow-soft hover:bg-elevated"}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/admin/ambassadors/campaign", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: milestone, done: !done }) });
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuCheck className="size-3.5" aria-hidden />}
      {done ? "Done" : `Mark ${label.toLowerCase()} done`}
    </button>
  );
}
