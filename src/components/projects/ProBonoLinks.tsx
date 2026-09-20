"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LuCheck,
  LuCircleAlert,
  LuCopy,
  LuLink,
  LuLoaderCircle,
  LuRotateCcw,
  LuSmartphone,
  LuBan,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/forms/Field";
import { FormSection } from "@/components/forms/FormSection";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn, formatDate } from "@/lib/utils";
import type { ProBonoInviteRow } from "@/lib/services/probono";

type ServiceOption = { serviceCode: string; serviceName: string };

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-primary/10 text-primary",
  USED: "bg-success/15 text-success",
  REVOKED: "bg-elevated text-muted-foreground",
};

function linkFor(token: string): string {
  return `${window.location.origin}/probono/${token}`;
}

export function ProBonoLinks({
  services,
  invites,
}: {
  services: ServiceOption[];
  invites: ProBonoInviteRow[];
}) {
  const router = useRouter();
  const [serviceCode, setServiceCode] = React.useState("");
  const [recipient, setRecipient] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);

  async function copy(token: string, id: string) {
    try {
      await navigator.clipboard.writeText(linkFor(token));
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      setError("Could not copy. Select the link and copy it by hand.");
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/probono", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceCode, recipient, reason }),
      });
      const data = (await res.json().catch(() => null)) as
        | (ProBonoInviteRow & { error?: string })
        | null;
      if (!res.ok || !data?.token) throw new Error(data?.error ?? "Could not create the link.");
      setRecipient("");
      setReason("");
      await copy(data.token, data.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the link.");
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: "revoke" | "reset-device") {
    setError(null);
    try {
      const res = await fetch(`/api/admin/probono/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "That did not work.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
    }
  }

  return (
    <div className="space-y-12">
      <form onSubmit={create} className="max-w-2xl">
        <FormSection
          title="New pro bono link"
          description="A one-time intake form with no payment. It locks to the first phone that opens it and expires when the client submits."
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Service" required htmlFor="pb-service">
              <Select id="pb-service" value={serviceCode} onChange={(e) => setServiceCode(e.target.value)}>
                <option value="">Select a service</option>
                {services.map((s) => (
                  <option key={s.serviceCode} value={s.serviceCode}>
                    {s.serviceName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Who is it for?" required htmlFor="pb-recipient" hint="Shown on the form they open">
              <Input id="pb-recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            </Field>
          </div>
          <Field label="Why is it pro bono?" htmlFor="pb-reason" hint="Only admins see this">
            <Input id="pb-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div>
            <Button type="submit" disabled={busy || !serviceCode || recipient.trim().length < 2}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuLink className="size-4" aria-hidden />}
              Create and copy link
            </Button>
          </div>
        </FormSection>
      </form>

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <section>
        <h2 className="text-[15px] font-semibold text-foreground">Links</h2>
        {invites.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon={LuLink}
              title="No pro bono links yet"
              description="Create one above and send it to the client."
            />
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-border/80">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{i.recipient}</p>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[i.status])}>
                      {i.status === "OPEN" ? "Unused" : i.status === "USED" ? "Submitted" : "Revoked"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {i.serviceName} · created {formatDate(i.createdAt)}
                    {i.status === "OPEN"
                      ? i.bound
                        ? ` · locked to a device ${i.boundAt ? formatDate(i.boundAt) : ""}`
                        : " · not opened yet"
                      : ""}
                    {i.usedAt ? ` · submitted ${formatDate(i.usedAt)}` : ""}
                  </p>
                  {i.reason ? <p className="mt-0.5 text-[13px] text-subtle">{i.reason}</p> : null}
                  {i.projectCode ? (
                    <Link
                      href={`/admin/projects/${i.projectCode}`}
                      className="mt-1 inline-block font-mono text-[13px] text-primary hover:underline"
                    >
                      {i.projectCode}
                    </Link>
                  ) : null}
                </div>

                {i.status === "OPEN" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => copy(i.token, i.id)}>
                      {copied === i.id ? (
                        <LuCheck className="size-4" aria-hidden />
                      ) : (
                        <LuCopy className="size-4" aria-hidden />
                      )}
                      {copied === i.id ? "Copied" : "Copy link"}
                    </Button>
                    {i.bound ? (
                      <Button type="button" size="sm" variant="ghost" onClick={() => act(i.id, "reset-device")}>
                        <LuSmartphone className="size-4" aria-hidden />
                        <LuRotateCcw className="size-3.5" aria-hidden />
                        Free device
                      </Button>
                    ) : null}
                    <Button type="button" size="sm" variant="ghost" onClick={() => act(i.id, "revoke")}>
                      <LuBan className="size-4" aria-hidden />
                      Revoke
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-[13px] text-muted-foreground">
          If a client opens the link inside WhatsApp and then switches to their browser, the second device
          is refused. Use Free device to let them open it again.
        </p>
      </section>
    </div>
  );
}
