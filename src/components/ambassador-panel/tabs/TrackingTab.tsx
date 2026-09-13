"use client";

import * as React from "react";
import { LuCheck, LuLoaderCircle, LuMail, LuPencil, LuReceipt, LuRefreshCw, LuSend, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SurfaceHeader } from "@/components/ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { panelCall, useOrigin, usePanel } from "@/components/ambassador-panel/context";
import { EditPendingDialog, LogOrderDialog, MessageDialog } from "@/components/ambassador-panel/dialogs";
import {
  CopyButton,
  Empty,
  KindBadge,
  SearchBox,
  Stat,
  conversion,
  shortDate,
  trackingRows,
  type TrackingRow,
} from "@/components/ambassador-panel/shared";
import type { PendingRegistration } from "@/lib/ambassador-panel/types";
import { cn } from "@/lib/utils";

/** Registrations to approve, the live leaderboard, and ambassador email. */
export function TrackingTab() {
  const { data, readOnly, flash, reload } = usePanel();
  const origin = useOrigin();
  const [q, setQ] = React.useState("");
  const [refreshing, setRefreshing] = React.useState(false);
  const [logFor, setLogFor] = React.useState<{ id: string; name: string } | null>(null);
  const [messageFor, setMessageFor] = React.useState<{ id: string; name: string } | null>(null);
  const [editPending, setEditPending] = React.useState<PendingRegistration | null>(null);

  const all = React.useMemo(() => trackingRows(data), [data]);
  const needle = q.trim().toLowerCase();
  const rows = needle ? all.filter((r) => r.id.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle)) : all;

  const totals = all.reduce(
    (t, r) => ({ clicks: t.clicks + r.stat.clicks, orders: t.orders + r.stat.orders, registered: t.registered + (r.stat.email ? 1 : 0) }),
    { clicks: 0, orders: 0, registered: 0 }
  );

  const registerLink = origin ? `${origin}/ambassador-panel/register` : "";

  return (
    <div className="space-y-10">
      <PendingSection onEdit={setEditPending} />

      <section aria-label="Tracking totals" className="grid grid-cols-3 gap-x-6">
        <Stat label="Total clicks" value={totals.clicks} tone="primary" />
        <Stat label="Orders logged" value={totals.orders} />
        <Stat label="Registered" value={totals.registered} />
      </section>

      <div className="flex flex-col gap-3 rounded-2xl bg-zone p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Ambassador registration link</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{registerLink || "/ambassador-panel/register"}</p>
        </div>
        <CopyButton value={registerLink} label="Copy link" />
      </div>

      <section className="space-y-4">
        <SurfaceHeader
          title="Referral leaderboard"
          description="Ranked by clicks plus five times orders. Conversion is orders ÷ clicks, shown once there are clicks."
          action={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                await reload();
                setRefreshing(false);
              }}
            >
              <LuRefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} aria-hidden />
              Refresh
            </Button>
          }
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search ambassadors" className="sm:max-w-sm" />

        {rows.length === 0 ? (
          <Empty>No ambassadors found. Stats appear once links are clicked.</Empty>
        ) : (
          <>
            <ul className="divide-y divide-border/80 md:hidden">
              {rows.map((r, i) => (
                <li key={r.id} className="py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground">{i + 1}</span>
                      <span className="truncate text-[15px] font-medium text-foreground">{r.name}</span>
                    </span>
                    <KindBadge kind={r.kind} />
                  </div>
                  <p className="mt-1 pl-8 text-[13px] text-muted-foreground">
                    <span className="font-mono">{r.id}</span> · <span className="font-mono text-foreground">{r.stat.clicks}</span> clicks ·{" "}
                    <span className="font-mono text-foreground">{r.stat.orders}</span> orders
                    {conversion(r.stat) != null ? <span className="font-mono"> · {conversion(r.stat)}%</span> : null}
                  </p>
                  <RowActions row={r} readOnly={readOnly} onLog={setLogFor} onMessage={setMessageFor} className="mt-1 pl-6" />
                </li>
              ))}
            </ul>

            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Ambassador</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Conv.</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => {
                    const conv = conversion(r.stat);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <span className="block font-medium text-foreground">{r.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                        </TableCell>
                        <TableCell>
                          <KindBadge kind={r.kind} />
                        </TableCell>
                        <TableCell className={cn("text-right font-mono font-medium", r.stat.clicks ? "text-primary" : "text-subtle")}>
                          {r.stat.clicks}
                        </TableCell>
                        <TableCell className={cn("text-right font-mono font-medium", r.stat.orders ? "text-foreground" : "text-subtle")}>
                          {r.stat.orders}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{conv == null ? <span className="text-subtle">—</span> : `${conv}%`}</TableCell>
                        <TableCell className="text-[13px]">
                          {r.stat.email ? <span className="text-success">Registered</span> : <span className="text-subtle">Not registered</span>}
                        </TableCell>
                        <TableCell>
                          <RowActions row={r} readOnly={readOnly} onLog={setLogFor} onMessage={setMessageFor} className="justify-end" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>

      <BroadcastSection />

      <LogOrderDialog target={logFor} onClose={() => setLogFor(null)} />
      <MessageDialog target={messageFor} onClose={() => setMessageFor(null)} />
      <EditPendingDialog pending={editPending} onClose={() => setEditPending(null)} />
    </div>
  );

  function RowActions({
    row,
    readOnly: ro,
    onLog,
    onMessage,
    className,
  }: {
    row: TrackingRow;
    readOnly: boolean;
    onLog: (t: { id: string; name: string }) => void;
    onMessage: (t: { id: string; name: string }) => void;
    className?: string;
  }) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <Button type="button" variant="ghost" size="sm" disabled={ro} onClick={() => onLog({ id: row.id, name: row.name })}>
          <LuReceipt className="size-4" aria-hidden />
          Log order
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={ro || !row.stat.email}
          title={row.stat.email ? "Send a direct message" : "The ambassador must register their email first"}
          onClick={() => onMessage({ id: row.id, name: row.name })}
        >
          <LuMail className="size-4" aria-hidden />
          Message
        </Button>
      </div>
    );
  }
}

function PendingSection({ onEdit }: { onEdit: (p: PendingRegistration) => void }) {
  const { data, readOnly, flash, reload } = usePanel();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [rejecting, setRejecting] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");

  if (data.pending.length === 0) return null;

  async function decide(p: PendingRegistration, decision: "approve" | "reject") {
    setBusy(p.slotId);
    try {
      const res = await panelCall<{ emailSent: boolean; email?: string }>("approve", { slotId: p.slotId, decision, reason });
      flash(
        "success",
        decision === "approve"
          ? res.emailSent
            ? `${p.slotId} approved — welcome email sent to ${res.email}.`
            : `${p.slotId} approved. Add GMAIL_APP_PASSWORD to send welcome emails.`
          : `${p.slotId} rejected.${res.emailSent ? " The ambassador was emailed." : ""}`
      );
      setRejecting(null);
      setReason("");
      await reload();
    } catch (e) {
      flash("danger", e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="pending-heading" className="space-y-3 rounded-2xl bg-gold/10 p-5">
      <h2 id="pending-heading" className="text-[15px] font-semibold text-foreground">
        {data.pending.length} registration{data.pending.length === 1 ? "" : "s"} awaiting approval
      </h2>
      <p className="text-[13px] text-muted-foreground">Verify each person before approving — approval emails their live link.</p>
      <ul className="divide-y divide-gold/20">
        {data.pending.map((p) => (
          <li key={p.slotId} className="py-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-sm font-medium text-foreground">{p.slotId}</span>
                  <span className="text-[15px] font-medium text-foreground">{p.name}</span>
                  {p.adminCorrected ? <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-medium text-gold">Edited</span> : null}
                </p>
                <p className="mt-0.5 break-words text-[13px] text-muted-foreground">
                  {p.school || "No school"} · {p.email} · {shortDate(p.registeredAt)}
                </p>
              </div>
              {rejecting === p.slotId ? null : (
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" disabled={readOnly || busy !== null} onClick={() => decide(p, "approve")}>
                    {busy === p.slotId ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuCheck className="size-4" aria-hidden />}
                    Approve
                  </Button>
                  <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => onEdit(p)}>
                    <LuPencil className="size-4" aria-hidden />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                    disabled={readOnly}
                    onClick={() => {
                      setRejecting(p.slotId);
                      setReason("");
                    }}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
            {rejecting === p.slotId ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  aria-label="Reason for rejection (optional)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="h-10 bg-card text-sm sm:max-w-xs"
                />
                <div className="flex gap-1.5">
                  <Button size="sm" variant="destructive" disabled={busy !== null} onClick={() => decide(p, "reject")}>
                    <LuX className="size-4" aria-hidden />
                    Confirm
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function BroadcastSection() {
  const { data, readOnly, flash } = usePanel();
  const [open, setOpen] = React.useState(false);
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  return (
    <section aria-labelledby="broadcast-heading" className="space-y-4">
      <SurfaceHeader
        title={<span id="broadcast-heading">Email every ambassador</span>}
        description={
          data.status.email
            ? "Sends to every approved ambassador who registered an email."
            : "Email is off — add GMAIL_APP_PASSWORD to the environment to send."
        }
        action={
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={readOnly || testing || !data.status.email}
              onClick={async () => {
                setTesting(true);
                try {
                  const res = await panelCall<{ message: string }>("test-email", {});
                  flash("success", res.message);
                } catch (e) {
                  flash("danger", e instanceof Error ? e.message : "The test email failed.");
                } finally {
                  setTesting(false);
                }
              }}
            >
              {testing ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuMail className="size-4" aria-hidden />}
              Test email
            </Button>
            <Button type="button" variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? "Close" : "Write a broadcast"}
            </Button>
          </div>
        }
      />

      {open ? (
        <form
          className="space-y-4 rounded-2xl bg-zone p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!subject.trim() || !message.trim()) return flash("danger", "Subject and message are both required.");
            setBusy(true);
            try {
              const res = await panelCall<{ sent: number; failed: number }>("broadcast", { subject, message });
              flash("success", `Sent to ${res.sent} ambassador${res.sent === 1 ? "" : "s"}.${res.failed ? ` ${res.failed} failed.` : ""}`);
              setSubject("");
              setMessage("");
              setOpen(false);
            } catch (err) {
              flash("danger", err instanceof Error ? err.message : "The broadcast failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Subject" htmlFor="bc-subject">
            <Input id="bc-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="bg-card" />
          </Field>
          <Field label="Message" htmlFor="bc-message" hint="Line breaks become paragraphs. Attachments can't be sent here — include a link instead.">
            <Textarea id="bc-message" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} className="bg-card" />
          </Field>
          <Button type="submit" disabled={readOnly || busy || !data.status.email}>
            {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuSend className="size-4" aria-hidden />}
            Send to all ambassadors
          </Button>
        </form>
      ) : null}
    </section>
  );
}
