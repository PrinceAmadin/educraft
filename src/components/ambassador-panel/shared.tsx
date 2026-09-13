"use client";

import * as React from "react";
import { LuCheck, LuCircleAlert, LuCircleCheck, LuCopy, LuInfo, LuSearch } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AmbassadorKind, PanelOverview, SlotStatus, TrackingStat } from "@/lib/ambassador-panel/types";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "Copy",
  disabled,
  className,
}: {
  value: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled || !value}
      className={cn("text-primary hover:text-primary", className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          /* clipboard blocked — the value is shown beside the button */
        }
      }}
    >
      {copied ? <LuCheck className="size-4" aria-hidden /> : <LuCopy className="size-4" aria-hidden />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export function StatusPill({ status }: { status: SlotStatus | undefined }) {
  const active = (status ?? "active") === "active";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        active ? "bg-success/15 text-success" : "bg-gold/15 text-gold"
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", active ? "bg-success" : "bg-gold")} />
      {active ? "Active" : "Vacant"}
    </span>
  );
}

const KIND: Record<AmbassadorKind, { label: string; className: string }> = {
  general: { label: "General", className: "bg-elevated text-muted-foreground" },
  core: { label: "Core", className: "bg-primary/12 text-primary" },
  sub: { label: "Sub", className: "bg-info/12 text-info" },
};

export function KindBadge({ kind }: { kind: AmbassadorKind }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", KIND[kind].className)}>
      {KIND[kind].label}
    </span>
  );
}

export function Notice({
  tone = "info",
  children,
  action,
  className,
}: {
  tone?: "info" | "success" | "danger" | "warning";
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "success" ? LuCircleCheck : tone === "info" ? LuInfo : LuCircleAlert;
  const styles = {
    info: "bg-zone text-foreground [&_svg]:text-primary",
    success: "bg-success/10 text-foreground [&_svg]:text-success",
    danger: "bg-danger/10 text-foreground [&_svg]:text-danger",
    warning: "bg-gold/10 text-foreground [&_svg]:text-gold",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-2xl p-4 text-sm leading-relaxed", styles, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "primary" | "gold" }) {
  return (
    <div className="min-w-0">
      <p className="meta-label">{label}</p>
      <p
        className={cn(
          "mt-1.5 font-mono text-[1.625rem] font-medium leading-none tabular-nums sm:text-[1.875rem]",
          tone === "primary" ? "text-primary" : tone === "gold" ? "text-gold" : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">{placeholder}</span>
      <LuSearch aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-11 pl-10 text-sm" />
    </label>
  );
}

export function Pills<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 gap-1 rounded-xl bg-zone p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-9 rounded-lg px-3.5 text-sm font-medium transition-colors",
            value === o.value ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-zone px-5 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

// ── Tracking rows ───────────────────────────────────────────────────────────

export interface TrackingRow {
  id: string;
  name: string;
  school: string;
  kind: AmbassadorKind;
  stat: TrackingStat;
}

export const BLANK_STAT: TrackingStat = { clicks: 0, orders: 0, email: null, registeredName: null };

/** Everyone who can be tracked, ranked by clicks + 5 × orders (the original's weighting). */
export function trackingRows(data: PanelOverview): TrackingRow[] {
  const rows: TrackingRow[] = [];
  for (const [id, s] of Object.entries(data.roster.slots)) {
    if (s.status === "active" && s.name) rows.push({ id, name: s.name, school: s.school, kind: "general", stat: data.stats[id] ?? BLANK_STAT });
  }
  for (const c of data.roster.coreAmbassadors) {
    rows.push({ id: c.id, name: c.name, school: c.school, kind: "core", stat: data.stats[c.id] ?? BLANK_STAT });
  }
  for (const s of data.roster.subAmbassadors) {
    rows.push({ id: s.id, name: s.name, school: s.school, kind: "sub", stat: data.stats[s.id] ?? BLANK_STAT });
  }
  const score = (r: TrackingRow) => r.stat.clicks + r.stat.orders * 5;
  return rows.sort((a, b) => score(b) - score(a));
}

/** Orders ÷ clicks — only meaningful once there are clicks. */
export function conversion(stat: TrackingStat): number | null {
  return stat.clicks > 0 ? Math.round((stat.orders / stat.clicks) * 100) : null;
}

export function naira(n: number): string {
  return `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}
