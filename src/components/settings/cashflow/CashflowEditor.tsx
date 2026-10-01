"use client";

import * as React from "react";
import { LuCircleAlert, LuCircleCheck, LuLock, LuRotateCcw } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Level1Section } from "./Level1Section";
import { Level2Section } from "./Level2Section";
import { Level3Section } from "./Level3Section";
import { TiersSection } from "./TiersSection";
import { BonusesSection } from "./BonusesSection";
import { DrawTiersSection } from "./DrawTiersSection";
import { TriggersSection } from "./TriggersSection";
import { PublishDialog } from "./PublishDialog";
import { VersionHistory } from "./VersionHistory";
import { canonicalHash, diffStructures, hasErrors, tiersChanged, validateStructure } from "@/lib/finance/cashflow-rules";
import type { CashflowStructure } from "@/lib/finance/cashflow-types";
import type { CashflowVersionView, VersionSummary } from "@/lib/services/cashflow";
import type { StaffOption } from "@/lib/services/cashflow-staff";
import { cn, formatDate } from "@/lib/utils";

/**
 * The EduCraft Cashflow tab: one structure in state, validated on every
 * change (the same rules the publish route runs), each level with its own
 * running total, absorber and Balance now, then Publish — which shows the
 * diff and creates the next version. Read-only for every executive but the
 * founder.
 */
export function CashflowEditor({
  active,
  history,
  staff,
  keysWithRecords,
  minServiceDownpayment,
  readOnly,
}: {
  active: CashflowVersionView;
  history: VersionSummary[];
  staff: StaffOption[];
  keysWithRecords: string[];
  minServiceDownpayment: number | null;
  readOnly: boolean;
}) {
  const [structure, setStructure] = React.useState<CashflowStructure>(active.structure);
  const [publishing, setPublishing] = React.useState(false);
  const [published, setPublished] = React.useState<number | null>(null);
  // A newer version arrived (a publish, a refresh): start again from it.
  React.useEffect(() => {
    setStructure(active.structure);
    setPublished(null);
  }, [active.id, active.structure]);

  const violations = React.useMemo(() => validateStructure(structure, { previous: active.structure, keysWithRecords, minServiceDownpayment }), [structure, active.structure, keysWithRecords, minServiceDownpayment]);
  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warn");
  const dirty = canonicalHash(structure) !== canonicalHash(active.structure);
  const diff = React.useMemo(() => diffStructures(active.structure, structure), [active.structure, structure]);
  const byLevel = (level: string) => violations.filter((v) => v.level === level);

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zone px-5 py-4">
        <div className="text-sm">
          <p className="font-medium text-foreground">
            Version {active.versionNumber} <span className="font-normal text-muted-foreground">· active since {formatDate(active.effectiveFrom)}</span>
          </p>
          <p className="text-[13px] text-muted-foreground">
            {readOnly ? (
              <span className="inline-flex items-center gap-1">
                <LuLock className="size-3.5" aria-hidden /> Read-only: only the Super Admin publishes a change.
              </span>
            ) : dirty ? (
              `${diff.length} change${diff.length === 1 ? "" : "s"} not yet published.`
            ) : (
              "Edit any figure; nothing changes until you publish."
            )}
          </p>
        </div>
        {!readOnly ? (
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={!dirty} onClick={() => setStructure(active.structure)}>
              <LuRotateCcw className="size-4" aria-hidden />
              Discard changes
            </Button>
            <Button type="button" disabled={!dirty || hasErrors(violations)} onClick={() => setPublishing(true)}>
              Publish version {active.versionNumber + 1}
            </Button>
          </div>
        ) : null}
      </div>

      {published ? (
        <p className="flex items-center gap-2 text-sm text-success" role="status">
          <LuCircleCheck className="size-4" aria-hidden />
          Version {published} published. It applies to every project created from now on.
        </p>
      ) : null}

      <Level1Section structure={structure} onChange={setStructure} readOnly={readOnly} violations={byLevel("level1")} staff={staff} keysWithRecords={keysWithRecords} />
      <Level2Section structure={structure} onChange={setStructure} readOnly={readOnly} violations={byLevel("level2")} />
      <Level3Section structure={structure} onChange={setStructure} readOnly={readOnly} violations={byLevel("level3")} />
      <TiersSection structure={structure} onChange={setStructure} readOnly={readOnly} violations={[...byLevel("tiers"), ...byLevel("overrides")]} />
      <BonusesSection structure={structure} onChange={setStructure} readOnly={readOnly} violations={byLevel("bonuses")} />
      <DrawTiersSection structure={structure} onChange={setStructure} readOnly={readOnly} violations={byLevel("draws")} />
      <TriggersSection structure={structure} onChange={setStructure} readOnly={readOnly} violations={byLevel("triggers")} minServiceDownpayment={minServiceDownpayment} />

      {!readOnly ? (
        <div className={cn("sticky bottom-0 z-10 -mx-4 border-t border-border/70 bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-5")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              {errors.length ? (
                <p className="flex items-start gap-2 text-danger">
                  <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {errors.length} problem{errors.length === 1 ? "" : "s"} to fix before publishing: {errors.slice(0, 3).map((e) => e.message).join(" · ")}
                    {errors.length > 3 ? ` · and ${errors.length - 3} more` : ""}
                  </span>
                </p>
              ) : dirty ? (
                <p className="flex items-center gap-2 text-success">
                  <LuCircleCheck className="size-4" aria-hidden />
                  Every level adds up. {warnings.length ? `${warnings.length} note${warnings.length === 1 ? "" : "s"} to read on the way.` : ""}
                </p>
              ) : (
                <p className="text-muted-foreground">No unpublished changes.</p>
              )}
            </div>
            <Button type="button" disabled={!dirty || errors.length > 0} onClick={() => setPublishing(true)}>
              Publish version {active.versionNumber + 1}
            </Button>
          </div>
        </div>
      ) : null}

      <VersionHistory history={history} canRepublish={!readOnly} />

      <PublishDialog
        open={publishing}
        onClose={() => setPublishing(false)}
        structure={structure}
        currentVersion={active.versionNumber}
        activeSince={active.effectiveFrom}
        diff={diff}
        tiersChanged={tiersChanged(active.structure, structure)}
        warnings={warnings}
        onPublished={(n) => {
          setPublishing(false);
          setPublished(n);
        }}
      />
    </div>
  );
}
