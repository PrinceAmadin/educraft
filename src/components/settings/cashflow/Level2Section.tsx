"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { FormSection } from "@/components/forms/FormSection";
import { AbsorberPicker, Cell, HeadRow, LevelFooter, PercentInput, SectionViolations } from "./primitives";
import { autoBalance, levelTotal, type Violation } from "@/lib/finance/cashflow-rules";
import { retainedFraction, type BucketRow, type CashflowStructure } from "@/lib/finance/cashflow-types";

const GRID = "grid grid-cols-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_7rem_7rem] items-start gap-3";

export function Level2Section({ structure, onChange, readOnly, violations }: { structure: CashflowStructure; onChange: (next: CashflowStructure) => void; readOnly: boolean; violations: Violation[] }) {
  const [balanceError, setBalanceError] = React.useState<string | null>(null);
  const retained = retainedFraction(structure);
  const absorber = structure.level2.find((b) => b.isAbsorber) ?? null;
  const patch = (key: BucketRow["key"], changes: Partial<BucketRow>) => onChange({ ...structure, level2: structure.level2.map((b) => (b.key === key ? { ...b, ...changes } : b)) });

  return (
    <FormSection
      title="B · Bucket allocation"
      description={`How EduCraft's retained share (${Math.round(retained * 1000) / 10}% of a standard referred project) is split into the four buckets. Percentages are of the retained share and must add up to 100%. Each bucket fills in proportion to the money that comes in.`}
    >
      <div>
        <HeadRow columns={["Bucket", "Held by", "Of retained", "Of revenue"]} className="sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_7rem_7rem]" />
        <ul className="divide-y divide-border/70">
          {structure.level2.map((b) => (
            <li key={b.key} className={`py-3 ${GRID}`}>
              <Cell label="Bucket" className="col-span-2 sm:col-span-1">
                <Input value={b.label} disabled={readOnly} aria-label={`${b.label} name`} onChange={(e) => patch(b.key, { label: e.target.value })} className="h-10 text-sm" />
                <span className="mt-1 block text-[11px] text-muted-foreground">{b.purpose}</span>
              </Cell>
              <Cell label="Held by" className="col-span-2 sm:col-span-1">
                <Input value={b.holder ?? ""} disabled={readOnly} aria-label={`${b.label} holder`} onChange={(e) => patch(b.key, { holder: e.target.value })} className="h-10 text-sm" placeholder="Who holds it" />
              </Cell>
              <Cell label="Of retained">
                <PercentInput value={b.percentage} disabled={readOnly} label={`${b.label} percentage of retained`} onChange={(n) => patch(b.key, { percentage: n })} />
              </Cell>
              <Cell label="Of revenue">
                <p className="pt-2 font-mono text-sm tabular-nums text-muted-foreground">{Math.round(b.percentage * retained * 100) / 100}%</p>
              </Cell>
            </li>
          ))}
        </ul>
        <LevelFooter
          total={levelTotal(structure.level2)}
          of="the retained share"
          disabled={readOnly}
          absorber={<AbsorberPicker options={structure.level2.map((b) => ({ key: b.key, label: b.label }))} value={absorber?.key ?? null} onChange={(key) => onChange({ ...structure, level2: structure.level2.map((b) => ({ ...b, isAbsorber: b.key === key })) })} disabled={readOnly} />}
          onBalance={() => {
            const r = autoBalance(structure, { level: "level2" });
            if (r.ok) {
              setBalanceError(null);
              onChange(r.structure);
            } else setBalanceError(r.error);
          }}
          balanceError={balanceError}
        >
          <SectionViolations violations={violations} />
        </LevelFooter>
      </div>
    </FormSection>
  );
}
