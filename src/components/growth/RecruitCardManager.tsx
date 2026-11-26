"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuDownload, LuLoaderCircle, LuPlus } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/Field";
import { Select } from "@/components/ui/select";
import type { RecruitCardView } from "@/lib/services/growth/recruit-cards";

/**
 * Mint and retire printed card designs, and download each one's QR at print
 * size.
 *
 * One design per person handing cards out, not one per card: a unique code per
 * card would mean variable-data printing, which is not worth it at what a card
 * costs. So three executives handing out three hundred cards is three designs.
 *
 * The print count and unit cost are typed in because only the founder knows
 * them, and without them there is no cost per application — which is the
 * number that says which designs to print again.
 */
export function RecruitCardManager({
  cards,
  holders,
  universities,
  qrByCode,
}: {
  cards: RecruitCardView[];
  holders: { id: string; name: string; type: "HOG" | "AMBASSADOR" }[];
  universities: { id: string; name: string }[];
  qrByCode: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/growth/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "That did not work.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("That did not work.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const holder = String(form.get("holder") ?? "");
    const [holderType, holderId] = holder.split(":");
    const created = await post({
      holderType,
      holderId,
      label: form.get("label"),
      batch: form.get("batch"),
      universityId: form.get("universityId") || null,
      printedCount: form.get("printedCount"),
      unitCostNgn: form.get("unitCostNgn"),
    });
    if (created) setOpen(false);
  }

  return (
    <section className="space-y-4" aria-label="Printed card designs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Card designs</h2>
          <p className="text-[13px] text-muted-foreground">
            One design per person handing cards out. Each one&apos;s QR opens the join page and credits them.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setOpen((v) => !v)}>
          <LuPlus className="size-4" aria-hidden />
          New design
        </Button>
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {open ? (
        <form onSubmit={onCreate} className="bg-zone space-y-5 rounded-xl p-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Who hands these out" htmlFor="holder">
              <Select id="holder" name="holder" required defaultValue="">
                <option value="" disabled>
                  Choose someone
                </option>
                {holders.map((h) => (
                  <option key={`${h.type}:${h.id}`} value={`${h.type}:${h.id}`}>
                    {h.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Name for this design" htmlFor="label" hint="So you can tell runs apart later.">
              <Input id="label" name="label" required placeholder="Prince — December run" />
            </Field>
            <Field label="Print run" htmlFor="batch" hint="Optional.">
              <Input id="batch" name="batch" placeholder="2026-12-EUI" />
            </Field>
            <Field label="School this run is for" htmlFor="universityId" hint="Optional. Where the cards are going, not where applicants come from.">
              <Select id="universityId" name="universityId" defaultValue="">
                <option value="">Not set</option>
                {universities.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="How many printed" htmlFor="printedCount" hint="Optional, but needed for cost per application.">
              <Input id="printedCount" name="printedCount" inputMode="numeric" placeholder="100" />
            </Field>
            <Field label="Cost per card" htmlFor="unitCostNgn" hint="In naira.">
              <Input id="unitCostNgn" name="unitCostNgn" inputMode="numeric" placeholder="150" />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Create the design
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No designs yet. Create one, download its QR and send that to the printer.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {cards.map((card) => (
            <li key={card.id} className="flex flex-wrap items-start gap-4 py-4">
              {qrByCode[card.code] ? (
                /* eslint-disable-next-line @next/next/no-img-element -- a generated data URL, not a file */
                <img
                  src={qrByCode[card.code]}
                  alt={`QR code for ${card.label}`}
                  className="size-20 shrink-0 rounded-lg bg-white p-1"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">
                  {card.label}
                  {card.status !== "ACTIVE" ? (
                    <span className="ml-2 text-[13px] font-normal text-muted-foreground">Retired</span>
                  ) : null}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {card.holderName ?? "Holder missing"}
                  {card.universityName ? ` · ${card.universityName}` : ""}
                  {card.batch ? ` · ${card.batch}` : ""}
                </p>
                <p className="mt-1 break-all font-mono text-[12px] text-muted-foreground">{card.scanUrl}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {qrByCode[card.code] ? (
                  <a
                    href={qrByCode[card.code]}
                    download={`educraft-card-${card.code}.png`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-foreground hover:bg-zone"
                  >
                    <LuDownload className="size-4" aria-hidden />
                    QR
                  </a>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void post({ action: card.status === "ACTIVE" ? "retire" : "activate", id: card.id })}
                >
                  {card.status === "ACTIVE" ? "Retire" : "Bring back"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
