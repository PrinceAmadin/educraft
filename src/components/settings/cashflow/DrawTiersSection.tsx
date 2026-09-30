"use client";

import * as React from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/forms/FormSection";
import { Cell, HeadRow, NairaInput, SectionViolations } from "./primitives";
import { founderDistributionShareOfRevenue, type Violation } from "@/lib/finance/cashflow-rules";
import type { CashflowStructure, DrawTier } from "@/lib/finance/cashflow-types";
import { cn, formatNaira } from "@/lib/utils";

const GRID = "grid grid-cols-2 sm:grid-cols-[10rem_10rem_10rem_minmax(0,1fr)_2.5rem] items-start gap-3";

export function DrawTiersSection({ structure, onChange, readOnly, violations }: { structure: CashflowStructure; onChange: (next: CashflowStructure) => void; readOnly: boolean; violations: Violation[] }) {
  const share = founderDistributionShareOfRevenue(structure);
  const tiers = structure.founderDrawTiers;
  const patch = (i: number, changes: Partial<DrawTier>) => onChange({ ...structure, founderDrawTiers: tiers.map((t, j) => (j === i ? { ...t, ...changes } : t)) });
  const remove = (i: number) => onChange({ ...structure, founderDrawTiers: tiers.filter((_, j) => j !== i) });
  const add = () => {
    const last = tiers[tiers.length - 1];
    const floor = last ? (last.maxRevenueNgn ?? last.minRevenueNgn) + 1 : 0;
    onChange({ ...structure, founderDrawTiers: [...tiers.map((t, i) => (i === tiers.length - 1 && t.maxRevenueNgn == null ? { ...t, maxRevenueNgn: floor - 1 } : t)), { minRevenueNgn: floor, maxRevenueNgn: null, drawPerFounderNgn: 0 }] });
  };

  return (
    <FormSection
      title="G · Founder monthly draw tiers"
      description={`The month's confirmed revenue picks the bracket; each founder draws that amount from Founder Distribution (${Math.round(share * 1000) / 10}% of revenue). Brackets must follow on with no gap; the last one is open-ended. A bracket whose floor cannot fund two draws is flagged, never blocked.`}
      action={
        !readOnly ? (
          <Button type="button" size="sm" variant="outline" onClick={add}>
            <LuPlus className="size-4" aria-hidden />
            Add tier
          </Button>
        ) : null
      }
    >
      <div>
        <HeadRow columns={["Revenue from", "Revenue to", "Draw per founder", "Funded by the floor?", ""]} className="sm:grid-cols-[10rem_10rem_10rem_minmax(0,1fr)_2.5rem]" />
        <ul className="divide-y divide-border/70">
          {tiers.map((t, i) => {
            const last = i === tiers.length - 1;
            const funds = Math.round(t.minRevenueNgn * share);
            const unfunded = t.drawPerFounderNgn > 0 && funds < 2 * t.drawPerFounderNgn;
            return (
              <li key={i} className={`py-3 ${GRID}`}>
                <Cell label="Revenue from">
                  <NairaInput value={t.minRevenueNgn} disabled={readOnly || i === 0} label={`Tier ${i + 1} floor`} onChange={(n) => patch(i, { minRevenueNgn: n ?? 0 })} />
                </Cell>
                <Cell label="Revenue to">
                  <NairaInput value={t.maxRevenueNgn} disabled={readOnly || last} allowEmpty={last} label={`Tier ${i + 1} ceiling`} onChange={(n) => patch(i, { maxRevenueNgn: n })} />
                </Cell>
                <Cell label="Draw per founder">
                  <NairaInput value={t.drawPerFounderNgn} disabled={readOnly} label={`Tier ${i + 1} draw`} onChange={(n) => patch(i, { drawPerFounderNgn: n ?? 0 })} />
                </Cell>
                <Cell label="Funded by the floor?" className="col-span-2 sm:col-span-1">
                  <p className={cn("pt-2 text-[13px]", unfunded ? "text-gold" : "text-muted-foreground")}>
                    {t.drawPerFounderNgn === 0 ? "No draw" : unfunded ? `Founder Distribution gets ${formatNaira(funds)} at the floor, less than two draws of ${formatNaira(t.drawPerFounderNgn)}` : `Yes: ${formatNaira(funds)} at the floor`}
                  </p>
                </Cell>
                <div className="flex justify-end">
                  {!readOnly && tiers.length > 1 && i > 0 ? (
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete tier ${i + 1}`} onClick={() => remove(i)}>
                      <LuTrash2 className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="pt-3">
          <SectionViolations violations={violations.filter((v) => v.code !== "DRAW_UNFUNDED")} />
        </div>
      </div>
    </FormSection>
  );
}
