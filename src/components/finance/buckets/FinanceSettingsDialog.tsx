"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle, LuSettings2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/Field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FinanceSettings } from "@/lib/services/finance/settings";

/** The three finance numbers the founder sets without a deploy: operating cost, the reference month, the HOG budget. */
export function FinanceSettingsDialog({ settings }: { settings: FinanceSettings }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [baseline, setBaseline] = React.useState(String(settings.operatingCostMonthlyBaseline));
  const [reference, setReference] = React.useState(String(settings.bucketReferenceRevenue));
  const [hogBudget, setHogBudget] = React.useState(String(settings.hogSponsorshipBudgetQuarterly));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatingCostMonthlyBaseline: Number(baseline), bucketReferenceRevenue: Number(reference), hogSponsorshipBudgetQuarterly: Number(hogBudget) }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "The settings could not be saved.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The settings could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <LuSettings2 className="size-4" aria-hidden />
        Finance settings
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finance settings</DialogTitle>
            <DialogDescription>The numbers the bucket health rules, the semester analysis and the HOG budget read. Whole naira.</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={submit}>
            <Field label="Operating cost per month" htmlFor="fs-baseline" hint="Operations Reserve is judged against three months of this">
              <Input id="fs-baseline" type="number" inputMode="numeric" min={0} step={1000} value={baseline} onChange={(e) => setBaseline(e.target.value)} />
            </Field>
            <Field label="Reference monthly revenue" htmlFor="fs-reference" hint="What the other three buckets are measured against">
              <Input id="fs-reference" type="number" inputMode="numeric" min={0} step={10000} value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            <Field label="HOG sponsorship budget per quarter" htmlFor="fs-hog" hint="From the Growth Fund">
              <Input id="fs-hog" type="number" inputMode="numeric" min={0} step={1000} value={hogBudget} onChange={(e) => setHogBudget(e.target.value)} />
            </Field>
            {error ? (
              <p className="flex items-start gap-2 text-sm text-danger">
                <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                Save settings
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
