"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuClipboardCheck, LuFlag, LuFolderKanban, LuGauge, LuLoaderCircle, LuMessageCircle, LuPencilLine, LuUserPlus, LuUserX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Panel = "note" | "flag" | "load" | "suspend";

/** Half-width on a phone: labels wrap instead of running out of the button. */
const CELL = "h-auto min-h-11 justify-start whitespace-normal py-2 text-left";

/**
 * The COO's acts on a worker: assign a project, message them, suspend or
 * reinstate, add a note, adjust their max load, flag them for review, make
 * them a QA reviewer, and see all their projects.
 */
export function WorkerCooActions({
  workerId,
  status,
  maxConcurrentProjects,
  isQaReviewer,
  whatsappHref,
  openFlag = false,
}: {
  workerId: string;
  status: string;
  maxConcurrentProjects: number;
  isQaReviewer: boolean;
  whatsappHref: string | null;
  /** Open the flag form straight away (from the project page's "Flag worker"). */
  openFlag?: boolean;
}) {
  const router = useRouter();
  const [panel, setPanel] = React.useState<Panel | null>(openFlag ? "flag" : null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const [text, setText] = React.useState("");
  const [flagKind, setFlagKind] = React.useState("REVIEW");
  const [flagProject, setFlagProject] = React.useState("");
  const [load, setLoad] = React.useState(String(maxConcurrentProjects));

  const open = (p: Panel) => {
    setPanel((cur) => (cur === p ? null : p));
    setError(null);
    setDone(null);
    setText("");
  };

  async function call(key: string, method: string, path: string, body?: unknown, success?: string) {
    setBusy(key);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/admin/workers/${workerId}/${path}`, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "That action could not be completed.");
      }
      setPanel(null);
      setText("");
      if (success) setDone(success);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  const suspended = status === "Suspended";

  return (
    <section aria-labelledby="worker-actions-heading" className="space-y-3">
      <h2 id="worker-actions-heading" className="text-[15px] font-semibold text-foreground">
        COO actions
      </h2>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Button asChild variant="outline" size="sm" className={CELL}>
          <Link href={`/admin/projects?status=REQUIREMENTS_CONFIRMED&worker=unassigned`}>
            <LuUserPlus className="size-4" aria-hidden />
            Assign project
          </Link>
        </Button>
        {whatsappHref ? (
          <Button asChild variant="outline" size="sm" className={CELL}>
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
              <LuMessageCircle className="size-4" aria-hidden />
              Message worker
            </a>
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" className={cn(CELL, suspended ? "text-success" : "border-danger/40 text-danger", panel === "suspend" && "bg-zone")} onClick={() => open("suspend")} aria-expanded={panel === "suspend"}>
          <LuUserX className="size-4" aria-hidden />
          {suspended ? "Lift suspension" : "Suspend"}
        </Button>
        <Button type="button" variant="outline" size="sm" className={cn(CELL, panel === "note" && "bg-zone")} onClick={() => open("note")} aria-expanded={panel === "note"}>
          <LuPencilLine className="size-4" aria-hidden />
          Add note
        </Button>
        <Button type="button" variant="outline" size="sm" className={cn(CELL, panel === "load" && "bg-zone")} onClick={() => open("load")} aria-expanded={panel === "load"}>
          <LuGauge className="size-4" aria-hidden />
          Adjust max load
        </Button>
        <Button type="button" variant="outline" size="sm" className={cn(CELL, panel === "flag" && "bg-zone")} onClick={() => open("flag")} aria-expanded={panel === "flag"}>
          <LuFlag className="size-4" aria-hidden />
          Flag for review
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(CELL, isQaReviewer && "text-primary")}
          disabled={busy !== null}
          onClick={() => void call("qa", "PATCH", "qa-reviewer", { isQaReviewer: !isQaReviewer }, isQaReviewer ? "No longer a QA reviewer" : "Now a junior QA reviewer")}
        >
          {busy === "qa" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuClipboardCheck className="size-4" aria-hidden />}
          {isQaReviewer ? "Remove QA reviewer" : "Make QA reviewer"}
        </Button>
        <Button asChild variant="outline" size="sm" className={CELL}>
          <Link href={`/admin/projects?worker=${workerId}`}>
            <LuFolderKanban className="size-4" aria-hidden />
            View all projects
          </Link>
        </Button>
      </div>

      {panel === "note" ? (
        <Panel onSubmit={() => void call("note", "POST", "notes", { content: text }, "Note added")} busy={busy === "note"} label="Add note" onCancel={() => setPanel(null)} disabled={!text.trim()}>
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Excellent work on the Engineering cluster this month." aria-label="Note" autoFocus />
        </Panel>
      ) : null}

      {panel === "flag" ? (
        <Panel onSubmit={() => void call("flag", "POST", "flag", { kind: flagKind, reason: text, projectCode: flagProject.trim() || undefined }, "Flag recorded")} busy={busy === "flag"} label="Flag worker" onCancel={() => setPanel(null)} disabled={text.trim().length < 3}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="meta-label mb-1.5 block">Kind</span>
              <Select value={flagKind} onChange={(e) => setFlagKind(e.target.value)} className="h-11 text-sm" aria-label="Flag kind">
                <option value="REVIEW">For review</option>
                <option value="TIER2_REFERENCE">Tier 2 reference flag</option>
                <option value="QUALITY">Quality</option>
                <option value="CONDUCT">Conduct</option>
              </Select>
            </label>
            <label className="block">
              <span className="meta-label mb-1.5 block">Project (optional)</span>
              <Input value={flagProject} onChange={(e) => setFlagProject(e.target.value)} placeholder="EC-00012" className="h-11 font-mono" aria-label="Project code" />
            </label>
          </div>
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened" aria-label="Reason" autoFocus={!openFlag} />
        </Panel>
      ) : null}

      {panel === "load" ? (
        <Panel onSubmit={() => void call("load", "PATCH", "max-load", { maxConcurrentProjects: Number(load) }, "Max load updated")} busy={busy === "load"} label="Save" onCancel={() => setPanel(null)} disabled={!Number(load)}>
          <label className="block max-w-xs">
            <span className="meta-label mb-1.5 block">Max concurrent projects</span>
            <Input type="number" min={1} max={20} value={load} onChange={(e) => setLoad(e.target.value)} className="h-11" aria-label="Max concurrent projects" />
          </label>
        </Panel>
      ) : null}

      {panel === "suspend" ? (
        <Panel
          onSubmit={() => void call("suspend", "POST", suspended ? "unsuspend" : "suspend", { reason: text.trim() || undefined }, suspended ? "Suspension lifted" : "Worker suspended")}
          busy={busy === "suspend"}
          label={suspended ? "Lift suspension" : "Suspend worker"}
          onCancel={() => setPanel(null)}
        >
          <p className="text-[13px] text-muted-foreground">{suspended ? "Their login works again and they can take projects." : "Their login stops working. Current assignments stay on them until you reassign."}</p>
          <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Reason (optional)" aria-label="Reason" />
        </Panel>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      {done ? <p className="text-sm text-success">{done}</p> : null}
    </section>
  );
}

function Panel({ children, onSubmit, busy, label, onCancel, disabled }: { children: React.ReactNode; onSubmit: () => void; busy: boolean; label: string; onCancel: () => void; disabled?: boolean }) {
  return (
    <form
      className="space-y-3 rounded-2xl bg-zone p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || disabled}>
          {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          {label}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
