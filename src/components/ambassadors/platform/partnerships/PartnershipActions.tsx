"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuEye, LuLoaderCircle, LuPencil, LuPlus, LuRefreshCw, LuUserMinus, LuUserPlus } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/forms/Field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TierBadge } from "@/components/ambassadors/TierBadge";
import { EMPTY_PARTNERSHIP, expenseOutcome, PartnershipForm, type PartnershipFormValues, type SchoolOption } from "@/components/ambassadors/platform/partnerships/PartnershipForm";
import type { PartnershipDetail } from "@/lib/services/ambassador-platform/partnerships";
import type { CreatePartnershipInput } from "@/lib/validations/ambassador-platform";
import { FINANCE_DEFAULTS } from "@/lib/finance/commission-config";
import type { AmbassadorTier } from "@prisma/client";
import { formatDate, formatNaira } from "@/lib/utils";

export interface AmbassadorOption {
  id: string;
  ambassadorId: string;
  fullName: string;
}

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: res.ok, data };
}

/** "Add partnership". */
export function AddPartnershipButton({ schools, isFounder }: { schools: SchoolOption[]; isFounder: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  return (
    <>
      <Button type="button" onClick={() => { setNotice(null); setOpen(true); }}>
        <LuPlus className="size-4" aria-hidden />
        Add partnership
      </Button>
      {notice ? <p className="basis-full text-right text-xs text-success" role="status">{notice}</p> : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New partnership</DialogTitle>
            <DialogDescription>A student union or faculty association. The commitment is paid from the Growth Fund against the quarter&apos;s budget.</DialogDescription>
          </DialogHeader>
          {open ? (
            <PartnershipForm
              initial={EMPTY_PARTNERSHIP}
              schools={schools}
              isFounder={isFounder}
              submitLabel="Save partnership"
              onCancel={() => setOpen(false)}
              onSubmit={async (values: CreatePartnershipInput) => {
                const { ok, data } = await send("/api/admin/ambassadors/partnerships", "POST", values);
                if (!ok) return (data?.error as string) ?? "Could not save the partnership.";
                setNotice(expenseOutcome(data?.expense as { approvalStatus: string } | null) ?? "Partnership saved.");
                setOpen(false);
                router.refresh();
                return null;
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function toFormValues(d: PartnershipDetail): PartnershipFormValues {
  return {
    organisationName: d.organisationName,
    school: d.school,
    faculty: d.faculty ?? "",
    contactPerson: d.contactPerson ?? "",
    contactWhatsapp: d.contactWhatsapp ?? "",
    commitmentAmount: d.commitmentAmount,
    whatWeReceive: (d.whatWeReceive as PartnershipFormValues["whatWeReceive"]) ?? "",
    status: d.status as PartnershipFormValues["status"],
    startDate: d.startDate ? d.startDate.slice(0, 10) : "",
    renewalDate: d.renewalDate ? d.renewalDate.slice(0, 10) : "",
    notes: d.notes ?? "",
  };
}

function waLink(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}

/** "View": the partnership detail (contact, terms, Growth Fund payments, projects, renewal, notes) with Edit. */
export function PartnershipView({ id, name, schools, isFounder, ambassadors }: { id: string; name: string; schools: SchoolOption[]; isFounder: boolean; ambassadors: AmbassadorOption[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"view" | "edit">("view");
  const [detail, setDetail] = React.useState<PartnershipDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [linkId, setLinkId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    const { ok, data } = await send(`/api/admin/ambassadors/partnerships/${id}`, "GET");
    if (!ok) setError((data?.error as string) ?? "Could not load the partnership.");
    else setDetail(data as unknown as PartnershipDetail);
  }, [id]);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const linkedIds = new Set(detail?.linkedAmbassadors.map((a) => a.id) ?? []);

  async function act(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const { ok, data } = await send(url, method, body);
    setBusy(false);
    if (!ok) {
      setError((data?.error as string) ?? "Could not update.");
      return;
    }
    setLinkId("");
    await load();
    router.refresh();
  }

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => { setMode("view"); setNotice(null); setOpen(true); }}>
        <LuEye className="size-4" aria-hidden />
        View
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail?.organisationName ?? name}</DialogTitle>
            <DialogDescription>
              {detail ? `${detail.school}${detail.faculty ? ` · ${detail.faculty}` : ""}${detail.createdByName ? ` · added by ${detail.createdByName}` : ""}` : "Loading…"}
            </DialogDescription>
          </DialogHeader>
          {!detail ? (
            error ? <p className="text-sm text-danger">{error}</p> : <LuLoaderCircle className="mx-auto size-5 animate-spin text-muted-foreground" aria-label="Loading" />
          ) : mode === "edit" ? (
            <PartnershipForm
              initial={toFormValues(detail)}
              schools={schools}
              isFounder={isFounder}
              allowInactive
              submitLabel="Save changes"
              onCancel={() => setMode("view")}
              onSubmit={async (values) => {
                const { ok, data } = await send(`/api/admin/ambassadors/partnerships/${id}`, "PATCH", values);
                if (!ok) return (data?.error as string) ?? "Could not save the changes.";
                setNotice(expenseOutcome(data?.expense as { approvalStatus: string } | null));
                setMode("view");
                await load();
                router.refresh();
                return null;
              }}
            />
          ) : (
            <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1 text-sm">
              {notice ? <p className="rounded-xl bg-success/10 px-3 py-2 text-success" role="status">{notice}</p> : null}
              <section>
                <h3 className="meta-label">Contact</h3>
                <p className="mt-1 text-foreground">{detail.contactPerson ?? "No contact person yet"}</p>
                {detail.contactWhatsapp ? (
                  <a href={waLink(detail.contactWhatsapp)} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    WhatsApp {detail.contactWhatsapp}
                  </a>
                ) : null}
              </section>
              <section>
                <h3 className="meta-label">Terms</h3>
                <p className="mt-1 text-foreground">{detail.whatWeReceiveLabel ?? "What EduCraft receives is not agreed yet"}</p>
                <p className="text-muted-foreground">
                  Committed per term: <span className="font-mono text-foreground">{formatNaira(detail.commitmentAmount)}</span>
                  {detail.startDate ? ` · since ${formatDate(detail.startDate)}` : ""}
                </p>
              </section>
              <section>
                <h3 className="meta-label">Sponsorship paid from the Growth Fund</h3>
                <p className="mt-1 font-mono text-base text-foreground">{formatNaira(detail.paid)}</p>
                {detail.pending > 0 ? <p className="text-xs text-gold">{formatNaira(detail.pending)} waiting for the founder&apos;s approval</p> : null}
                {detail.payments.length > 0 ? (
                  <ul className="mt-2 divide-y divide-border/70">
                    {detail.payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                        <span className="min-w-0 truncate text-muted-foreground">
                          {formatDate(p.date)} · {p.description}
                        </span>
                        <span className="shrink-0 font-mono text-foreground">
                          {formatNaira(p.amount)}
                          <span className="ml-2 font-sans text-xs text-muted-foreground">{p.approvalStatus === "PENDING_APPROVAL" ? "awaiting approval" : p.approvalStatus === "DECLINED" ? "declined" : "paid"}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
              <section>
                <h3 className="meta-label">Projects generated</h3>
                <p className="mt-1 text-foreground">
                  <span className="font-mono">{detail.projects}</span> project{detail.projects === 1 ? "" : "s"} from <span className="font-mono">{detail.ambassadors}</span> ambassador{detail.ambassadors === 1 ? "" : "s"} who came in through this partnership
                </p>
                {detail.linkedAmbassadors.length > 0 ? (
                  <ul className="mt-2 divide-y divide-border/70">
                    {detail.linkedAmbassadors.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 py-1.5">
                        <Link href={`/admin/ambassadors/${a.id}`} className="min-w-0 truncate text-foreground hover:text-primary">
                          {a.fullName}
                        </Link>
                        <span className="flex shrink-0 items-center gap-2">
                          <TierBadge tier={a.tier as AmbassadorTier} />
                          <span className="font-mono text-xs text-muted-foreground">{a.projects} proj.</span>
                          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Take ${a.fullName} off this partnership`} disabled={busy} onClick={() => act(`/api/admin/ambassadors/partnerships/${id}/ambassadors/${a.id}`, "DELETE")}>
                            <LuUserMinus className="size-4" aria-hidden />
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <Select value={linkId} onChange={(e) => setLinkId(e.target.value)} className="h-10 text-sm" aria-label="Ambassador who came in through this partnership">
                    <option value="">Add an ambassador who came through it…</option>
                    {ambassadors.filter((a) => !linkedIds.has(a.id)).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.fullName} ({a.ambassadorId})
                      </option>
                    ))}
                  </Select>
                  <Button type="button" size="sm" variant="outline" disabled={!linkId || busy} onClick={() => act(`/api/admin/ambassadors/partnerships/${id}/ambassadors`, "POST", { ambassadorId: linkId })}>
                    <LuUserPlus className="size-4" aria-hidden />
                    Add
                  </Button>
                </div>
              </section>
              <section>
                <h3 className="meta-label">Renewal</h3>
                <p className="mt-1 text-foreground">{detail.renewalDate ? formatDate(detail.renewalDate) : "No renewal date set"}</p>
                {detail.reminderFrom ? <p className="text-xs text-muted-foreground">Reminder on the dashboard from {formatDate(detail.reminderFrom)} (30 days before)</p> : null}
              </section>
              <section>
                <h3 className="meta-label">Notes</h3>
                <p className="mt-1 whitespace-pre-line text-foreground">{detail.notes ?? "No notes yet."}</p>
              </section>
              {error ? (
                <p className="flex items-center gap-1.5 text-danger" role="alert">
                  <LuCircleAlert className="size-4" aria-hidden />
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setNotice(null); setMode("edit"); }}>
                  <LuPencil className="size-4" aria-hidden />
                  Edit details
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** "Renew": next term's payment (defaults to the current commitment) and the next renewal date. */
export function RenewPartnershipButton({ id, name, commitmentAmount, renewalDate, isFounder }: { id: string; name: string; commitmentAmount: number; renewalDate: string | null; isFounder: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const today = new Date().toISOString().slice(0, 10);
  // A year on from the current renewal (or from today when it has already passed); the HOG can change it.
  const base = renewalDate && renewalDate.slice(0, 10) > today ? renewalDate.slice(0, 10) : today;
  const [amount, setAmount] = React.useState(String(commitmentAmount));
  const [next, setNext] = React.useState(addMonths(base, 12));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const over = Number(amount) > FINANCE_DEFAULTS.expenseApprovalThreshold && !isFounder;

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <LuRefreshCw className="size-4" aria-hidden />
        Renew
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Renew {name}</DialogTitle>
            <DialogDescription>The payment for the next term is logged from the Growth Fund; the renewal date moves on.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Amount for the next term (₦)" htmlFor="rn-amount" hint={over ? `Over ${formatNaira(FINANCE_DEFAULTS.expenseApprovalThreshold)}: waits for the founder's approval` : "0 if nothing is paid now"}>
              <Input id="rn-amount" type="number" inputMode="numeric" min={0} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Next renewal date" htmlFor="rn-date">
              <Input id="rn-date" type="date" value={next} min={today} onChange={(e) => setNext(e.target.value)} />
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
                disabled={busy || !next}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  const { ok, data } = await send(`/api/admin/ambassadors/partnerships/${id}/renew`, "POST", { amount: Number(amount) || 0, renewalDate: next });
                  setBusy(false);
                  if (!ok) {
                    setError((data?.error as string) ?? "Could not renew.");
                    return;
                  }
                  setOpen(false);
                  router.refresh();
                }}
              >
                {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuRefreshCw className="size-4" aria-hidden />}
                Renew
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
