"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import type { DataFormField } from "@/lib/generation/dynamic-data-form";

/** The short questions of a data request (D3c/D4): the client answers them, the specialist can correct them. */
export function DataFormFields({
  fields,
  values,
  onChange,
  disabled = false,
  idPrefix,
}: {
  fields: DataFormField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  if (!fields.length) return null;
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {fields.map((f) => {
        const id = `${idPrefix}-${f.key}`;
        const value = values[f.key] ?? "";
        const set = (v: string) => onChange(f.key, v);
        return (
          <Field key={f.key} label={f.label} htmlFor={id} required={f.required} hint={f.help ?? undefined} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
            {f.type === "textarea" ? (
              <Textarea id={id} rows={3} value={value} maxLength={2000} disabled={disabled} onChange={(e) => set(e.target.value)} />
            ) : f.type === "select" ? (
              <Select id={id} value={value} disabled={disabled} onChange={(e) => set(e.target.value)}>
                <option value="">Choose…</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id={id}
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                inputMode={f.type === "number" ? "decimal" : undefined}
                step={f.type === "number" ? "any" : undefined}
                value={value}
                maxLength={300}
                disabled={disabled}
                onChange={(e) => set(e.target.value)}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}

/** The first required question left empty, for the button hint ("Answer …"). */
export function firstMissingField(fields: DataFormField[], values: Record<string, string>): DataFormField | null {
  return fields.find((f) => f.required && !(values[f.key] ?? "").trim()) ?? null;
}
