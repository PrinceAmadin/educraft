"use client";

import * as React from "react";
import { LuPencil, LuPlus, LuRotateCcw } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { SurfaceHeader } from "@/components/ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrigin, usePanel } from "@/components/ambassador-panel/context";
import { ResetDialog, SubDialog, type SubDialogState } from "@/components/ambassador-panel/dialogs";
import { CopyButton, Empty, StatusPill } from "@/components/ambassador-panel/shared";
import { referralPath, referralUrl } from "@/lib/ambassador-panel/links";
import type { SubAmbassador } from "@/lib/ambassador-panel/types";

export function SubTab() {
  const { data, readOnly, canDelete } = usePanel();
  const origin = useOrigin();
  const [dialog, setDialog] = React.useState<SubDialogState>(null);
  const [reset, setReset] = React.useState<string | null>(null);

  const coreName = (id: string) => data.roster.coreAmbassadors.find((c) => c.id === id)?.name;

  const actions = (s: SubAmbassador) => (
    <div className="flex items-center justify-end gap-0.5">
      <CopyButton value={referralUrl(origin, s.id)} />
      <Button type="button" variant="ghost" size="icon-sm" disabled={readOnly} aria-label={`Edit ${s.id}`} onClick={() => setDialog({ mode: "edit", sub: s })}>
        <LuPencil aria-hidden />
      </Button>
      {canDelete ? (
        <Button type="button" variant="ghost" size="icon-sm" disabled={readOnly} aria-label={`Reset ${s.id}`} onClick={() => setReset(s.id)}>
          <LuRotateCcw aria-hidden />
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <SurfaceHeader
        title="Sub-Ambassadors (ECSA)"
        description="Sub-Ambassadors earn 7% per job. Their Core Ambassador earns an additional 3% on each of those jobs."
        action={
          <Button size="sm" disabled={readOnly} onClick={() => setDialog({ mode: "add" })}>
            <LuPlus className="size-4" aria-hidden />
            Add
          </Button>
        }
      />

      {data.roster.subAmbassadors.length === 0 ? (
        <Empty>No Sub-Ambassadors yet.</Empty>
      ) : (
        <>
          <ul className="divide-y divide-border/80 md:hidden">
            {data.roster.subAmbassadors.map((s) => (
              <li key={s.id} className="py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium text-foreground">{s.id}</span>
                  <StatusPill status={s.status} />
                </div>
                <p className="mt-1 text-[15px] text-foreground">
                  {s.name} <span className="text-[13px] text-muted-foreground">· {s.school || "—"}</span>
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  <span className="font-mono text-foreground">{s.percentage}%</span> · under {coreName(s.coreId) ?? s.coreId}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-muted-foreground">{referralPath(s.id)}</span>
                  {actions(s)}
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead>Under</TableHead>
                  <TableHead>Client link</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.roster.subAmbassadors.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-sm font-medium">{s.id}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {s.name}
                        {(s.status ?? "active") === "vacant" ? <StatusPill status="vacant" /> : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.school || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{s.percentage}%</TableCell>
                    <TableCell className="text-muted-foreground">{coreName(s.coreId) ?? <span className="font-mono">{s.coreId}</span>}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{referralPath(s.id)}</TableCell>
                    <TableCell>{actions(s)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <SubDialog state={dialog} onClose={() => setDialog(null)} />
      <ResetDialog id={reset} onClose={() => setReset(null)} />
    </div>
  );
}
