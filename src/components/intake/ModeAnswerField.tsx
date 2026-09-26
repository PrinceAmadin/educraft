"use client";

import * as React from "react";
import { useFormContext } from "react-hook-form";
import { LuCheck } from "react-icons/lu";
import { INTAKE_MODE_HINT, INTAKE_MODE_OPTIONS, INTAKE_MODE_QUESTION } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { IntakeSubmitInput } from "@/lib/validations/intake";

/**
 * The final-year form's "How will your project collect its information?" question.
 * One tap per option (each is at least 56 px tall), with what it means and a few
 * examples, so a student can answer without knowing the academic terms. "I'm not
 * sure yet" is a real answer: our team decides from the topic and department.
 */
export function ModeAnswerField() {
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<IntakeSubmitInput>();
  const chosen = watch("intakeModeAnswer") || "";
  const error = errors.intakeModeAnswer?.message as string | undefined;
  const hintId = "intakeModeAnswer-hint";
  const errorId = "intakeModeAnswer-error";

  return (
    <fieldset className="space-y-3" aria-describedby={error ? `${hintId} ${errorId}` : hintId}>
      <legend className="text-[15px] font-semibold tracking-tight text-foreground">
        {INTAKE_MODE_QUESTION}
        <span className="ml-1 text-danger" aria-hidden>
          *
        </span>
      </legend>
      <p id={hintId} className="-mt-1 text-sm text-muted-foreground">
        {INTAKE_MODE_HINT}
      </p>
      <div role="radiogroup" aria-label={INTAKE_MODE_QUESTION} className="grid gap-2.5">
        {INTAKE_MODE_OPTIONS.map((o) => {
          const on = chosen === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setValue("intakeModeAnswer", o.value, { shouldDirty: true, shouldValidate: Boolean(error) })}
              className={cn(
                "flex min-h-14 w-full items-start gap-3 rounded-xl px-4 py-3 text-left transition-colors",
                on ? "bg-primary/10 ring-2 ring-primary" : "bg-zone ring-1 ring-inset ring-input-border hover:bg-elevated",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                  on ? "bg-primary text-primary-foreground" : "bg-background ring-1 ring-inset ring-input-border",
                )}
              >
                {on ? <LuCheck className="size-3" /> : null}
              </span>
              <span className="min-w-0 space-y-0.5">
                <span className="block text-[15px] font-medium leading-snug text-foreground">{o.title}</span>
                <span className="block text-sm leading-snug text-muted-foreground">{o.detail}</span>
                {o.examples ? <span className="block text-xs leading-snug text-muted-foreground">For example: {o.examples}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
