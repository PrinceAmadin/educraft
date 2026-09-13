"use client";

import * as React from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { panelCall, usePanel } from "@/components/ambassador-panel/context";
import { Notice, Pills, naira } from "@/components/ambassador-panel/shared";
import { normaliseId, slotLabel } from "@/lib/ambassador-panel/links";
import { nextCoreId, nextSlotId, nextSubId } from "@/lib/ambassador-panel/roster";
import type { CoreAmbassador, PaymentRecord, PendingRegistration, Roster, SlotStatus, SubAmbassador } from "@/lib/ambassador-panel/types";

// ── Shared frame ────────────────────────────────────────────────────────────

function FormDialog({
  open,
  onClose,
  title,
  description,
  error,
  busy,
  submitLabel,
  submitTone = "default",
  onSubmit,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  error?: string | null;
  busy?: boolean;
  submitLabel: string;
  submitTone?: "default" | "destructive";
  onSubmit: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !busy ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {children}
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant={submitTone} disabled={busy}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              {submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusField({ value, onChange }: { value: SlotStatus; onChange: (v: SlotStatus) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">Status</p>
      <Pills
        label="Status"
        value={value}
        onChange={onChange}
        options={[
          { value: "active", label: "Active" },
          { value: "vacant", label: "Vacant" },
        ]}
      />
    </div>
  );
}

/**
 * Marking a filled position vacant also clears its Redis profile and payment
 * record, as the original did. That delete is founder-only; for anyone else the
 * roster change still saves and the profile is left for a Super Admin.
 */
async function clearIfVacated(
  wasActive: boolean,
  nowVacant: boolean,
  slotId: string,
  canDelete: boolean,
  flash: (tone: "success" | "danger" | "info", m: string) => void
) {
  if (!wasActive || !nowVacant) return;
  if (!canDelete) {
    flash("info", `${slotLabel(slotId)} marked vacant. Its registration and payment record were kept — a Super Admin can clear them.`);
    return;
  }
  try {
    await panelCall("clear-ambassador", { slotId });
  } catch (e) {
    flash("danger", e instanceof Error ? e.message : "Could not clear the old registration.");
  }
}

// ── Slot ────────────────────────────────────────────────────────────────────

export type SlotDialogState = { mode: "add" } | { mode: "edit"; id: string } | null;

export function SlotDialog({ state, onClose }: { state: SlotDialogState; onClose: () => void }) {
  const { data, saveRoster, canDelete, flash, reload } = usePanel();
  const [id, setId] = React.useState("");
  const [name, setName] = React.useState("");
  const [school, setSchool] = React.useState("");
  const [status, setStatus] = React.useState<SlotStatus>("active");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!state) return;
    setError(null);
    if (state.mode === "add") {
      setId(nextSlotId(data.roster.slots));
      setName("");
      setSchool("");
      setStatus("active");
    } else {
      const s = data.roster.slots[state.id];
      setId(state.id);
      setName(s?.name ?? "");
      setSchool(s?.school ?? "");
      setStatus(s?.status ?? "active");
    }
  }, [state, data.roster.slots]);

  const submit = async () => {
    const slotId = state?.mode === "edit" ? state.id : normaliseId(id);
    if (!/^\d+$/.test(slotId)) return setError("Slot ID must be a number.");
    if (state?.mode === "add" && data.roster.slots[slotId]) return setError(`Slot ${slotId} already exists.`);
    if (status === "active" && !name.trim()) return setError("Name is required for an active slot.");

    const wasActive = state?.mode === "edit" && data.roster.slots[slotId]?.status === "active";
    const next: Roster = {
      ...data.roster,
      slots: { ...data.roster.slots, [slotId]: { name: name.trim(), school: school.trim(), status } },
    };
    setBusy(true);
    const ok = await saveRoster(next);
    if (ok) {
      await clearIfVacated(wasActive, status === "vacant", slotId, canDelete, flash);
      await reload();
      onClose();
    }
    setBusy(false);
  };

  return (
    <FormDialog
      open={state !== null}
      onClose={onClose}
      title={state?.mode === "add" ? "Add ambassador slot" : `Edit ${slotLabel(id)}`}
      description={state?.mode === "add" ? "The slot and its referral link are live as soon as you save." : undefined}
      error={error}
      busy={busy}
      submitLabel={state?.mode === "add" ? "Add slot" : "Save changes"}
      onSubmit={submit}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {state?.mode === "add" ? (
          <Field label="Slot ID" htmlFor="slot-id" hint="Auto-filled — change if needed">
            <Input id="slot-id" value={id} onChange={(e) => setId(e.target.value)} className="font-mono" inputMode="numeric" />
          </Field>
        ) : null}
        <Field label="School" htmlFor="slot-school">
          <Input id="slot-school" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="EUI, UNIBEN…" />
        </Field>
        <Field label="Full name" htmlFor="slot-name" className="sm:col-span-2">
          <Input id="slot-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ambassador's name" />
        </Field>
      </div>
      <StatusField value={status} onChange={setStatus} />
    </FormDialog>
  );
}

// ── Core ────────────────────────────────────────────────────────────────────

export type CoreDialogState = { mode: "add" } | { mode: "edit"; core: CoreAmbassador } | null;

export function CoreDialog({ state, onClose }: { state: CoreDialogState; onClose: () => void }) {
  const { data, saveRoster, canDelete, flash, reload } = usePanel();
  const [id, setId] = React.useState("");
  const [name, setName] = React.useState("");
  const [school, setSchool] = React.useState("");
  const [pct, setPct] = React.useState("10");
  const [status, setStatus] = React.useState<SlotStatus>("active");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!state) return;
    setError(null);
    if (state.mode === "add") {
      setId(nextCoreId(data.roster));
      setName("");
      setSchool("");
      setPct("10");
      setStatus("active");
    } else {
      setId(state.core.id);
      setName(state.core.name);
      setSchool(state.core.school);
      setPct(String(state.core.percentage));
      setStatus(state.core.status ?? "active");
    }
  }, [state, data.roster]);

  const submit = async () => {
    const fullId = id.trim().toUpperCase().startsWith("ECCA-") ? id.trim().toUpperCase() : `ECCA-${id.trim().toUpperCase()}`;
    const percentage = parseInt(pct, 10);
    if (!name.trim()) return setError("Name is required.");
    if (!Number.isFinite(percentage) || percentage < 1 || percentage > 100) return setError("Commission must be between 1 and 100.");
    if (state?.mode === "add" && data.roster.coreAmbassadors.some((c) => c.id === fullId)) return setError(`${fullId} already exists.`);

    const wasActive = state?.mode === "edit" && (state.core.status ?? "active") === "active";
    const core: CoreAmbassador = { id: fullId, name: name.trim(), school: school.trim(), percentage, status };
    const next: Roster = {
      ...data.roster,
      coreAmbassadors:
        state?.mode === "edit"
          ? data.roster.coreAmbassadors.map((c) => (c.id === state.core.id ? core : c))
          : [...data.roster.coreAmbassadors, core],
    };
    setBusy(true);
    const ok = await saveRoster(next);
    if (ok) {
      await clearIfVacated(wasActive, status === "vacant", fullId, canDelete, flash);
      await reload();
      onClose();
    }
    setBusy(false);
  };

  return (
    <FormDialog
      open={state !== null}
      onClose={onClose}
      title={state?.mode === "add" ? "Add Core Ambassador" : `Edit ${id}`}
      description="Senior partner — earns the base percentage on their own jobs plus 3% on every Sub-Ambassador job."
      error={error}
      busy={busy}
      submitLabel={state?.mode === "add" ? "Add Core Ambassador" : "Save changes"}
      onSubmit={submit}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {state?.mode === "add" ? (
          <Field label="ECCA ID" htmlFor="core-id" hint="Auto-filled — change if needed">
            <Input id="core-id" value={id} onChange={(e) => setId(e.target.value)} className="font-mono" />
          </Field>
        ) : null}
        <Field label="School" htmlFor="core-school">
          <Input id="core-school" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="EUI, UNIBEN…" />
        </Field>
        <Field label="Full name" htmlFor="core-name" className="sm:col-span-2">
          <Input id="core-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">Base commission</p>
        <div className="flex flex-wrap items-center gap-2">
          <Pills
            label="Base commission"
            value={["10", "15", "20", "25"].includes(pct) ? pct : ""}
            onChange={(v) => setPct(v)}
            options={["10", "15", "20", "25"].map((v) => ({ value: v, label: `${v}%` }))}
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Custom
            <Input
              aria-label="Custom commission percentage"
              type="number"
              min={1}
              max={100}
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="h-10 w-20 font-mono text-sm"
            />
            %
          </label>
        </div>
      </div>
      {state?.mode === "edit" ? <StatusField value={status} onChange={setStatus} /> : null}
    </FormDialog>
  );
}

// ── Sub ─────────────────────────────────────────────────────────────────────

export type SubDialogState = { mode: "add" } | { mode: "edit"; sub: SubAmbassador } | null;

export function SubDialog({ state, onClose }: { state: SubDialogState; onClose: () => void }) {
  const { data, saveRoster, applyRoster, canDelete, flash, reload } = usePanel();
  const [coreId, setCoreId] = React.useState("");
  const [subId, setSubId] = React.useState("");
  const [name, setName] = React.useState("");
  const [school, setSchool] = React.useState("");
  const [status, setStatus] = React.useState<SlotStatus>("active");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!state) return;
    setError(null);
    if (state.mode === "add") {
      setCoreId("");
      setSubId("");
      setName("");
      setSchool("");
      setStatus("active");
    } else {
      setCoreId(state.sub.coreId);
      setSubId(state.sub.id);
      setName(state.sub.name);
      setSchool(state.sub.school);
      setStatus(state.sub.status ?? "active");
    }
  }, [state]);

  const coreFullId = coreId.trim() ? (coreId.trim().toUpperCase().startsWith("ECCA-") ? coreId.trim().toUpperCase() : `ECCA-${coreId.trim().toUpperCase()}`) : "";
  const core = data.roster.coreAmbassadors.find((c) => c.id === coreFullId);

  const submit = async () => {
    if (!name.trim()) return setError("Name is required.");
    if (!core) return setError(`Core Ambassador ${coreFullId || "ID"} does not exist. Add them in the Core tab first.`);
    setBusy(true);
    try {
      if (state?.mode === "add") {
        const id = subId.trim()
          ? subId.trim().toUpperCase().startsWith("ECSA-")
            ? subId.trim().toUpperCase()
            : `ECSA-${subId.trim().toUpperCase()}`
          : nextSubId(data.roster, core.id);
        const res = await panelCall<{ roster: Roster }>("save-sub", { subId: id, name: name.trim(), school: school.trim(), coreId: core.id });
        applyRoster(res.roster);
        flash("success", `${id} added. Their client link works now.`);
        onClose();
      } else if (state?.mode === "edit") {
        const wasActive = (state.sub.status ?? "active") === "active";
        const updated: SubAmbassador = { ...state.sub, name: name.trim(), school: school.trim(), coreId: core.id, status };
        const ok = await saveRoster({
          ...data.roster,
          subAmbassadors: data.roster.subAmbassadors.map((s) => (s.id === state.sub.id ? updated : s)),
        });
        if (ok) {
          await clearIfVacated(wasActive, status === "vacant", state.sub.id, canDelete, flash);
          await reload();
          onClose();
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={state !== null}
      onClose={onClose}
      title={state?.mode === "add" ? "Add Sub-Ambassador" : `Edit ${subId}`}
      description="Sub-Ambassadors earn 7% per job; their Core Ambassador earns 3% on the same job."
      error={error}
      busy={busy}
      submitLabel={state?.mode === "add" ? "Add Sub-Ambassador" : "Save changes"}
      onSubmit={submit}
    >
      <Field
        label="Core Ambassador ID"
        htmlFor="sub-core"
        hint={coreFullId ? (core ? `Found: ${core.name}` : "Not found — check the Core tab") : "e.g. 001 or ECCA-001"}
      >
        <Input id="sub-core" value={coreId} onChange={(e) => setCoreId(e.target.value)} className="font-mono" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {state?.mode === "add" ? (
          <Field label="ECSA ID" htmlFor="sub-id" hint="Leave blank to generate">
            <Input
              id="sub-id"
              value={subId}
              onChange={(e) => setSubId(e.target.value)}
              placeholder={core ? nextSubId(data.roster, core.id) : "Auto-generated"}
              className="font-mono"
            />
          </Field>
        ) : null}
        <Field label="School" htmlFor="sub-school">
          <Input id="sub-school" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="EUI, UNIBEN…" />
        </Field>
        <Field label="Full name" htmlFor="sub-name" className="sm:col-span-2">
          <Input id="sub-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
      {state?.mode === "edit" ? <StatusField value={status} onChange={setStatus} /> : null}
    </FormDialog>
  );
}

// ── Reset ───────────────────────────────────────────────────────────────────

export function ResetDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { flash, reload } = usePanel();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => setError(null), [id]);

  return (
    <FormDialog
      open={id !== null}
      onClose={onClose}
      title={`Reset ${id ? slotLabel(id) : ""}`}
      description="The slot stays. The next ambassador can register fresh."
      error={error}
      busy={busy}
      submitLabel="Reset registration"
      submitTone="destructive"
      onSubmit={async () => {
        if (!id) return;
        setBusy(true);
        try {
          const res = await panelCall<{ message: string }>("reset-slot", { slotId: id });
          flash("success", res.message);
          await reload();
          onClose();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not reset.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Notice tone="danger">
        This permanently clears the registration profile and email, every click and logged order, the payment
        record and the application for this slot.
      </Notice>
    </FormDialog>
  );
}

// ── Message ─────────────────────────────────────────────────────────────────

export function MessageDialog({ target, onClose }: { target: { id: string; name: string } | null; onClose: () => void }) {
  const { flash } = usePanel();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setTitle("");
    setBody("");
    setError(null);
  }, [target]);

  return (
    <FormDialog
      open={target !== null}
      onClose={onClose}
      title="Send a message"
      description={target ? `${target.name} · ${slotLabel(target.id)} — sent by email.` : undefined}
      error={error}
      busy={busy}
      submitLabel="Send message"
      onSubmit={async () => {
        if (!target) return;
        if (!title.trim() || !body.trim()) return setError("Title and message are both required.");
        setBusy(true);
        try {
          const res = await panelCall<{ sentTo: string }>("message-ambassador", { slotId: target.id, title, message: body });
          flash("success", `Message sent to ${res.sentTo}.`);
          onClose();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not send.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Subject" htmlFor="msg-title">
        <Input id="msg-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Important update, well done, action required…" />
      </Field>
      <Field label="Message" htmlFor="msg-body">
        <Textarea id="msg-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

// ── Log order ───────────────────────────────────────────────────────────────

const ORDER_MESSAGES: Record<string, string> = {
  sent: "Order logged. Commission email sent.",
  no_profile: "Order logged. This ambassador is not approved yet, so no email was sent.",
  no_email: "Order logged. The ambassador's profile has no email address.",
  no_gmail_password: "Order logged. Add GMAIL_APP_PASSWORD to send commission emails.",
  send_failed: "Order logged, but the email failed to send — check GMAIL_APP_PASSWORD.",
};

export function LogOrderDialog({ target, onClose }: { target: { id: string; name: string } | null; onClose: () => void }) {
  const { flash, reload } = usePanel();
  const [amount, setAmount] = React.useState("");
  const [pct, setPct] = React.useState("10");
  const [desc, setDesc] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setAmount("");
    setPct("10");
    setDesc("");
    setError(null);
  }, [target]);

  const amountNum = parseFloat(amount.replace(/,/g, "")) || 0;
  const pctNum = parseFloat(pct) || 10;

  return (
    <FormDialog
      open={target !== null}
      onClose={onClose}
      title="Log an order"
      description={target ? `${target.name} · ${slotLabel(target.id)}` : undefined}
      error={error}
      busy={busy}
      submitLabel="Log order"
      onSubmit={async () => {
        if (!target) return;
        setBusy(true);
        try {
          const res = await panelCall<{ emailReason: string }>("track-order", {
            slotId: target.id,
            jobDesc: desc,
            jobAmount: amount,
            commissionPercent: pct,
          });
          flash("success", ORDER_MESSAGES[res.emailReason] ?? "Order logged.");
          await reload();
          onClose();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not log the order.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Job amount (₦)" htmlFor="order-amount" hint="Optional">
          <Input id="order-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" placeholder="5000" />
        </Field>
        <Field label="Commission %" htmlFor="order-pct">
          <Input id="order-pct" type="number" min={1} max={100} value={pct} onChange={(e) => setPct(e.target.value)} className="font-mono" />
        </Field>
      </div>
      {amountNum > 0 ? (
        <p className="rounded-xl bg-zone px-4 py-3 text-sm text-muted-foreground">
          Commission{" "}
          <span className="font-mono font-medium text-foreground">{naira(amountNum * (pctNum / 100))}</span>{" "}
          <span className="font-mono">
            ({pctNum}% of {naira(amountNum)})
          </span>
        </p>
      ) : null}
      <Field label="Job description" htmlFor="order-desc" hint="Optional — included in the commission email">
        <Input id="order-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Final year project, seminar paper…" />
      </Field>
    </FormDialog>
  );
}

// ── Edit pending registration ───────────────────────────────────────────────

export function EditPendingDialog({ pending, onClose }: { pending: PendingRegistration | null; onClose: () => void }) {
  const { flash, reload } = usePanel();
  const [slotId, setSlotId] = React.useState("");
  const [name, setName] = React.useState("");
  const [school, setSchool] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!pending) return;
    setSlotId(pending.slotId);
    setName(pending.name);
    setSchool(pending.school);
    setEmail(pending.email);
    setReason("");
    setError(null);
  }, [pending]);

  return (
    <FormDialog
      open={pending !== null}
      onClose={onClose}
      title="Correct a registration"
      description={pending ? `Originally submitted for slot ${pending.slotId}. A reason is kept for the audit trail.` : undefined}
      error={error}
      busy={busy}
      submitLabel="Save corrections"
      onSubmit={async () => {
        if (!pending) return;
        if (!slotId.trim() || !name.trim() || !email.trim()) return setError("Slot ID, name and email are required.");
        if (!reason.trim()) return setError("Give a reason for the change.");
        setBusy(true);
        try {
          await panelCall("edit-pending", {
            originalSlotId: pending.slotId,
            slotId,
            name,
            school,
            email,
            changeReason: reason,
          });
          flash("success", "Registration corrected.");
          await reload();
          onClose();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Slot ID" htmlFor="pend-slot" hint="Changing it moves the record">
          <Input id="pend-slot" value={slotId} onChange={(e) => setSlotId(e.target.value)} className="font-mono" />
        </Field>
        <Field label="School" htmlFor="pend-school">
          <Input id="pend-school" value={school} onChange={(e) => setSchool(e.target.value)} />
        </Field>
        <Field label="Full name" htmlFor="pend-name" className="sm:col-span-2">
          <Input id="pend-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="pend-email" className="sm:col-span-2">
          <Input id="pend-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </div>
      <Field label="Reason for change" required htmlFor="pend-reason">
        <Textarea
          id="pend-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Wrong slot ID entered — corrected to match our records."
        />
      </Field>
    </FormDialog>
  );
}

// ── Payment record ──────────────────────────────────────────────────────────

export type PaymentDialogState = { mode: "add" } | { mode: "edit"; record: PaymentRecord } | null;

const PAYMENT_FIELDS: { key: keyof PaymentRecord; label: string; mono?: boolean; numeric?: boolean }[] = [
  { key: "name", label: "Full name" },
  { key: "bankName", label: "Bank name" },
  { key: "accountNumber", label: "Account number", mono: true, numeric: true },
  { key: "accountName", label: "Account name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone", numeric: true },
  { key: "universityFull", label: "University" },
  { key: "universityAbbr", label: "University abbreviation" },
];

export function PaymentDialog({ state, onClose }: { state: PaymentDialogState; onClose: () => void }) {
  const { flash, reload } = usePanel();
  const [form, setForm] = React.useState<Partial<PaymentRecord>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!state) return;
    setForm(state.mode === "edit" ? { ...state.record } : {});
    setError(null);
  }, [state]);

  return (
    <FormDialog
      open={state !== null}
      onClose={onClose}
      title={state?.mode === "edit" ? `Payment record · EduCraftA-${state.record.slotId}` : "Add a payment record"}
      description="Bank details used to pay commission. Saved to the payment records only."
      error={error}
      busy={busy}
      submitLabel="Save record"
      onSubmit={async () => {
        if (!form.slotId?.trim()) return setError("Slot ID is required.");
        setBusy(true);
        try {
          await panelCall("save-payment", { ...form, fullName: form.name ?? "" });
          flash("success", "Payment details saved.");
          await reload();
          onClose();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {state?.mode === "add" ? (
          <Field label="Slot ID" required htmlFor="pay-slotId">
            <Input
              id="pay-slotId"
              value={form.slotId ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, slotId: e.target.value }))}
              className="font-mono"
              placeholder="051"
            />
          </Field>
        ) : null}
        {PAYMENT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} htmlFor={`pay-${f.key}`}>
            <Input
              id={`pay-${f.key}`}
              value={(form[f.key] as string | undefined) ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
              inputMode={f.numeric ? "numeric" : undefined}
              className={f.mono ? "font-mono" : undefined}
            />
          </Field>
        ))}
      </div>
    </FormDialog>
  );
}
