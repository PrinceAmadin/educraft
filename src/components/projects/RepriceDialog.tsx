"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle, LuTag, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/forms/Field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { computePrice } from "@/lib/pricing";
import { CHAPTER_SHARES, intakeBasePrice, normalizeChapters } from "@/lib/chapter-pricing";
import { reconcileClientLegs, reconcileSnapshots } from "@/lib/finance/reprice-rules";
import { formatNaira } from "@/lib/utils";
import type { RepriceServiceOption } from "@/lib/services/finance/reprice";

export interface RepriceCurrent {
  serviceId: string;
  serviceVariantId: string | null;
  chapters: number[];
  price: number;
  isExpressDelivery: boolean;
  downpaymentVerified: boolean;
  balanceVerified: boolean;
  moneyIn: number;
  downpaymentAmount: number;
  workerPayoutRate: number;
  workerPayoutPaid: boolean;
  currentWorkerPayout: number | null;
  ambassadorId: string | null;
  ambassadorCommRate: number | null;
  ambassadorCommPaid: boolean;
  currentAmbassadorCommission: number | null;
  parentAmbassadorId: string | null;
  parentCommRate: number | null;
  parentCommPaid: boolean;
  currentParentCommission: number | null;
}

/** Super admin: correct a paid project's service / option / price. */
export function RepriceDialog({
  projectCode,
  services,
  current,
}: {
  projectCode: string;
  services: RepriceServiceOption[];
  current: RepriceCurrent;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [serviceId, setServiceId] = React.useState(current.serviceId);
  const [variantId, setVariantId] = React.useState(current.serviceVariantId ?? "");
  const [chapters, setChapters] = React.useState<number[]>(current.chapters);
  const [overrideStr, setOverrideStr] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const svc = services.find((s) => s.id === serviceId) ?? services.find((s) => s.id === current.serviceId) ?? services[0];

  // Reset the option and chapters when the service changes.
  function pickService(id: string) {
    setServiceId(id);
    setVariantId("");
    const next = services.find((s) => s.id === id);
    if (!next?.isChapterService) setChapters([]);
    else if (chapters.length === 0) setChapters([1]);
  }

  function toggleChapter(n: number) {
    setChapters((prev) => (prev.includes(n) ? prev.filter((c) => c !== n) : [...prev, n].sort((a, b) => a - b)));
  }

  if (!svc) return null;

  const variant = svc.variants.find((v) => v.id === variantId) ?? null;
  const variantAddon = variant?.priceAddon ?? 0;
  const chapterList = svc.isChapterService ? normalizeChapters(chapters) : [];
  const overrideNum = overrideStr.trim() === "" ? null : Number(overrideStr);
  const override = overrideNum != null && Number.isFinite(overrideNum) && overrideNum >= 0 ? Math.round(overrideNum) : null;

  const base = intakeBasePrice({ serviceCode: svc.serviceCode, basePrice: svc.basePrice, variantAddon, chapters: chapterList });
  const breakdown = computePrice({
    basePrice: base,
    expressSurcharge: svc.expressDeliverySurcharge ?? 0,
    isExpressDelivery: current.isExpressDelivery,
    downpaymentPercentage: svc.downpaymentPercentage,
    override,
  });
  const newPrice = breakdown.total;

  const legs = reconcileClientLegs({
    newPrice,
    moneyIn: current.moneyIn,
    downpaymentVerified: current.downpaymentVerified,
    balanceVerified: current.balanceVerified,
    downpaymentPercentage: svc.downpaymentPercentage,
    currentDownpaymentAmount: current.downpaymentAmount,
  });
  const snaps = reconcileSnapshots({
    newPrice,
    workerPayoutRate: current.workerPayoutRate,
    workerPayoutPaid: current.workerPayoutPaid,
    currentWorkerPayout: current.currentWorkerPayout,
    ambassadorId: current.ambassadorId,
    ambassadorCommRate: current.ambassadorCommRate,
    ambassadorCommPaid: current.ambassadorCommPaid,
    currentAmbassadorCommission: current.currentAmbassadorCommission,
    parentAmbassadorId: current.parentAmbassadorId,
    parentCommRate: current.parentCommRate,
    parentCommPaid: current.parentCommPaid,
    currentParentCommission: current.currentParentCommission,
  });

  const chaptersMissing = svc.isChapterService && chapterList.length === 0;
  const canSubmit = reason.trim().length >= 3 && newPrice > 0 && !chaptersMissing && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { reason, serviceVariantId: variantId === "" ? null : variantId };
      if (serviceId !== current.serviceId) body.serviceId = serviceId;
      if (svc!.isChapterService) body.chapters = chapterList;
      if (override != null) body.priceOverride = override;

      const res = await fetch(`/api/admin/projects/${projectCode}/reprice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not reprice this project.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reprice this project.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <LuTag className="size-4" aria-hidden />
        Change service / reprice
      </Button>

      <Dialog open={open} onOpenChange={(v) => (busy ? null : setOpen(v))}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Change service or price</DialogTitle>
            <DialogDescription>
              Correct the service or option. The money already paid is re-applied against the new price —
              an overpaid downpayment reduces the balance still owed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Service" htmlFor="rp-service">
              <Select id="rp-service" value={serviceId} onChange={(e) => pickService(e.target.value)}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.serviceName}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Option" htmlFor="rp-variant" hint="Add-ons such as “With Data Analysis”.">
              <Select id="rp-variant" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                <option value="">None</option>
                {svc.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} (+{formatNaira(v.priceAddon)})
                  </option>
                ))}
              </Select>
            </Field>

            {svc.isChapterService ? (
              <Field label="Chapters" htmlFor="rp-ch1">
                <div className="flex flex-wrap gap-2">
                  {CHAPTER_SHARES.map((c) => {
                    const on = chapters.includes(c.chapter);
                    return (
                      <button
                        key={c.chapter}
                        id={c.chapter === 1 ? "rp-ch1" : undefined}
                        type="button"
                        onClick={() => toggleChapter(c.chapter)}
                        className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                          on ? "bg-accent text-accent-foreground" : "bg-input text-foreground"
                        }`}
                      >
                        Ch {c.chapter} · {c.percent}%
                      </button>
                    );
                  })}
                </div>
              </Field>
            ) : null}

            <Field label="Manual price override" htmlFor="rp-override" hint="Optional — leave blank to use the computed price.">
              <Input
                id="rp-override"
                type="number"
                inputMode="numeric"
                min={0}
                value={overrideStr}
                onChange={(e) => setOverrideStr(e.target.value)}
                placeholder={formatNaira(breakdown.total)}
              />
            </Field>

            {/* Live preview */}
            <div className="rounded-2xl bg-zone p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">New total</span>
                <span className="font-mono tabular-nums text-foreground">
                  {formatNaira(current.price)} → <span className="font-semibold">{formatNaira(newPrice)}</span>
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-muted-foreground">Already paid</span>
                <span className="font-mono tabular-nums text-foreground">{formatNaira(current.moneyIn)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-muted-foreground">{legs.balanceStatus === "Verified" ? "Balance" : "Client still owes"}</span>
                <span className="font-mono tabular-nums text-foreground">
                  {legs.balanceStatus === "Verified" ? "Fully paid" : formatNaira(legs.remaining)}
                </span>
              </div>

              {legs.overpayment > 0 ? (
                <p className="mt-3 flex items-start gap-2 text-gold">
                  <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {formatNaira(legs.overpayment)} overpaid — a refund will be flagged to finance.
                </p>
              ) : null}
              {legs.balanceReopened ? (
                <p className="mt-2 flex items-start gap-2 text-gold">
                  <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  The new price is above what was paid, so the balance re-opens.
                </p>
              ) : null}
              {snaps.recoveries
                .filter((r) => r.delta !== 0)
                .map((r) => (
                  <p key={r.recipient} className="mt-2 flex items-start gap-2 text-gold">
                    <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {r.recipient} was already paid {formatNaira(r.paid)}; at the new price it is {formatNaira(r.shouldBe)}.{" "}
                    {r.delta > 0 ? `Recover ${formatNaira(r.delta)} by hand.` : `They are owed ${formatNaira(-r.delta)} more.`}
                  </p>
                ))}
            </div>

            <Field label="Why is this changing?" required htmlFor="rp-reason" hint="Only admins see this.">
              <Input
                id="rp-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Implementation-based project, not data analysis"
              />
            </Field>

            {error ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-danger">
                <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={submit}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Apply new price
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
