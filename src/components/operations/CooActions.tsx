"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LuArrowRightLeft,
  LuCalendarClock,
  LuCircleAlert,
  LuFlag,
  LuLink2,
  LuLoaderCircle,
  LuMessageSquare,
  LuPencilLine,
  LuShieldAlert,
  LuUserCog,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_META } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@prisma/client";

export interface TransitionOption {
  to: ProjectStatus;
  label: string;
  blocked: string | null;
  requiresNote: boolean;
}

type Panel = "status" | "deadline" | "note" | "risk" | "client" | "senior" | "parent";

/**
 * The COO's seven actions on a project, as a stack of buttons; each opens a
 * small inline form. Forward status moves go through the pipeline's rules;
 * only the super admin sees the "set any status" list.
 */
export function CooActions({
  code,
  status,
  transitions,
  isSuperAdmin,
  hasWorker,
  atRisk,
  atRiskNote,
  internalDeadline,
  seniorReviewRequestedAt,
  seniorReviewNote,
  parentCode,
  clientFirstName,
}: {
  code: string;
  status: ProjectStatus;
  transitions: TransitionOption[];
  isSuperAdmin: boolean;
  hasWorker: boolean;
  atRisk: boolean;
  atRiskNote: string | null;
  /** YYYY-MM-DD or null. */
  internalDeadline: string | null;
  seniorReviewRequestedAt: string | null;
  seniorReviewNote: string | null;
  parentCode: string | null;
  clientFirstName: string;
}) {
  const router = useRouter();
  const [panel, setPanel] = React.useState<Panel | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  const [nextStatus, setNextStatus] = React.useState<string>("");
  const [note, setNote] = React.useState("");
  const [deadline, setDeadline] = React.useState(internalDeadline ?? "");
  const [clientMessage, setClientMessage] = React.useState(
    `Hi ${clientFirstName}, quick check-in on your project ${code}: could you send us an update on the point we are waiting on? Reply here or on WhatsApp.`
  );
  const [parent, setParent] = React.useState(parentCode ?? "");

  const openPanel = (p: Panel) => {
    setPanel((cur) => (cur === p ? null : p));
    setError(null);
    setDone(null);
    setNote("");
  };

  async function call(method: string, path: string, body?: unknown, successMessage?: string) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/admin/projects/${code}/${path}`, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "That action could not be completed.");
      }
      setPanel(null);
      setNote("");
      if (successMessage) setDone(successMessage);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  const forward = transitions.filter((t) => !t.blocked);
  const chosen = transitions.find((t) => t.to === nextStatus);
  const forcing = isSuperAdmin && nextStatus !== "" && !chosen;
  const allStatuses = Object.keys(STATUS_META) as ProjectStatus[];

  return (
    <section aria-labelledby="coo-actions-heading" className="space-y-3">
      <h2 id="coo-actions-heading" className="text-[15px] font-semibold text-foreground">
        COO actions
      </h2>

      <div className="grid grid-cols-1 gap-1.5">
        <ActionButton icon={LuArrowRightLeft} active={panel === "status"} onClick={() => openPanel("status")}>
          Change status
        </ActionButton>
        {hasWorker ? (
          <Button asChild variant="outline" size="sm" className="justify-start">
            <Link href={`/admin/projects/${code}/assign`}>
              <LuUserCog className="size-4" aria-hidden />
              Reassign worker
            </Link>
          </Button>
        ) : status === "REQUIREMENTS_CONFIRMED" ? (
          <Button asChild size="sm" className="justify-start">
            <Link href={`/admin/projects/${code}/assign`}>
              <LuUserCog className="size-4" aria-hidden />
              Assign worker
            </Link>
          </Button>
        ) : null}
        <ActionButton icon={LuCalendarClock} active={panel === "deadline"} onClick={() => openPanel("deadline")}>
          Set internal deadline
        </ActionButton>
        <ActionButton icon={LuPencilLine} active={panel === "note"} onClick={() => openPanel("note")}>
          Add note
        </ActionButton>
        <ActionButton icon={LuFlag} active={panel === "risk"} onClick={() => openPanel("risk")} tone={atRisk ? "danger" : undefined}>
          {atRisk ? "Clear at-risk flag" : "Flag as at risk"}
        </ActionButton>
        <ActionButton icon={LuMessageSquare} active={panel === "client"} onClick={() => openPanel("client")}>
          Request client update
        </ActionButton>
        <ActionButton icon={LuShieldAlert} active={panel === "senior"} onClick={() => openPanel("senior")} tone={seniorReviewRequestedAt ? "gold" : undefined}>
          {seniorReviewRequestedAt ? "Senior review requested" : "Mark for senior review"}
        </ActionButton>
        <ActionButton icon={LuLink2} active={panel === "parent"} onClick={() => openPanel("parent")}>
          {parentCode ? `Follow-on to ${parentCode}` : "Link parent project"}
        </ActionButton>
      </div>

      {panel === "status" ? (
        <Form
          onSubmit={() => {
            if (!nextStatus) return setError("Choose a status");
            if ((chosen?.requiresNote || forcing) && !note.trim()) return setError(forcing ? "A note is required to set a status directly" : "Add a note for this move");
            void call("PATCH", "status", { to: nextStatus, note: note.trim() || undefined }, `Moved to ${STATUS_META[nextStatus as ProjectStatus].label}`);
          }}
          busy={busy}
          label={forcing ? "Set status (super admin)" : "Change status"}
          onCancel={() => setPanel(null)}
        >
          <label className="block">
            <span className="meta-label mb-1.5 block">Next status</span>
            <Select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className="h-11 text-sm" aria-label="Next status">
              <option value="">Choose…</option>
              {forward.length > 0 ? (
                <optgroup label="Next step">
                  {forward.map((t) => (
                    <option key={t.to} value={t.to}>
                      {t.label} → {STATUS_META[t.to].label}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {transitions.filter((t) => t.blocked).length > 0 ? (
                <optgroup label="Not yet possible">
                  {transitions
                    .filter((t) => t.blocked)
                    .map((t) => (
                      <option key={t.to} value={t.to} disabled>
                        {STATUS_META[t.to].label} — {t.blocked}
                      </option>
                    ))}
                </optgroup>
              ) : null}
              {isSuperAdmin ? (
                <optgroup label="Set any status (super admin only)">
                  {allStatuses
                    .filter((s) => s !== status && !transitions.some((t) => t.to === s))
                    .map((s) => (
                      <option key={s} value={s}>
                        {STATUS_META[s].label}
                      </option>
                    ))}
                </optgroup>
              ) : null}
            </Select>
          </label>
          {forcing ? (
            <p className="text-[13px] text-gold">This is not a step forward in the pipeline. It is logged as a super-admin override; say why.</p>
          ) : (
            <p className="text-[13px] text-muted-foreground">Forward moves only: an approval, once given, is never reversed here.</p>
          )}
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={forcing ? "Why the status is being set directly" : "Note (optional)"} aria-label="Note" />
        </Form>
      ) : null}

      {panel === "deadline" ? (
        <Form
          onSubmit={() => void call("PATCH", "deadline", { date: deadline || null, note: note.trim() || undefined }, deadline ? "Internal deadline saved" : "Internal deadline cleared")}
          busy={busy}
          label="Save deadline"
          onCancel={() => setPanel(null)}
        >
          <label className="block">
            <span className="meta-label mb-1.5 block">Internal deadline (never shown to the client)</span>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="h-11" aria-label="Internal deadline" />
          </label>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why it moved (optional)" aria-label="Deadline note" />
        </Form>
      ) : null}

      {panel === "note" ? (
        <Form onSubmit={() => void call("POST", "notes", { content: note }, "Note added")} busy={busy} label="Add note" onCancel={() => setPanel(null)}>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Messaged Chidi — no response. Will follow up tomorrow." aria-label="Note" autoFocus />
        </Form>
      ) : null}

      {panel === "risk" ? (
        <Form
          onSubmit={() => void call("PATCH", "at-risk", { atRisk: !atRisk, note: note.trim() || undefined }, atRisk ? "At-risk flag cleared" : "Flagged at risk")}
          busy={busy}
          label={atRisk ? "Clear flag" : "Flag at risk"}
          onCancel={() => setPanel(null)}
        >
          {atRisk && atRiskNote ? <p className="text-[13px] text-muted-foreground">Flagged: {atRiskNote}</p> : null}
          {!atRisk ? <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What worries you about this one" aria-label="At-risk note" /> : null}
        </Form>
      ) : null}

      {panel === "client" ? (
        <Form onSubmit={() => void call("POST", "request-update", { message: clientMessage }, "Message sent to the client")} busy={busy} label="Send to client" onCancel={() => setPanel(null)}>
          <p className="text-[13px] text-muted-foreground">Goes to the client&apos;s dashboard thread (and their phone). They can reply there.</p>
          <Textarea rows={4} value={clientMessage} onChange={(e) => setClientMessage(e.target.value)} aria-label="Message to the client" />
        </Form>
      ) : null}

      {panel === "senior" ? (
        seniorReviewRequestedAt ? (
          <Form onSubmit={() => void call("DELETE", "senior-review", undefined, "Senior review closed")} busy={busy} label="Close senior review" onCancel={() => setPanel(null)}>
            <p className="text-[13px] text-muted-foreground">Requested {new Date(seniorReviewRequestedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}{seniorReviewNote ? `: ${seniorReviewNote}` : ""}</p>
          </Form>
        ) : (
          <Form onSubmit={() => void call("POST", "senior-review", { note }, "The founder has been asked for a senior review")} busy={busy} label="Request senior review" onCancel={() => setPanel(null)}>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs a senior domain look, and why" aria-label="Senior review note" autoFocus />
          </Form>
        )
      ) : null}

      {panel === "parent" ? (
        <Form
          onSubmit={() => void call("PATCH", "parent", { parentCode: parent.trim() || null }, parent.trim() ? "Parent project linked" : "Parent link removed")}
          busy={busy}
          label={parent.trim() ? "Link" : "Unlink"}
          onCancel={() => setPanel(null)}
        >
          <label className="block">
            <span className="meta-label mb-1.5 block">Parent project code</span>
            <Input value={parent} onChange={(e) => setParent(e.target.value)} placeholder="EC-00012" className="h-11 font-mono" aria-label="Parent project code" />
          </label>
          <p className="text-[13px] text-muted-foreground">For a follow-on order: corrections beyond round three, a chapter added later, a seminar on the same topic.</p>
        </Form>
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

function ActionButton({
  icon: Icon,
  active,
  onClick,
  tone,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  active: boolean;
  onClick: () => void;
  tone?: "danger" | "gold";
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-expanded={active}
      onClick={onClick}
      className={cn("justify-start", active && "bg-zone", tone === "danger" && "border-danger/40 text-danger", tone === "gold" && "border-gold/40 text-gold")}
    >
      <Icon className="size-4" aria-hidden />
      {children}
    </Button>
  );
}

function Form({ children, onSubmit, busy, label, onCancel }: { children: React.ReactNode; onSubmit: () => void; busy: boolean; label: string; onCancel: () => void }) {
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
        <Button type="submit" size="sm" disabled={busy}>
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
