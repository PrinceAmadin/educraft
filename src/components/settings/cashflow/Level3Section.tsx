"use client";

import * as React from "react";
import type { BucketType } from "@prisma/client";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/forms/Field";
import { FormSection } from "@/components/forms/FormSection";
import { AbsorberPicker, Cell, HeadRow, LevelFooter, PercentInput, SectionViolations, keyFromLabel } from "./primitives";
import { autoBalance, levelTotal, type Violation } from "@/lib/finance/cashflow-rules";
import { BUCKET_KEYS, potsOf, type CashflowStructure, type PotRow } from "@/lib/finance/cashflow-types";

const GRID = "grid grid-cols-2 sm:grid-cols-[minmax(0,2fr)_7rem_6rem_2.5rem] items-start gap-3";

export function Level3Section({ structure, onChange, readOnly, violations }: { structure: CashflowStructure; onChange: (next: CashflowStructure) => void; readOnly: boolean; violations: Violation[] }) {
  const [adding, setAdding] = React.useState<BucketType | null>(null);
  const [balanceErrors, setBalanceErrors] = React.useState<Partial<Record<BucketType, string | null>>>({});
  const patch = (key: string, parentKey: BucketType, changes: Partial<PotRow>) =>
    onChange({ ...structure, level3: structure.level3.map((p) => (p.key === key && p.parentKey === parentKey ? { ...p, ...changes } : p)) });
  const remove = (key: string, parentKey: BucketType) => onChange({ ...structure, level3: structure.level3.filter((p) => !(p.key === key && p.parentKey === parentKey)) });
  const bucketsWithPots = BUCKET_KEYS.filter((b) => potsOf(structure, b).length > 0);
  const labelOf = (b: BucketType) => structure.level2.find((x) => x.key === b)?.label ?? b;

  return (
    <FormSection
      title="C · Pots inside a bucket"
      description="A bucket can be split into tracked pots (the Claude API pot feeds the AI usage tab). Each bucket's pots add up to 100% of that bucket; a bucket with no pots is simply held whole."
      action={
        !readOnly ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding("OPERATIONS_RESERVE")}>
            <LuPlus className="size-4" aria-hidden />
            Add pot
          </Button>
        ) : null
      }
    >
      {bucketsWithPots.length === 0 ? <p className="text-sm text-muted-foreground">No pots yet.</p> : null}
      <div className="space-y-8">
        {bucketsWithPots.map((bucket) => {
          const pots = potsOf(structure, bucket);
          const absorber = pots.find((p) => p.isAbsorber) ?? null;
          return (
            <div key={bucket}>
              <h3 className="text-sm font-semibold text-foreground">{labelOf(bucket)}</h3>
              <HeadRow columns={["Pot", "Of the bucket", "Tracked", ""]} className="mt-2 sm:grid-cols-[minmax(0,2fr)_7rem_6rem_2.5rem]" />
              <ul className="divide-y divide-border/70">
                {pots.map((p) => (
                  <li key={p.key} className={`py-3 ${GRID}`}>
                    <Cell label="Pot" className="col-span-2 sm:col-span-1">
                      <Input value={p.label} disabled={readOnly} aria-label={`${p.label} name`} onChange={(e) => patch(p.key, bucket, { label: e.target.value })} className="h-10 text-sm" />
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        <span className="font-mono">{p.key}</span>
                        {p.description ? ` · ${p.description}` : ""}
                      </span>
                    </Cell>
                    <Cell label="Of the bucket">
                      <PercentInput value={p.percentage} disabled={readOnly} label={`${p.label} percentage`} onChange={(n) => patch(p.key, bucket, { percentage: n })} />
                    </Cell>
                    <Cell label="Tracked">
                      <label className="flex h-10 items-center gap-2 text-sm text-foreground">
                        <input type="checkbox" className="size-4 accent-primary" checked={p.isTrackedAsPot} disabled={readOnly} onChange={(e) => patch(p.key, bucket, { isTrackedAsPot: e.target.checked })} />
                        {p.isTrackedAsPot ? "Yes" : "No"}
                      </label>
                    </Cell>
                    <div className="flex justify-end">
                      {!readOnly ? (
                        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${p.label}`} onClick={() => remove(p.key, bucket)}>
                          <LuTrash2 className="size-4" aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              <LevelFooter
                total={levelTotal(pots)}
                of={labelOf(bucket)}
                disabled={readOnly}
                absorber={<AbsorberPicker options={pots.map((p) => ({ key: p.key, label: p.label }))} value={absorber?.key ?? null} onChange={(key) => onChange({ ...structure, level3: structure.level3.map((p) => (p.parentKey === bucket ? { ...p, isAbsorber: p.key === key } : p)) })} disabled={readOnly} />}
                onBalance={() => {
                  const r = autoBalance(structure, { level: "level3", bucket });
                  if (r.ok) {
                    setBalanceErrors((e) => ({ ...e, [bucket]: null }));
                    onChange(r.structure);
                  } else setBalanceErrors((e) => ({ ...e, [bucket]: r.error }));
                }}
                balanceError={balanceErrors[bucket] ?? null}
              >
                <SectionViolations violations={violations.filter((v) => v.rowKey === bucket || pots.some((p) => p.key === v.rowKey))} />
              </LevelFooter>
            </div>
          );
        })}
      </div>
      <SectionViolations violations={violations.filter((v) => !BUCKET_KEYS.includes(v.rowKey as BucketType) && !structure.level3.some((p) => p.key === v.rowKey))} />
      <AddPotDialog
        open={adding != null}
        initialBucket={adding ?? "OPERATIONS_RESERVE"}
        buckets={structure.level2.map((b) => ({ key: b.key, label: b.label }))}
        taken={structure.level3.map((p) => p.key)}
        onClose={() => setAdding(null)}
        onAdd={(pot) => onChange({ ...structure, level3: [...structure.level3, pot] })}
      />
    </FormSection>
  );
}

function AddPotDialog({ open, initialBucket, buckets, taken, onClose, onAdd }: { open: boolean; initialBucket: BucketType; buckets: { key: BucketType; label: string }[]; taken: string[]; onClose: () => void; onAdd: (pot: PotRow) => void }) {
  const [label, setLabel] = React.useState("");
  const [parentKey, setParentKey] = React.useState<BucketType>(initialBucket);
  const [percentage, setPercentage] = React.useState(0);
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => setParentKey(initialBucket), [initialBucket]);

  function reset() {
    setLabel("");
    setPercentage(0);
    setDescription("");
    setError(null);
  }
  function submit() {
    if (label.trim().length < 2) {
      setError("Give the pot a name");
      return;
    }
    onAdd({ key: keyFromLabel(label, taken), label: label.trim(), parentKey, percentage, isTrackedAsPot: true, ...(description.trim() ? { description: description.trim() } : {}) });
    reset();
    onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a pot</DialogTitle>
          <DialogDescription>A tracked share of one bucket. Its percentage is of that bucket; balance the bucket&apos;s pots to 100% afterwards.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Pot" required htmlFor="new-pot-label">
            <Input id="new-pot-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Legal" />
          </Field>
          <Field label="Which bucket" required htmlFor="new-pot-bucket">
            <Select id="new-pot-bucket" value={parentKey} onChange={(e) => setParentKey(e.target.value as BucketType)}>
              {buckets.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Share of the bucket" required>
            <PercentInput value={percentage} onChange={setPercentage} label="Share of the bucket" />
          </Field>
          <Field label="What it pays for" htmlFor="new-pot-description">
            <Input id="new-pot-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" maxLength={160} />
          </Field>
          {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }}>
              Cancel
            </Button>
            <Button type="button" onClick={submit}>
              Add pot
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
