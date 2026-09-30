"use client";

import * as React from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormSection } from "@/components/forms/FormSection";
import { Cell, CountInput, HeadRow, NairaInput, SectionViolations, keyFromLabel } from "./primitives";
import type { Violation } from "@/lib/finance/cashflow-rules";
import { BONUS_RECIPIENT_LABELS, type BonusCadence, type BonusRecipient, type BonusRule, type CashflowStructure } from "@/lib/finance/cashflow-types";

const GROUPS: { recipient: BonusRecipient[]; title: string; addAs: BonusRecipient | null }[] = [
  { recipient: ["hog"], title: "Head of Growth", addAs: "hog" },
  { recipient: ["coo"], title: "COO", addAs: "coo" },
  { recipient: ["platinum_ambassador", "any_ambassador"], title: "Ambassadors", addAs: null },
];
/** The two ambassador bonuses the platform's tracker reads by key; they can be edited, never deleted. */
const FIXED = new Set(["platinum_per_client", "quarterly_challenge"]);

const GRID = "grid grid-cols-2 sm:grid-cols-[minmax(0,2fr)_9rem_7rem_6rem_2.5rem] items-start gap-3";

export function BonusesSection({ structure, onChange, readOnly, violations }: { structure: CashflowStructure; onChange: (next: CashflowStructure) => void; readOnly: boolean; violations: Violation[] }) {
  const patch = (key: string, changes: Partial<BonusRule>) => onChange({ ...structure, bonuses: structure.bonuses.map((b) => (b.key === key ? { ...b, ...changes } : b)) });
  const remove = (key: string) => onChange({ ...structure, bonuses: structure.bonuses.filter((b) => b.key !== key) });
  const add = (recipient: BonusRecipient) => {
    const label = "New bonus";
    onChange({ ...structure, bonuses: [...structure.bonuses, { key: keyFromLabel(`${recipient}_${label}_${structure.bonuses.length + 1}`, structure.bonuses.map((b) => b.key)), recipient, label, condition: "", amountNgn: 0, cadence: "monthly" }] });
  };

  return (
    <FormSection title="F · Performance bonuses" description="Entered on the payout run by the CFO when the condition is met. The amounts here prefill the entry; the Platinum per-client bonus and the quarterly challenge are what the ambassador tracker pays.">
      <div className="space-y-8">
        {GROUPS.map((g) => {
          const rows = structure.bonuses.filter((b) => g.recipient.includes(b.recipient));
          return (
            <div key={g.title}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">{g.title}</h3>
                {!readOnly && g.addAs ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => add(g.addAs!)}>
                    <LuPlus className="size-4" aria-hidden />
                    Add bonus
                  </Button>
                ) : null}
              </div>
              <HeadRow columns={["Bonus", "Amount", "Cadence", "Target", ""]} className="mt-2 sm:grid-cols-[minmax(0,2fr)_9rem_7rem_6rem_2.5rem]" />
              {rows.length === 0 ? <p className="py-3 text-sm text-muted-foreground">None.</p> : null}
              <ul className="divide-y divide-border/70">
                {rows.map((b) => (
                  <li key={b.key} className={`py-3 ${GRID}`}>
                    <Cell label="Bonus" className="col-span-2 sm:col-span-1">
                      <Input value={b.label} disabled={readOnly} aria-label={`${b.label} name`} onChange={(e) => patch(b.key, { label: e.target.value })} className="h-10 text-sm" />
                      <Input value={b.condition} disabled={readOnly} aria-label={`${b.label} condition`} onChange={(e) => patch(b.key, { condition: e.target.value })} className="mt-1.5 h-9 text-[13px]" placeholder="The condition, in plain words" />
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {BONUS_RECIPIENT_LABELS[b.recipient]}
                        {b.perClient ? " · per client" : ""}
                        {b.metric ? ` · judged on ${b.metric.key} ${b.metric.op} ${b.metric.value}` : ""}
                      </span>
                    </Cell>
                    <Cell label="Amount">
                      <NairaInput value={b.amountNgn} disabled={readOnly} label={`${b.label} amount`} onChange={(n) => patch(b.key, { amountNgn: n ?? 0 })} />
                    </Cell>
                    <Cell label="Cadence">
                      <Select value={b.cadence} disabled={readOnly} aria-label={`${b.label} cadence`} onChange={(e) => patch(b.key, { cadence: e.target.value as BonusCadence })} className="h-10 text-sm">
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                      </Select>
                    </Cell>
                    <Cell label="Target">
                      {b.key === "quarterly_challenge" ? (
                        <CountInput value={b.target ?? null} disabled={readOnly} label="Challenge target" onChange={(n) => patch(b.key, { target: n ?? undefined })} placeholder="clients" />
                      ) : (
                        <p className="pt-2 text-sm text-muted-foreground">—</p>
                      )}
                    </Cell>
                    <div className="flex justify-end">
                      {!readOnly && !FIXED.has(b.key) ? (
                        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${b.label}`} onClick={() => remove(b.key)}>
                          <LuTrash2 className="size-4" aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <SectionViolations violations={violations} />
    </FormSection>
  );
}
