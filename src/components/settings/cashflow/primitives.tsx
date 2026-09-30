"use client";

import * as React from "react";
import { LuCircleAlert, LuCircleCheck, LuTriangleAlert } from "react-icons/lu";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { Violation } from "@/lib/finance/cashflow-rules";
import { cn } from "@/lib/utils";

/** A percentage field: two decimals at most, 0–100, monospace like every figure in HQ. */
export function PercentInput({ value, onChange, disabled, id, label, className }: { value: number; onChange: (n: number) => void; disabled?: boolean; id?: string; label: string; className?: string }) {
  const [text, setText] = React.useState(String(value));
  React.useEffect(() => {
    setText((t) => (Number(t) === value ? t : String(value)));
  }, [value]);
  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        step={0.5}
        aria-label={label}
        disabled={disabled}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onChange(Math.round(n * 100) / 100);
        }}
        onBlur={() => setText(String(value))}
        className="h-10 pr-8 text-right font-mono tabular-nums"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
    </div>
  );
}

/** A whole-naira field. */
export function NairaInput({ value, onChange, disabled, label, className, allowEmpty }: { value: number | null; onChange: (n: number | null) => void; disabled?: boolean; label: string; className?: string; allowEmpty?: boolean }) {
  const [text, setText] = React.useState(value == null ? "" : String(value));
  React.useEffect(() => {
    setText((t) => (value == null ? (allowEmpty && t === "" ? t : "") : Number(t) === value ? t : String(value)));
  }, [value, allowEmpty]);
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₦</span>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        step={1000}
        aria-label={label}
        disabled={disabled}
        value={text}
        placeholder={allowEmpty ? "no ceiling" : undefined}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value === "") {
            if (allowEmpty) onChange(null);
            return;
          }
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.round(n));
        }}
        className="h-10 pl-7 text-right font-mono tabular-nums"
      />
    </div>
  );
}

/** A whole-number field (conversions, targets). */
export function CountInput({ value, onChange, disabled, label, className, allowEmpty, placeholder }: { value: number | null; onChange: (n: number | null) => void; disabled?: boolean; label: string; className?: string; allowEmpty?: boolean; placeholder?: string }) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      step={1}
      aria-label={label}
      disabled={disabled}
      value={value == null ? "" : String(value)}
      placeholder={placeholder}
      onChange={(e) => {
        if (e.target.value === "") {
          if (allowEmpty) onChange(null);
          return;
        }
        const n = Number(e.target.value);
        if (Number.isInteger(n)) onChange(n);
      }}
      className={cn("h-10 text-right font-mono tabular-nums", className)}
    />
  );
}

/** "TOTAL: 100.0% ✓" in green, or "TOTAL: 102.0% ✗ Over by 2%" in red. */
export function RunningTotal({ total, of = "100%" }: { total: number; of?: string }) {
  const ok = Math.abs(total - 100) < 0.005;
  const diff = Math.round((total - 100) * 100) / 100;
  return (
    <p className={cn("flex items-center gap-2 font-mono text-sm tabular-nums", ok ? "text-success" : "text-danger")} role="status">
      {ok ? <LuCircleCheck className="size-4" aria-hidden /> : <LuCircleAlert className="size-4" aria-hidden />}
      TOTAL: {total.toFixed(1)}% {ok ? `of ${of} ✓` : `✗ ${diff > 0 ? `Over by ${Math.abs(diff)}%` : `Short by ${Math.abs(diff)}%`}`}
    </p>
  );
}

/** The absorber dropdown: only fund / reserve rows, never a person's commission. */
export function AbsorberPicker({ options, value, onChange, disabled, label = "Default absorber" }: { options: { key: string; label: string }[]; value: string | null; onChange: (key: string) => void; disabled?: boolean; label?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block meta-label">{label}</span>
      <Select value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="h-10 text-sm" aria-label={label}>
        {value ? null : <option value="">Choose…</option>}
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

/** The footer under a level: running total, absorber, auto-balance and the level's own violations. */
export function LevelFooter({ total, of, absorber, onBalance, balanceError, disabled, children }: { total: number; of?: string; absorber?: React.ReactNode; onBalance?: () => void; balanceError?: string | null; disabled?: boolean; children?: React.ReactNode }) {
  const ok = Math.abs(total - 100) < 0.005;
  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <RunningTotal total={total} of={of} />
        {absorber ? <div className="min-w-[14rem]">{absorber}</div> : null}
        {onBalance && !disabled ? (
          <Button type="button" size="sm" variant="outline" onClick={onBalance} disabled={ok}>
            Balance now
          </Button>
        ) : null}
      </div>
      {balanceError ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {balanceError}
        </p>
      ) : null}
      {children}
    </div>
  );
}

/** The violations that belong to one section, errors first. */
export function SectionViolations({ violations }: { violations: Violation[] }) {
  if (violations.length === 0) return null;
  const sorted = [...violations].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  return (
    <ul className="space-y-1.5" aria-label="Problems in this section">
      {sorted.map((v, i) => (
        <li key={`${v.code}-${v.rowKey ?? ""}-${i}`} className={cn("flex items-start gap-2 text-sm", v.severity === "error" ? "text-danger" : "text-gold")}>
          {v.severity === "error" ? <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> : <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
          <span>{v.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** The column headings of a level's rows (phones show each row as a stack, so the headings hide). */
export function HeadRow({ columns, className }: { columns: string[]; className?: string }) {
  return (
    <div className={cn("hidden sm:grid gap-3 border-b border-border/70 pb-2", className)} aria-hidden>
      {columns.map((c, i) => (
        <span key={`${c}-${i}`} className="meta-label">
          {c}
        </span>
      ))}
    </div>
  );
}

/** A small label for a field on phones, where the column headings are hidden. */
export function Cell({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <span className="mb-1 block meta-label sm:hidden">{label}</span>
      {children}
    </div>
  );
}

/** A machine key from a label: "Growth Associate" → "growth_associate", unique among `taken`. */
export function keyFromLabel(label: string, taken: readonly string[]): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 36) || "row";
  let key = base.length < 2 ? `${base}_row` : base;
  let n = 2;
  while (taken.includes(key)) key = `${base}_${n++}`;
  return key;
}
