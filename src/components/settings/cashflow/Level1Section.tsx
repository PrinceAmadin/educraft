"use client";

import * as React from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormSection } from "@/components/forms/FormSection";
import { AbsorberPicker, Cell, HeadRow, LevelFooter, PercentInput, SectionViolations } from "./primitives";
import { AddRowDialog } from "./AddRowDialog";
import { PERSON_TRIGGERS, PERSON_TRIGGER_LABELS, isActiveRow, type CashflowStructure, type Level1Row } from "@/lib/finance/cashflow-types";
import { autoBalance, levelTotal, type Violation } from "@/lib/finance/cashflow-rules";
import type { StaffOption } from "@/lib/services/cashflow-staff";
import { cn } from "@/lib/utils";

/** Rows the seed publishes: always present, never deleted (their percentages and triggers still change). */
const BUILT_IN = new Set(["workers", "ambassador", "hog", "coo", "educraft_retained"]);

function recipientsText(row: Level1Row, staff: StaffOption[]): string {
  if (row.kind === "fund") return "EduCraft's retained share, split into the buckets below";
  switch (row.recipients) {
    case "workers":
      return "Every assigned specialist, on their own projects";
    case "ambassadors":
      return "The referring ambassador (their tier rate) and their Core (the rest)";
    case "role":
      return row.role === "HOG" ? "The Head of Growth, on ambassador-driven projects" : "The COO, on every project";
    case "user":
      return staff.find((s) => s.id === row.assignedUserId)?.name ?? "Nobody assigned yet";
    default:
      return "";
  }
}

const GRID = "grid grid-cols-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_7rem_6rem_2.5rem] items-start gap-3";

export function Level1Section({ structure, onChange, readOnly, violations, staff, keysWithRecords }: { structure: CashflowStructure; onChange: (next: CashflowStructure) => void; readOnly: boolean; violations: Violation[]; staff: StaffOption[]; keysWithRecords: string[] }) {
  const [adding, setAdding] = React.useState(false);
  const [balanceError, setBalanceError] = React.useState<string | null>(null);
  const rows = [...structure.level1].sort((a, b) => a.displayOrder - b.displayOrder);
  const funds = rows.filter((r) => r.kind === "fund");
  const absorber = funds.find((r) => r.isAbsorber) ?? null;

  const patch = (key: string, changes: Partial<Level1Row>) => onChange({ ...structure, level1: structure.level1.map((r) => (r.key === key ? { ...r, ...changes } : r)) });
  const remove = (key: string) => onChange({ ...structure, level1: structure.level1.filter((r) => r.key !== key) });
  const setAbsorber = (key: string) => onChange({ ...structure, level1: structure.level1.map((r) => ({ ...r, isAbsorber: r.key === key })) });

  return (
    <FormSection
      title="A · Revenue split"
      description="How each project's price is shared. People's rows are commissions; EduCraft retains is what the buckets below split. The rows must add up to 100%."
      action={
        !readOnly ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
            <LuPlus className="size-4" aria-hidden />
            Add row
          </Button>
        ) : null
      }
    >
      <div>
        <HeadRow columns={["Recipient", "Who is paid", "Owed at", "Share", "Active", ""]} className="sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_7rem_6rem_2.5rem]" />
        <ul className="divide-y divide-border/70">
          {rows.map((row) => {
            const active = isActiveRow(row);
            const person = row.kind === "person";
            const deletable = !readOnly && !BUILT_IN.has(row.key) && !keysWithRecords.includes(row.key);
            return (
              <li key={row.key} className={cn("py-3", GRID, !active && "opacity-70")}>
                <Cell label="Recipient" className="col-span-2 sm:col-span-1">
                  <Input value={row.label} disabled={readOnly} aria-label={`${row.label} name`} onChange={(e) => patch(row.key, { label: e.target.value })} className="h-10 text-sm" />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {person ? "Person" : "Fund"} · <span className="font-mono">{row.key}</span>
                    {row.condition === "ambassador_driven" ? " · ambassador-driven projects only" : ""}
                  </span>
                </Cell>
                <Cell label="Who is paid" className="col-span-2 sm:col-span-1">
                  {row.recipients === "user" ? (
                    <Select value={row.assignedUserId ?? ""} disabled={readOnly} aria-label={`${row.label} assignee`} onChange={(e) => patch(row.key, { assignedUserId: e.target.value || null })} className="h-10 text-sm">
                      <option value="">Assign a login…</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {s.role}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <p className="pt-2 text-[13px] text-muted-foreground">{recipientsText(row, staff)}</p>
                  )}
                  {row.note ? <p className="mt-1 text-[11px] text-muted-foreground">{row.note}</p> : null}
                </Cell>
                <Cell label="Owed at">
                  {person ? (
                    <Select value={row.trigger ?? "completion"} disabled={readOnly} aria-label={`${row.label} trigger`} onChange={(e) => patch(row.key, { trigger: e.target.value as Level1Row["trigger"] })} className="h-10 text-sm">
                      {PERSON_TRIGGERS.map((t) => (
                        <option key={t} value={t}>
                          {PERSON_TRIGGER_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <p className="pt-2 text-[13px] text-muted-foreground">As money comes in</p>
                  )}
                </Cell>
                <Cell label="Share">
                  <PercentInput value={row.percentage} disabled={readOnly} label={`${row.label} percentage`} onChange={(n) => patch(row.key, { percentage: n })} />
                </Cell>
                <Cell label="Active">
                  {person && row.recipients !== "workers" && row.recipients !== "ambassadors" ? (
                    <label className="flex h-10 items-center gap-2 text-sm text-foreground">
                      <input type="checkbox" className="size-4 accent-primary" checked={active} disabled={readOnly} onChange={(e) => patch(row.key, { active: e.target.checked })} />
                      {active ? "Yes" : "No"}
                    </label>
                  ) : (
                    <p className="pt-2 text-[13px] text-muted-foreground">Always</p>
                  )}
                </Cell>
                <div className="flex justify-end">
                  {deletable ? (
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${row.label}`} onClick={() => remove(row.key)}>
                      <LuTrash2 className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <LevelFooter
          total={levelTotal(structure.level1)}
          disabled={readOnly}
          absorber={<AbsorberPicker options={funds.map((f) => ({ key: f.key, label: f.label }))} value={absorber?.key ?? null} onChange={setAbsorber} disabled={readOnly} />}
          onBalance={() => {
            const r = autoBalance(structure, { level: "level1" });
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
      <AddRowDialog open={adding} onClose={() => setAdding(false)} structure={structure} staff={staff} onAdd={(row) => onChange({ ...structure, level1: [...structure.level1, row] })} />
    </FormSection>
  );
}
