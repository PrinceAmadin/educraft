"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle, LuPlus } from "react-icons/lu";
import type { RosterKind } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/forms/Field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface SlotFormValue {
  code: string;
  name: string;
  school: string;
  vacant: boolean;
  percentage: number | null;
  parentCode: string | null;
}

const KIND_LABEL: Record<RosterKind, string> = {
  GENERAL: "ambassador",
  CORE: "Core ambassador",
  SUB: "Sub ambassador",
};

/**
 * Add or edit a roster entry. Add: the slot ID fills itself in (leave it
 * blank) or can be typed; Edit: the ID is fixed. Same fields as the original
 * panel's Manage form: slot ID, name, school, active or vacant.
 */
export function SlotDialog({
  kind,
  cores = [],
  slot,
  open,
  onOpenChange,
}: {
  kind: RosterKind;
  /** Core options for a Sub's "belongs to" select. */
  cores?: { code: string; name: string }[];
  /** Present = edit. */
  slot?: SlotFormValue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const editing = Boolean(slot);
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [school, setSchool] = React.useState("");
  const [vacant, setVacant] = React.useState(false);
  const [percentage, setPercentage] = React.useState("");
  const [parentCode, setParentCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset the fields each time the dialog opens.
  React.useEffect(() => {
    if (!open) return;
    setCode(slot?.code ?? "");
    setName(slot?.name ?? "");
    setSchool(slot?.school ?? "");
    setVacant(slot?.vacant ?? false);
    setPercentage(slot?.percentage != null ? String(slot.percentage) : "");
    setParentCode(slot?.parentCode ?? cores[0]?.code ?? "");
    setError(null);
  }, [open, slot, cores]);

  async function save() {
    setError(null);
    if (!vacant && !name.trim()) {
      setError("Enter a name, or mark the slot vacant.");
      return;
    }
    const pct = percentage.trim() === "" ? null : Number(percentage);
    if (pct !== null && (Number.isNaN(pct) || pct < 0 || pct > 100)) {
      setError("Percentage must be between 0 and 100.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: vacant ? "" : name.trim(),
        school: school.trim(),
        vacant,
        ...(kind !== "GENERAL" ? { percentage: pct } : {}),
        ...(kind === "SUB" ? { parentCode } : {}),
      };
      const res = editing
        ? await fetch(`/api/admin/roster/${encodeURIComponent(slot!.code)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/roster", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, code: code.trim(), ...payload }),
          });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not save.");
      }
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const idHint =
    kind === "GENERAL"
      ? "Leave blank for the next slot, or type one like 067"
      : kind === "CORE"
        ? "Leave blank to auto-assign"
        : "Leave blank to auto-assign under the chosen Core";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${slot!.code}` : `Add ${KIND_LABEL[kind]}`}</DialogTitle>
          <DialogDescription>
            Changes are live straight away on every tab and on the shared link.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!editing ? (
            <Field label="Slot ID" htmlFor="slot-code" hint={idHint}>
              <Input id="slot-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Auto" className="font-mono" />
            </Field>
          ) : null}

          {kind === "SUB" ? (
            <Field label="Belongs to (Core)" htmlFor="slot-parent">
              <Select id="slot-parent" value={parentCode} onChange={(e) => setParentCode(e.target.value)}>
                {cores.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name || c.code} ({c.code})
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Full name" htmlFor="slot-name" required={!vacant}>
            <Input id="slot-name" value={name} disabled={vacant} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="School" htmlFor="slot-school" hint="Abbreviation, like EUI or UNIBEN">
            <Input id="slot-school" value={school} onChange={(e) => setSchool(e.target.value)} />
          </Field>
          {kind !== "GENERAL" ? (
            <Field label={kind === "CORE" ? "Base percentage" : "Percentage"} htmlFor="slot-pct">
              <Input id="slot-pct" inputMode="decimal" value={percentage} onChange={(e) => setPercentage(e.target.value)} />
            </Field>
          ) : null}
          <Field label="Status" htmlFor="slot-status">
            <Select id="slot-status" value={vacant ? "vacant" : "active"} onChange={(e) => setVacant(e.target.value === "vacant")}>
              <option value="active">Active</option>
              <option value="vacant">Vacant</option>
            </Select>
          </Field>

          {error ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={save}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              {editing ? "Save changes" : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AddSlotButton({
  kind,
  cores,
  label,
}: {
  kind: RosterKind;
  cores?: { code: string; name: string }[];
  label: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="shrink-0">
        <LuPlus className="size-4" aria-hidden />
        {label}
      </Button>
      <SlotDialog kind={kind} cores={cores} open={open} onOpenChange={setOpen} />
    </>
  );
}
