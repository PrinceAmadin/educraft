"use client";

import * as React from "react";
import { FormSection } from "@/components/forms/FormSection";
import { Cell, CountInput, HeadRow, NairaInput, PercentInput, SectionViolations } from "./primitives";
import { coreOverrideFor, type Violation } from "@/lib/finance/cashflow-rules";
import { TIER_KEYS, TIER_LABELS, recipientsPercent, type CashflowStructure, type TierRule } from "@/lib/finance/cashflow-types";
import { cn } from "@/lib/utils";

const GRID = "grid grid-cols-2 sm:grid-cols-[minmax(0,1.2fr)_7rem_7rem_7rem_9rem] items-start gap-3";

export function TiersSection({ structure, onChange, readOnly, violations }: { structure: CashflowStructure; onChange: (next: CashflowStructure) => void; readOnly: boolean; violations: Violation[] }) {
  const ambassadorTotal = recipientsPercent(structure, "ambassadors");
  const platinumBonus = structure.bonuses.find((b) => b.key === "platinum_per_client");
  const patch = (key: TierRule["key"], changes: Partial<TierRule>) => onChange({ ...structure, tiers: structure.tiers.map((t) => (t.key === key ? { ...t, ...changes } : t)) });
  const tiers = TIER_KEYS.map((k) => structure.tiers.find((t) => t.key === k)).filter((t): t is TierRule => Boolean(t));

  return (
    <>
      <FormSection title="D · Ambassador tiers" description="Lifetime paying clients referred decide the tier; the tier decides the rate. The bands must follow on from each other with no gap. Publishing a change re-derives every ambassador's tier.">
        <div>
          <HeadRow columns={["Tier", "From", "To", "Rate", "Quarterly bonus"]} className="sm:grid-cols-[minmax(0,1.2fr)_7rem_7rem_7rem_9rem]" />
          <ul className="divide-y divide-border/70">
            {tiers.map((t, i) => {
              const top = i === tiers.length - 1;
              return (
                <li key={t.key} className={`py-3 ${GRID}`}>
                  <Cell label="Tier" className="col-span-2 sm:col-span-1">
                    <p className="pt-2 text-sm font-medium text-foreground">{TIER_LABELS[t.key]}</p>
                  </Cell>
                  <Cell label="From">
                    <CountInput value={t.minConversions} disabled={readOnly || i === 0} label={`${TIER_LABELS[t.key]} minimum conversions`} onChange={(n) => patch(t.key, { minConversions: n ?? 0 })} />
                  </Cell>
                  <Cell label="To">
                    {top ? <p className="pt-2 text-sm text-muted-foreground">and up</p> : <CountInput value={t.maxConversions} disabled={readOnly} label={`${TIER_LABELS[t.key]} maximum conversions`} onChange={(n) => patch(t.key, { maxConversions: n })} />}
                  </Cell>
                  <Cell label="Rate">
                    <PercentInput value={t.ratePercent} disabled={readOnly} label={`${TIER_LABELS[t.key]} rate`} onChange={(n) => patch(t.key, { ratePercent: n })} />
                  </Cell>
                  <Cell label="Quarterly bonus">
                    {t.key === "PLATINUM" && platinumBonus ? (
                      <NairaInput value={platinumBonus.amountNgn} disabled={readOnly} label="Platinum quarterly bonus per client" onChange={(n) => onChange({ ...structure, bonuses: structure.bonuses.map((b) => (b.key === "platinum_per_client" ? { ...b, amountNgn: n ?? 0 } : b)) })} />
                    ) : (
                      <p className="pt-2 text-sm text-muted-foreground">—</p>
                    )}
                    {t.key === "PLATINUM" ? <span className="mt-1 block text-[11px] text-muted-foreground">per client referred in the quarter</span> : null}
                  </Cell>
                </li>
              );
            })}
          </ul>
          <div className="pt-3">
            <SectionViolations violations={violations.filter((v) => v.level === "tiers")} />
          </div>
        </div>
      </FormSection>

      <FormSection title="E · Core / Sub override" description={`Derived, never typed: EduCraft pays ${ambassadorTotal}% in total on a referred project (the Ambassador row). The Sub keeps their tier rate and the Core earns the rest.`}>
        <div>
          <HeadRow columns={["Sub's tier", "Sub earns", "Core override", "EduCraft pays"]} className="sm:grid-cols-[minmax(0,1.2fr)_7rem_7rem_7rem]" />
          <ul className="divide-y divide-border/70">
            {tiers.map((t) => {
              const override = coreOverrideFor(t.ratePercent, structure);
              const over = t.ratePercent > ambassadorTotal + 0.005;
              return (
                <li key={t.key} className="grid grid-cols-2 items-center gap-3 py-3 sm:grid-cols-[minmax(0,1.2fr)_7rem_7rem_7rem]">
                  <p className="col-span-2 text-sm font-medium text-foreground sm:col-span-1">{TIER_LABELS[t.key]}</p>
                  <p className={cn("font-mono text-sm tabular-nums", over ? "text-danger" : "text-foreground")}>{t.ratePercent}%</p>
                  <p className="font-mono text-sm tabular-nums text-foreground">{override}%</p>
                  <p className={cn("font-mono text-sm tabular-nums", over ? "text-danger" : "text-muted-foreground")}>{over ? `${t.ratePercent}% — over the total` : `${ambassadorTotal}%`}</p>
                </li>
              );
            })}
          </ul>
          <div className="pt-3">
            <SectionViolations violations={violations.filter((v) => v.level === "overrides")} />
          </div>
        </div>
      </FormSection>
    </>
  );
}
