"use client";

import * as React from "react";
import { LuPencil, LuPlus, LuRotateCcw } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { SurfaceHeader } from "@/components/ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePanel } from "@/components/ambassador-panel/context";
import { PaymentDialog, ResetDialog, SlotDialog, type PaymentDialogState, type SlotDialogState } from "@/components/ambassador-panel/dialogs";
import { CopyButton, Empty, KindBadge, SearchBox, StatusPill, trackingRows } from "@/components/ambassador-panel/shared";
import { slotLabel } from "@/lib/ambassador-panel/links";

/** Slot management, registered emails and payment records — the original "Manage" tab. */
export function ManageTab() {
  return (
    <div className="space-y-14">
      <SlotManager />
      <RegisteredEmails />
      <PaymentRecords />
    </div>
  );
}

function SlotManager() {
  const { data, readOnly, canDelete } = usePanel();
  const [q, setQ] = React.useState("");
  const [dialog, setDialog] = React.useState<SlotDialogState>(null);
  const [reset, setReset] = React.useState<string | null>(null);

  const needle = q.trim().toLowerCase();
  const rows = Object.entries(data.roster.slots)
    .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
    .filter(([id, s]) => !needle || id.includes(needle) || s.name.toLowerCase().includes(needle) || s.school.toLowerCase().includes(needle));

  return (
    <section className="space-y-4">
      <SurfaceHeader
        title="Slots"
        description="Edits save instantly and the referral links update with them."
        action={
          <Button size="sm" disabled={readOnly} onClick={() => setDialog({ mode: "add" })}>
            <LuPlus className="size-4" aria-hidden />
            Add slot
          </Button>
        }
      />
      <SearchBox value={q} onChange={setQ} placeholder="Search slots" className="sm:max-w-sm" />

      {rows.length === 0 ? (
        <Empty>No slots match your search.</Empty>
      ) : (
        <div className="max-h-[32rem] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Slot</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">School</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(([id, s]) => (
                <TableRow key={id}>
                  <TableCell className="whitespace-nowrap font-mono text-sm">{slotLabel(id)}</TableCell>
                  <TableCell className="max-w-[10rem] truncate">{s.name || <span className="italic text-subtle">Vacant</span>}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{s.school || "—"}</TableCell>
                  <TableCell>
                    <StatusPill status={s.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-0.5">
                      <Button type="button" variant="ghost" size="icon-sm" disabled={readOnly} aria-label={`Edit ${slotLabel(id)}`} onClick={() => setDialog({ mode: "edit", id })}>
                        <LuPencil aria-hidden />
                      </Button>
                      {canDelete ? (
                        <Button type="button" variant="ghost" size="icon-sm" disabled={readOnly} aria-label={`Reset ${slotLabel(id)}`} onClick={() => setReset(id)}>
                          <LuRotateCcw aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <SlotDialog state={dialog} onClose={() => setDialog(null)} />
      <ResetDialog id={reset} onClose={() => setReset(null)} />
    </section>
  );
}

function RegisteredEmails() {
  const { data } = usePanel();
  const rows = trackingRows(data);
  const registered = rows.filter((r) => r.stat.email);
  const unregistered = rows.filter((r) => !r.stat.email && r.name);

  return (
    <section className="space-y-4">
      <SurfaceHeader
        title="Registered emails"
        description={`${registered.length} of ${registered.length + unregistered.length} ambassadors have registered an email.`}
        action={registered.length ? <CopyButton value={registered.map((r) => r.stat.email).join(", ")} label="Copy all" /> : null}
      />
      {registered.length === 0 ? (
        <Empty>No ambassadors have registered their email yet.</Empty>
      ) : (
        <ul className="divide-y divide-border/80">
          {registered.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <span className="min-w-0">
                <span className="text-[15px] text-foreground">{r.name}</span>{" "}
                <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="break-all text-[13px] text-primary">{r.stat.email}</span>
                <KindBadge kind={r.kind} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {unregistered.length ? (
        <div>
          <p className="meta-label">Not registered yet ({unregistered.length})</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {unregistered.map((r) => (
              <span key={r.id} className="rounded-full bg-zone px-2.5 py-1 text-xs text-muted-foreground">
                {r.name} <span className="font-mono">({r.id})</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PaymentRecords() {
  const { data, readOnly } = usePanel();
  const [dialog, setDialog] = React.useState<PaymentDialogState>(null);

  return (
    <section className="space-y-4">
      <SurfaceHeader
        title="Payment records"
        description="Bank details from approved applications, for paying commission. Add or correct records shared on WhatsApp."
        action={
          <Button size="sm" variant="outline" disabled={readOnly} onClick={() => setDialog({ mode: "add" })}>
            <LuPlus className="size-4" aria-hidden />
            Add record
          </Button>
        }
      />
      {data.payments.length === 0 ? (
        <Empty>No payment records yet. They are created automatically when applications are approved.</Empty>
      ) : (
        <>
          <ul className="divide-y divide-border/80 md:hidden">
            {data.payments.map((p) => (
              <li key={p.slotId} className="flex items-start justify-between gap-3 py-3.5">
                <div className="min-w-0 text-[13px]">
                  <p className="text-[15px] text-foreground">
                    {p.name || "—"} <span className="font-mono text-xs text-muted-foreground">EduCraftA-{p.slotId}</span>
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    {p.bankName || "—"} · <span className="font-mono text-foreground">{p.accountNumber || "—"}</span>
                  </p>
                  <p className="text-muted-foreground">{p.accountName || "—"}</p>
                </div>
                <Button type="button" variant="ghost" size="icon-sm" disabled={readOnly} aria-label={`Edit payment record for ${p.slotId}`} onClick={() => setDialog({ mode: "edit", record: p })}>
                  <LuPencil aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Slot</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Account number</TableHead>
                  <TableHead>Account name</TableHead>
                  <TableHead>University</TableHead>
                  <TableHead>
                    <span className="sr-only">Edit</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payments.map((p) => (
                  <TableRow key={p.slotId}>
                    <TableCell className="font-mono text-sm">EduCraftA-{p.slotId}</TableCell>
                    <TableCell>{p.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.bankName || "—"}</TableCell>
                    <TableCell className="font-mono">{p.accountNumber || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.accountName || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.universityAbbr || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button type="button" variant="ghost" size="icon-sm" disabled={readOnly} aria-label={`Edit payment record for ${p.slotId}`} onClick={() => setDialog({ mode: "edit", record: p })}>
                        <LuPencil aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      <PaymentDialog state={dialog} onClose={() => setDialog(null)} />
    </section>
  );
}
