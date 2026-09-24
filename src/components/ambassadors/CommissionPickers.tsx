"use client";

import * as React from "react";
import { LuCheck, LuSearch } from "react-icons/lu";
import { Input } from "@/components/ui/input";
import {
  COMMISSION_RATE_PRESETS,
  MAX_COMMISSION_RATE,
  MIN_COMMISSION_RATE,
  commissionFor,
} from "@/lib/commission";
import type { AllocatableAmbassador } from "@/lib/services/ambassador-commission";
import { cn, formatNaira } from "@/lib/utils";

/**
 * The pieces every "allocate a job to an ambassador" surface shares — the job
 * page's Financials tab, the new-project form and the Tracking log dialog.
 */

const TIER_LABEL: Record<AllocatableAmbassador["tier"], string> = {
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
  PLATINUM: "Platinum",
};

const isPreset = (n: number) => (COMMISSION_RATE_PRESETS as readonly number[]).includes(n);

// ── Ambassador list ──────────────────────────────────────────────────────

export function AmbassadorPicker({
  ambassadors,
  selectedId,
  onPick,
  allowNone = false,
  label = "Ambassadors",
}: {
  ambassadors: AllocatableAmbassador[];
  selectedId: string | null;
  onPick: (ambassador: AllocatableAmbassador | null) => void;
  /** Offer "None — no ambassador referred this job" as the first option. */
  allowNone?: boolean;
  label?: string;
}) {
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? ambassadors.filter((a) =>
        [a.name, a.code, a.university ?? ""].some((v) => v.toLowerCase().includes(needle))
      )
    : ambassadors;

  return (
    <div className="space-y-2">
      <label className="relative block">
        <LuSearch
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, ID or school"
          className="pl-10"
          aria-label={`Search ${label.toLowerCase()}`}
        />
      </label>

      <div role="listbox" aria-label={label} className="max-h-64 overflow-y-auto overflow-x-hidden rounded-xl bg-zone p-1">
        {allowNone && !needle ? (
          <Option active={selectedId === null} onClick={() => onPick(null)}>
            <span className="block text-sm font-medium text-foreground">None</span>
            <span className="block text-xs text-muted-foreground">No ambassador referred this job</span>
          </Option>
        ) : null}
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No ambassador matches.</p>
        ) : (
          filtered.map((a) => (
            <Option key={a.id} active={a.id === selectedId} onClick={() => onPick(a)}>
              <span className="block truncate text-sm font-medium text-foreground">{a.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                <span className="font-mono">{a.code}</span>
                {a.university ? ` · ${a.university}` : ""} · {TIER_LABEL[a.tier]}{" "}
                <span className="font-mono">{a.tierRate}%</span>
                {a.email ? "" : " · no email"}
                {a.parent ? ` · ${a.parent.name} gets ${a.parent.rate}% as parent` : ""}
              </span>
            </Option>
          ))
        )}
      </div>
    </div>
  );
}

function Option({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors",
        active ? "bg-card shadow-soft" : "hover:bg-card/60"
      )}
    >
      <span className="min-w-0">{children}</span>
      {active ? <LuCheck className="size-4 shrink-0 text-primary" aria-hidden /> : null}
    </button>
  );
}

// ── Rate ─────────────────────────────────────────────────────────────────

/** 10 / 12 / 15 at a tap, or any rate the admin types. */
export function CommissionRatePicker({
  value,
  onChange,
  id = "commission-rate",
}: {
  value: number;
  onChange: (rate: number) => void;
  id?: string;
}) {
  const [custom, setCustom] = React.useState(!isPreset(value));
  const [draft, setDraft] = React.useState(isPreset(value) ? "" : String(value));

  // Picking another ambassador resets the rate from outside.
  React.useEffect(() => {
    if (isPreset(value)) {
      setCustom(false);
    } else {
      setCustom(true);
      setDraft(String(value));
    }
  }, [value]);

  const draftNum = Number(draft);
  const draftInvalid =
    custom && draft !== "" && (!Number.isFinite(draftNum) || draftNum < MIN_COMMISSION_RATE || draftNum > MAX_COMMISSION_RATE);

  return (
    <div>
      <p className="meta-label mb-2" id={`${id}-label`}>
        Commission rate
      </p>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="grid grid-cols-4 gap-2">
        {COMMISSION_RATE_PRESETS.map((r) => (
          <RateButton
            key={r}
            active={!custom && value === r}
            onClick={() => {
              setCustom(false);
              onChange(r);
            }}
          >
            <span className="font-mono tabular-nums">{r}%</span>
          </RateButton>
        ))}
        <RateButton
          active={custom}
          onClick={() => {
            setCustom(true);
            setDraft(isPreset(value) ? "" : String(value));
          }}
        >
          Custom
        </RateButton>
      </div>

      {custom ? (
        <div className="mt-3">
          <label htmlFor={id} className="meta-label mb-1.5 block">
            Custom rate
          </label>
          <div className="relative max-w-40">
            <Input
              id={id}
              type="number"
              inputMode="decimal"
              min={MIN_COMMISSION_RATE}
              max={MAX_COMMISSION_RATE}
              step={0.5}
              value={draft}
              autoFocus
              placeholder="e.g. 7.5"
              aria-invalid={draftInvalid || undefined}
              onChange={(e) => {
                setDraft(e.target.value);
                const n = Number(e.target.value);
                if (e.target.value !== "" && Number.isFinite(n) && n >= MIN_COMMISSION_RATE && n <= MAX_COMMISSION_RATE) {
                  onChange(Math.round(n * 100) / 100);
                }
              }}
              className="pr-9 font-mono tabular-nums"
            />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              %
            </span>
          </div>
          {draftInvalid ? (
            <p className="mt-1.5 text-xs text-danger">
              Between {MIN_COMMISSION_RATE}% and {MAX_COMMISSION_RATE}%.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RateButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "min-h-12 rounded-lg text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-zone text-foreground hover:bg-elevated"
      )}
    >
      {children}
    </button>
  );
}

// ── Preview ──────────────────────────────────────────────────────────────

/**
 * Job price → minus commission (to expenses) → minus a parent ambassador's
 * cut, if the ambassador has one that's activated → what EduCraft keeps.
 */
export function CommissionPreview({
  price,
  workerPayout,
  rate,
  parent,
}: {
  price: number;
  workerPayout: number;
  rate: number;
  /** The ambassador's parent (Core), if allocating to them also pays one out. */
  parent?: { name: string; rate: number } | null;
}) {
  const commission = commissionFor(price, rate);
  const parentCommission = parent ? commissionFor(price, parent.rate) : 0;
  return (
    <dl className="divide-y divide-border/80 rounded-xl bg-zone px-4">
      <Row label="Job amount" value={formatNaira(price)} />
      <Row label={`Ambassador commission (${rate}%) — to expenses`} value={`− ${formatNaira(commission)}`} />
      {parent ? (
        <Row
          label={`Parent commission (${parent.rate}%, ${parent.name}) — to expenses`}
          value={`− ${formatNaira(parentCommission)}`}
        />
      ) : null}
      <Row label="Worker payout" value={`− ${formatNaira(workerPayout)}`} muted />
      <Row
        label="EduCraft keeps"
        value={formatNaira(price - workerPayout - commission - parentCommission)}
        strong
      />
    </dl>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <dt className={strong ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</dt>
      <dd
        className={cn(
          "shrink-0 font-mono tabular-nums",
          strong ? "font-medium text-foreground" : muted ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
