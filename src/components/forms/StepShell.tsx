"use client";

import * as React from "react";
import { LuArrowLeft, LuCircleAlert, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { FormProgress } from "@/components/intake/FormProgress";
import type { StepDef } from "@/lib/intake-templates";

/**
 * Frame for a short public form split into pages (max four).
 *
 * Every step stays mounted and inactive ones are only `hidden`: react-hook-form
 * keeps every field registered, so Back never loses what was typed and local
 * widget state (a combobox choice) survives too. The parent owns the step
 * number and the per-step validation, because refinements that span fields
 * (password confirmation, terms) never run on a partial `trigger`.
 */
export function StepShell({
  steps,
  step,
  onBack,
  onNext,
  submitting,
  submitLabel,
  error,
  children,
}: {
  steps: StepDef[];
  step: number;
  onBack: () => void;
  onNext: () => void;
  submitting: boolean;
  submitLabel: string;
  error?: string | null;
  /** One node per step, in order. */
  children: React.ReactNode[];
}) {
  const isLast = step === steps.length - 1;
  const top = React.useRef<HTMLDivElement>(null);
  const shownStep = React.useRef(step);

  // Bring the new page's heading into view and put focus on its first field.
  // Only on a real step change: never on first load (dev mode runs effects twice).
  React.useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    const panel = top.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    panel?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")?.focus({ preventScroll: true });
  }, [step]);

  return (
    <div ref={top} className="scroll-mt-24 space-y-8">
      <FormProgress steps={steps} current={step} />

      {React.Children.toArray(children).map((child, i) => (
        <div key={steps[i]?.id ?? i} data-step={i} hidden={i !== step}>
          {child}
        </div>
      ))}

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <div className="sticky bottom-0 z-20 -mx-4 flex items-center gap-3 bg-background/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_-12px_24px_-18px_rgb(15_23_42/0.25)] backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
        {step > 0 ? (
          <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={submitting}>
            <LuArrowLeft className="size-4" aria-hidden />
            Back
          </Button>
        ) : null}
        {isLast ? (
          <Button type="submit" size="lg" className="flex-1 sm:flex-none" disabled={submitting}>
            {submitting ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
            {submitting ? "Submitting…" : submitLabel}
          </Button>
        ) : (
          <Button type="button" size="lg" className="flex-1 sm:flex-none" onClick={onNext}>
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
