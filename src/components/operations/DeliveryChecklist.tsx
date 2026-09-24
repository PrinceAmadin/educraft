"use client";

import * as React from "react";
import { LuCheck, LuCircleAlert } from "react-icons/lu";
import { DELIVERY_CHECK_GROUPS, DELIVERY_CHECKLIST, deliveryChecksDone, type DeliveryChecklistState } from "@/lib/operations/qa-delivery-checklist";
import { cn } from "@/lib/utils";

/**
 * The Layer 4 delivery checklist (D1–D16), grouped, with debounced
 * auto-save. `onChange` fires synchronously so the decision panel always
 * submits the latest state.
 */
export function DeliveryChecklist({
  projectCode,
  initial,
  onChange,
  disabled = false,
}: {
  projectCode: string;
  initial: DeliveryChecklistState;
  onChange?: (state: DeliveryChecklistState) => void;
  disabled?: boolean;
}) {
  const [state, setState] = React.useState<DeliveryChecklistState>(initial);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = deliveryChecksDone(state);

  const persist = React.useCallback(
    (next: DeliveryChecklistState) => {
      if (timer.current) clearTimeout(timer.current);
      setSaveState("saving");
      timer.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/admin/qa/${projectCode}/checklist`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ delivery: next }),
          });
          setSaveState(res.ok ? "saved" : "error");
        } catch {
          setSaveState("error");
        }
      }, 600);
    },
    [projectCode]
  );

  function toggle(id: keyof DeliveryChecklistState) {
    if (disabled) return;
    setState((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      onChange?.(next);
      persist(next);
      return next;
    });
  }

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Layer 4 delivery checklist — {DELIVERY_CHECKLIST.length} items</h2>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn("font-mono tabular-nums", done === DELIVERY_CHECKLIST.length ? "text-success" : "")}>
            {done}/{DELIVERY_CHECKLIST.length}
          </span>
          {saveState === "saving" ? <span>Saving…</span> : saveState === "saved" ? <span className="inline-flex items-center gap-1 text-success"><LuCheck className="size-3.5" aria-hidden />Saved</span> : saveState === "error" ? <span className="inline-flex items-center gap-1 text-danger"><LuCircleAlert className="size-3.5" aria-hidden />Not saved</span> : null}
        </span>
      </div>
      <p className="mt-1 text-[13px] text-muted-foreground">Fixed by the EduCraft Quality Standard. Every item must be ticked before approval; tick an item that does not apply once you have confirmed that.</p>

      {DELIVERY_CHECK_GROUPS.map((group) => (
        <div key={group} className="mt-4">
          <p className="meta-label">{group}</p>
          <ul className="mt-1.5 space-y-0.5">
            {DELIVERY_CHECKLIST.filter((i) => i.group === group).map((item) => {
              const checked = Boolean(state[item.id]);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggle(item.id)}
                    disabled={disabled}
                    aria-pressed={checked}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2.5 rounded-lg p-2 text-left text-sm transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none",
                      disabled && "cursor-default opacity-70 hover:bg-transparent"
                    )}
                  >
                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", checked ? "border-primary bg-primary text-primary-foreground" : "border-border")} aria-hidden>
                      {checked ? <LuCheck className="size-3" /> : null}
                    </span>
                    <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">{item.code}</span>
                    <span className={cn(checked ? "text-muted-foreground line-through" : "text-foreground")}>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
