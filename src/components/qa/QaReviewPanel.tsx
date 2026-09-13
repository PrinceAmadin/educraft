"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  LuCheck,
  LuCircleAlert as CircleAlert,
  LuLoaderCircle as Loader2,
  LuRotateCcw,
  LuTriangleAlert,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { QaChecklist } from "@/components/qa/QaChecklist";
import { cn } from "@/lib/utils";
import type { QaChecklistDef } from "@/lib/qa-checklists";

type Decision = "pass" | "revision" | "escalate";

export function QaReviewPanel({
  projectCode,
  def,
  initialChecked,
  initialNotes,
}: {
  projectCode: string;
  def: QaChecklistDef;
  initialChecked: Record<string, boolean>;
  initialNotes: string | null;
}) {
  const router = useRouter();
  const checklistRef = React.useRef<Record<string, boolean>>(initialChecked);
  const [notes, setNotes] = React.useState(initialNotes ?? "");
  const [pending, setPending] = React.useState<Decision | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<Decision | null>(null);

  const total = def.items.length;

  async function submit(decision: Decision) {
    if (decision === "revision" && !notes.trim()) {
      setError("Add feedback so the worker knows what to fix.");
      return;
    }
    setPending(decision);
    setError(null);
    try {
      const res = await fetch(`/api/admin/qa/${projectCode}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          notes: notes.trim(),
          checklist: checklistRef.current,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not record the decision.");
      }
      router.push("/admin/qa");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the decision.");
      setPending(null);
      setConfirm(null);
    }
  }

  const doneCount = () => def.items.filter((i) => checklistRef.current[i.id]).length;

  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-zone p-4 sm:p-5">
        <QaChecklist
          projectCode={projectCode}
          def={def}
          initial={initialChecked}
          onChange={(s) => {
            checklistRef.current = s;
          }}
          disabled={pending !== null}
        />
      </div>

      <div>
        <label htmlFor="qa-notes" className="text-[15px] font-semibold text-foreground">
          QA notes
        </label>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Shared with the worker when you request a revision.
        </p>
        <Textarea
          id="qa-notes"
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={pending !== null}
          className="mt-3 text-sm"
        />
      </div>

      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {confirm ? (
        <div className="rounded-2xl bg-zone p-5 text-sm">
          <p className="font-medium text-foreground">
            {confirm === "pass"
              ? `Pass this project? ${doneCount()}/${total} checklist items ticked.`
              : confirm === "revision"
                ? "Send back to the worker for revision?"
                : "Escalate this project for founder review?"}
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={pending !== null} onClick={() => submit(confirm)}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)} disabled={pending !== null}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button
            className={cn("bg-success text-success-foreground hover:bg-success/90")}
            disabled={pending !== null}
            onClick={() => setConfirm("pass")}
          >
            <LuCheck className="size-4" aria-hidden />
            Pass
          </Button>
          <Button
            variant="outline"
            className="border-gold/40 text-gold hover:bg-gold/10"
            disabled={pending !== null}
            onClick={() => setConfirm("revision")}
          >
            <LuRotateCcw className="size-4" aria-hidden />
            Revision needed
          </Button>
          <Button
            variant="outline"
            className="border-danger/40 text-danger hover:bg-danger/10"
            disabled={pending !== null}
            onClick={() => setConfirm("escalate")}
          >
            <LuTriangleAlert className="size-4" aria-hidden />
            Escalate
          </Button>
        </div>
      )}
    </div>
  );
}
