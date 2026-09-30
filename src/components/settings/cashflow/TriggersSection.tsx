"use client";

import * as React from "react";
import { LuShieldCheck, LuTriangleAlert } from "react-icons/lu";
import { FormSection } from "@/components/forms/FormSection";
import { Field } from "@/components/forms/Field";
import { PercentInput, SectionViolations } from "./primitives";
import { downpaymentCeiling, downpaymentExposure, type Violation } from "@/lib/finance/cashflow-rules";
import { isActiveRow, type CashflowStructure } from "@/lib/finance/cashflow-types";
import { cn } from "@/lib/utils";

export function TriggersSection({ structure, onChange, readOnly, violations, minServiceDownpayment }: { structure: CashflowStructure; onChange: (next: CashflowStructure) => void; readOnly: boolean; violations: Violation[]; minServiceDownpayment: number | null }) {
  const exposure = downpaymentExposure(structure);
  const ceiling = downpaymentCeiling(structure);
  const over = exposure > ceiling + 0.005;
  const atDownpayment = structure.level1.filter((r) => r.kind === "person" && isActiveRow(r) && r.trigger === "downpayment");
  return (
    <FormSection title="H · Trigger configuration" description="The downpayment share this rule assumes, and the safety buffer under it. Every commission owed at the downpayment must fit under downpayment minus buffer, so a refund, a bank fee or an admin hour never costs more than the money already in.">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Downpayment %" hint={minServiceDownpayment != null ? `The lowest downpayment an active service takes is ${minServiceDownpayment}%.` : undefined}>
          <PercentInput value={structure.triggers.downpaymentPercent} disabled={readOnly} label="Downpayment percent" onChange={(n) => onChange({ ...structure, triggers: { ...structure.triggers, downpaymentPercent: n } })} />
        </Field>
        <Field label="Safety buffer %" hint="Kept back from the downpayment before anyone is paid.">
          <PercentInput value={structure.triggers.bufferPercent} disabled={readOnly} label="Safety buffer percent" onChange={(n) => onChange({ ...structure, triggers: { ...structure.triggers, bufferPercent: n } })} />
        </Field>
      </div>
      <div className={cn("rounded-2xl p-4 text-sm", over ? "bg-danger/10 text-danger" : "bg-zone text-foreground")} role="status">
        <p className="flex items-center gap-2 font-medium">
          {over ? <LuTriangleAlert className="size-4" aria-hidden /> : <LuShieldCheck className="size-4 text-success" aria-hidden />}
          The X-10% rule: {exposure}% owed at the downpayment, limit {ceiling}%
        </p>
        <p className={cn("mt-1 text-[13px]", over ? "" : "text-muted-foreground")}>
          {over
            ? `Downpayment-triggered commissions (${exposure}%) exceed the safety limit (${ceiling}%). Move some to full payment or completion, or reduce percentages.`
            : `Rows owed at the downpayment: ${atDownpayment.map((r) => `${r.label} ${r.percentage}%`).join(", ") || "none"} — within ${structure.triggers.downpaymentPercent}% − ${structure.triggers.bufferPercent}% = ${ceiling}%.`}
        </p>
      </div>
      <SectionViolations violations={violations.filter((v) => v.code !== "X10")} />
    </FormSection>
  );
}
