"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/forms/Field";
import { PercentInput, keyFromLabel } from "./primitives";
import { PERSON_TRIGGERS, PERSON_TRIGGER_LABELS, type CashflowStructure, type Level1Row, type PersonTrigger } from "@/lib/finance/cashflow-types";
import type { StaffOption } from "@/lib/services/cashflow-staff";

/**
 * A new Level-1 row: a person who earns a share of every project. Level 1
 * holds one fund row (EduCraft retains); buckets and pots are added at
 * Levels 2 and 3. A role row is offered only for a role no row pays yet.
 */
export function AddRowDialog({ open, onClose, structure, staff, onAdd }: { open: boolean; onClose: () => void; structure: CashflowStructure; staff: StaffOption[]; onAdd: (row: Level1Row) => void }) {
  const [label, setLabel] = React.useState("");
  const [who, setWho] = React.useState<"user" | "HOG" | "COO">("user");
  const [assignedUserId, setAssignedUserId] = React.useState("");
  const [trigger, setTrigger] = React.useState<PersonTrigger>("completion");
  const [percentage, setPercentage] = React.useState(0);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const rolesTaken = new Set(structure.level1.filter((r) => r.recipients === "role").map((r) => r.role));
  const roleOptions = (["HOG", "COO"] as const).filter((r) => !rolesTaken.has(r));

  function reset() {
    setLabel("");
    setWho("user");
    setAssignedUserId("");
    setTrigger("completion");
    setPercentage(0);
    setNote("");
    setError(null);
  }

  function submit() {
    if (label.trim().length < 2) {
      setError("Give the row a name");
      return;
    }
    if (who === "user" && !assignedUserId) {
      setError("Choose the login this row pays");
      return;
    }
    const key = keyFromLabel(label, structure.level1.map((r) => r.key));
    const displayOrder = Math.max(0, ...structure.level1.filter((r) => r.kind === "person").map((r) => r.displayOrder)) + 1;
    const row: Level1Row =
      who === "user"
        ? { key, label: label.trim(), percentage, displayOrder, kind: "person", recipients: "user", assignedUserId, trigger, active: true, ...(note.trim() ? { note: note.trim() } : {}) }
        : { key, label: label.trim(), percentage, displayOrder, kind: "person", recipients: "role", role: who, trigger, active: true, ...(note.trim() ? { note: note.trim() } : {}) };
    onAdd(row);
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a recipient</DialogTitle>
          <DialogDescription>A person who earns a share of every project. Set their share, then balance the level so it adds up to 100%.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Name" required htmlFor="new-row-label">
            <Input id="new-row-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Growth Associate" />
          </Field>
          <Field label="Who is paid" required htmlFor="new-row-who">
            <Select id="new-row-who" value={who} onChange={(e) => setWho(e.target.value as typeof who)}>
              <option value="user">One named login</option>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r === "HOG" ? "The Head of Growth (by role)" : "The COO (by role)"}
                </option>
              ))}
            </Select>
          </Field>
          {who === "user" ? (
            <Field label="Login" required htmlFor="new-row-user" hint="Active staff logins. The person is paid through the executives' payout run.">
              <Select id="new-row-user" value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)}>
                <option value="">Choose…</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.role}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Owed at" required htmlFor="new-row-trigger">
              <Select id="new-row-trigger" value={trigger} onChange={(e) => setTrigger(e.target.value as PersonTrigger)}>
                {PERSON_TRIGGERS.map((t) => (
                  <option key={t} value={t}>
                    {PERSON_TRIGGER_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Share of the price" required>
              <PercentInput value={percentage} onChange={setPercentage} label="Share of the price" />
            </Field>
          </div>
          <Field label="Note" htmlFor="new-row-note">
            <Input id="new-row-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" maxLength={240} />
          </Field>
          {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }}>
              Cancel
            </Button>
            <Button type="button" onClick={submit}>
              Add row
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
