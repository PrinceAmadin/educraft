"use client";

import * as React from "react";
import { LuPencil, LuPlus, LuRotateCcw } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { SurfaceHeader } from "@/components/ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrigin, usePanel } from "@/components/ambassador-panel/context";
import { CoreDialog, ResetDialog, type CoreDialogState } from "@/components/ambassador-panel/dialogs";
import { CopyButton, Empty, StatusPill } from "@/components/ambassador-panel/shared";
import { referralPath, referralUrl } from "@/lib/ambassador-panel/links";

export function CoreTab() {
  const { data, readOnly, canDelete } = usePanel();
  const origin = useOrigin();
  const [dialog, setDialog] = React.useState<CoreDialogState>(null);
  const [reset, setReset] = React.useState<string | null>(null);

  const rows = data.roster.coreAmbassadors.map((c) => {
    const subs = data.roster.subAmbassadors.filter((s) => s.coreId === c.id).length;
    return { c, subs, total: c.percentage + subs * 3 };
  });

  const actions = (c: (typeof rows)[number]["c"]) => (
    <div className="flex items-center justify-end gap-0.5">
      <CopyButton value={referralUrl(origin, c.id)} />
      <Button type="button" variant="ghost" size="icon-sm" disabled={readOnly} aria-label={`Edit ${c.id}`} onClick={() => setDialog({ mode: "edit", core: c })}>
        <LuPencil aria-hidden />
      </Button>
      {canDelete ? (
        <Button type="button" variant="ghost" size="icon-sm" disabled={readOnly} aria-label={`Reset ${c.id}`} onClick={() => setReset(c.id)}>
          <LuRotateCcw aria-hidden />
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <SurfaceHeader
        title="Core Ambassadors (ECCA)"
        description="Senior partners. They earn their base percentage on their own jobs plus 3% on every Sub-Ambassador job. Share the recruit link with potential Sub-Ambassadors."
        action={
          <Button size="sm" disabled={readOnly} onClick={() => setDialog({ mode: "add" })}>
            <LuPlus className="size-4" aria-hidden />
            Add
          </Button>
        }
      />

      {rows.length === 0 ? (
        <Empty>No Core Ambassadors yet.</Empty>
      ) : (
        <>
          <ul className="divide-y divide-border/80 md:hidden">
            {rows.map(({ c, subs, total }) => (
              <li key={c.id} className="py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium text-foreground">{c.id}</span>
                  <StatusPill status={c.status} />
                </div>
                <p className="mt-1 text-[15px] text-foreground">
                  {c.name} <span className="text-[13px] text-muted-foreground">· {c.school || "—"}</span>
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Base <span className="font-mono text-foreground">{c.percentage}%</span> · {subs} sub{subs === 1 ? "" : "s"} · total{" "}
                  <span className="font-mono text-foreground">{total}%</span>
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-muted-foreground">{referralPath(c.id)}</span>
                  {actions(c)}
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
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Subs</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Recruit link</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ c, subs, total }) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-sm font-medium">{c.id}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {c.name}
                        {(c.status ?? "active") === "vacant" ? <StatusPill status="vacant" /> : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.school || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{c.percentage}%</TableCell>
                    <TableCell className="text-right font-mono">{subs || "—"}</TableCell>
                    <TableCell className="text-right font-mono font-medium text-primary">{total}%</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{referralPath(c.id)}</TableCell>
                    <TableCell>{actions(c)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <CoreDialog state={dialog} onClose={() => setDialog(null)} />
      <ResetDialog id={reset} onClose={() => setReset(null)} />
    </div>
  );
}
