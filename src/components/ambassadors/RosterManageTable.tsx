"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuSearchX } from "react-icons/lu";
import type { RosterKind } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { CopyLinkButton } from "@/components/ambassadors/CopyLinkButton";
import { SchoolChip, StatusPill } from "@/components/ambassadors/RosterBoard";
import { SlotDialog } from "@/components/ambassadors/SlotDialog";
import type { RosterRow } from "@/lib/services/ambassador-roster";

const CODE_LABEL: Record<RosterKind, (code: string) => string> = {
  GENERAL: (c) => `EduCraftA-${c}`,
  CORE: (c) => c,
  SUB: (c) => c,
};

/**
 * Roster rows with Edit and Reset. Used by Manage (every kind), and by the
 * Core and Sub tabs. `variant` picks the extra columns: Core shows base %,
 * subs and total %; Sub shows % and its Core.
 */
export function RosterManageTable({
  rows,
  kind,
  cores,
  searchable = false,
  showLink = false,
}: {
  rows: RosterRow[];
  kind: RosterKind;
  cores: { code: string; name: string }[];
  searchable?: boolean;
  /** Show the copyable link (Core/Sub tabs). */
  showLink?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [editing, setEditing] = React.useState<RosterRow | null>(null);
  const [resetting, setResetting] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? rows.filter((r) => [r.code, r.name, r.school].some((v) => v.toLowerCase().includes(needle)))
    : rows;

  async function reset(row: RosterRow) {
    const label = row.name ? `${row.name} (${row.code})` : row.code;
    const extra = row.ambassadorId
      ? " Their HQ record, jobs and payouts are kept, but this link stops crediting them."
      : "";
    if (!window.confirm(`Empty ${label}? The slot becomes vacant for the next applicant.${extra}`)) return;
    setResetting(row.code);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/roster/${encodeURIComponent(row.code)}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not reset.");
      }
      router.refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not reset.");
    } finally {
      setResetting(null);
    }
  }

  const grid =
    kind === "CORE"
      ? "md:grid-cols-[8rem_minmax(0,1fr)_6rem_5rem_4rem_5rem_9rem_9rem]"
      : kind === "SUB"
        ? "md:grid-cols-[9rem_minmax(0,1fr)_6rem_4rem_minmax(0,10rem)_6rem_9rem_9rem]"
        : "md:grid-cols-[9rem_minmax(0,1fr)_7rem_6rem_9rem]";

  const heads =
    kind === "CORE"
      ? ["ID", "Name", "School", "Base %", "Subs", "Total %", "Link", ""]
      : kind === "SUB"
        ? ["ID", "Name", "School", "%", "Under (Core)", "Status", "Link", ""]
        : ["Slot ID", "Name", "School", "Status", ""];

  return (
    <div className="space-y-3">
      {searchable ? (
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search slots" aria-label="Search slots" className="max-w-sm" />
      ) : null}
      {notice ? (
        <p role="alert" className="text-sm text-danger">
          {notice}
        </p>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState icon={LuSearchX} title="Nothing here yet" description="Use the Add button to create the first one." />
      ) : (
        <div>
          <div className={`hidden gap-3 border-b border-border/60 px-2 pb-2 md:grid ${grid}`}>
            {heads.map((h, i) => (
              <span key={i} className="meta-label">
                {h}
              </span>
            ))}
          </div>
          <ul>
            {shown.map((r) => {
              const total = r.percentage != null ? r.percentage + 3 * r.subCount : null;
              return (
                <li key={r.code} className={`grid items-center gap-x-3 gap-y-2 border-b border-border/40 px-2 py-3 last:border-0 ${grid} grid-cols-[minmax(0,1fr)_auto]`}>
                  <span className="font-mono text-xs text-primary md:order-none">{CODE_LABEL[r.kind](r.code)}</span>
                  <span className="min-w-0 text-sm font-semibold text-foreground md:order-none">
                    {r.vacant ? <span className="font-normal italic text-muted-foreground">Vacant</span> : r.name}
                    {kind === "SUB" && r.parentName ? (
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground md:hidden">Under {r.parentName}</span>
                    ) : null}
                  </span>
                  <span className="md:order-none">
                    <SchoolChip school={r.school} />
                  </span>
                  {kind === "CORE" ? (
                    <>
                      <span className="font-mono text-sm tabular-nums">{r.percentage ?? 0}%</span>
                      <span className="font-mono text-sm tabular-nums">{r.subCount || "-"}</span>
                      <span className="font-mono text-sm tabular-nums text-gold">{total ?? 0}%</span>
                    </>
                  ) : null}
                  {kind === "SUB" ? (
                    <>
                      <span className="font-mono text-sm tabular-nums">{r.percentage ?? 0}%</span>
                      <span className="hidden truncate text-sm text-muted-foreground md:block">{r.parentName ?? "-"}</span>
                    </>
                  ) : null}
                  {kind !== "CORE" ? <StatusPill vacant={r.vacant} /> : null}
                  {showLink ? (
                    <span className="hidden md:block">
                      <CopyLinkButton path={r.linkPath} />
                    </span>
                  ) : null}
                  <span className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-1 md:justify-end">
                    {showLink ? (
                      <span className="md:hidden">
                        <CopyLinkButton path={r.linkPath} />
                      </span>
                    ) : null}
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditing(r)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={resetting === r.code || (r.vacant && !r.ambassadorId)}
                      onClick={() => reset(r)}
                    >
                      Reset
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <SlotDialog
        kind={kind}
        cores={cores}
        slot={
          editing
            ? {
                code: editing.code,
                name: editing.name,
                school: editing.school,
                vacant: editing.vacant,
                percentage: editing.percentage,
                parentCode: editing.parentCode,
              }
            : undefined
        }
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      />
    </div>
  );
}
