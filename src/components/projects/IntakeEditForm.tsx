"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle, LuPlus, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { FormActions } from "@/components/forms/FormActions";
import { FormSection } from "@/components/forms/FormSection";
import { TagInput } from "@/components/forms/TagInput";
import { UniversityCombobox } from "@/components/forms/UniversityCombobox";
import type { IntakeFieldDef, FieldTarget } from "@/lib/intake-fields";

type Row = Record<string, string>;
type Value = string | string[];
export type IntakeEditValues = {
  client: Record<string, string>;
  project: Record<string, string>;
  additional: Record<string, Value>;
  education: Row[];
  experience: Row[];
};

const EDU_FIELDS: [string, string][] = [
  ["degree", "Degree"],
  ["school", "School"],
  ["year", "Year"],
  ["cgpa", "CGPA"],
];
const EXP_FIELDS: [string, string][] = [
  ["title", "Role"],
  ["company", "Company"],
  ["dates", "Dates"],
  ["description", "What they did"],
];

const isArrayField = (v: Value): v is string[] => Array.isArray(v);

export function IntakeEditForm({
  projectCode,
  fields,
  hasCvLists,
  initial,
  universities,
  sharedClientProjects,
}: {
  projectCode: string;
  fields: IntakeFieldDef[];
  hasCvLists: boolean;
  initial: IntakeEditValues;
  universities: { id: string; name: string; abbreviation: string }[];
  /** How many other projects belong to this client (their details are shared). */
  sharedClientProjects: number;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<IntakeEditValues>(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function set(target: FieldTarget, key: string, value: Value) {
    setValues((v) => ({ ...v, [target]: { ...v[target], [key]: value } }));
  }

  function setRow(list: "education" | "experience", index: number, key: string, value: string) {
    setValues((v) => ({
      ...v,
      [list]: v[list].map((r, i) => (i === index ? { ...r, [key]: value } : r)),
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // Send only what changed, so untouched (possibly legacy) values are never re-validated.
    const diff = (target: FieldTarget) => {
      const out: Record<string, Value> = {};
      for (const f of fields.filter((f) => f.target === target)) {
        const now = values[target][f.key];
        const before = initial[target][f.key];
        if (now !== undefined && JSON.stringify(now) !== JSON.stringify(before)) out[f.key] = now;
      }
      return out;
    };
    const additional = diff("additional");
    if (hasCvLists) {
      if (JSON.stringify(values.education) !== JSON.stringify(initial.education)) additional.education = values.education as never;
      if (JSON.stringify(values.experience) !== JSON.stringify(initial.experience)) additional.experience = values.experience as never;
    }
    const payload = { client: diff("client"), project: diff("project"), additional };

    if (
      Object.keys(payload.client).length + Object.keys(payload.project).length + Object.keys(additional).length ===
      0
    ) {
      setBusy(false);
      setError("Nothing has changed yet.");
      return;
    }

    try {
      const res = await fetch(`/api/admin/projects/${projectCode}/intake`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Please check the form.");
      }
      router.push(`/admin/projects/${projectCode}?tab=requirements`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function render(f: IntakeFieldDef) {
    const id = `f-${f.target}-${f.key}`;
    const val = values[f.target][f.key];
    const str = isArrayField(val) ? "" : (val ?? "");
    const wide = f.kind === "textarea";

    let control: React.ReactNode;
    switch (f.kind) {
      case "textarea":
        control = <Textarea id={id} rows={4} value={str} onChange={(e) => set(f.target, f.key, e.target.value)} />;
        break;
      case "select":
        control = (
          <Select id={id} value={str} onChange={(e) => set(f.target, f.key, e.target.value)}>
            <option value="">Not set</option>
            {f.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        );
        break;
      case "number":
        control = (
          <Input id={id} type="number" inputMode="numeric" min={1} value={str} onChange={(e) => set(f.target, f.key, e.target.value)} />
        );
        break;
      case "date":
        control = <Input id={id} type="date" value={str} onChange={(e) => set(f.target, f.key, e.target.value)} />;
        break;
      case "tags":
        control = (
          <TagInput id={id} value={isArrayField(val) ? val : []} onChange={(next) => set(f.target, f.key, next)} />
        );
        break;
      case "university":
        control = (
          <UniversityCombobox id={id} universities={universities} value={str} onChange={(v) => set(f.target, f.key, v)} />
        );
        break;
      default:
        control = <Input id={id} value={str} onChange={(e) => set(f.target, f.key, e.target.value)} />;
    }

    return (
      <Field key={id} label={f.label} htmlFor={id} hint={f.hint} className={wide ? "sm:col-span-2" : undefined}>
        {control}
      </Field>
    );
  }

  const section = (target: FieldTarget) => fields.filter((f) => f.target === target);

  return (
    <form onSubmit={save} noValidate className="max-w-3xl space-y-12">
      <FormSection
        title="Client details"
        description={
          sharedClientProjects > 0
            ? `These belong to the client, so the change also shows on their ${sharedClientProjects} other project${sharedClientProjects === 1 ? "" : "s"}.`
            : "These belong to the client."
        }
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{section("client").map(render)}</div>
      </FormSection>

      <FormSection title="Project details" description="What the client asked for on the intake form.">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{section("project").map(render)}</div>
      </FormSection>

      {section("additional").length > 0 ? (
        <FormSection title="Service details">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{section("additional").map(render)}</div>
        </FormSection>
      ) : null}

      {hasCvLists ? (
        <>
          <FormSection title="Education">
            <RowEditor
              rows={values.education}
              fields={EDU_FIELDS}
              addLabel="Add education"
              onChange={(i, k, v) => setRow("education", i, k, v)}
              onAdd={() =>
                setValues((v) => ({ ...v, education: [...v.education, { degree: "", school: "", year: "", cgpa: "" }] }))
              }
              onRemove={(i) => setValues((v) => ({ ...v, education: v.education.filter((_, x) => x !== i) }))}
            />
          </FormSection>
          <FormSection title="Experience">
            <RowEditor
              rows={values.experience}
              fields={EXP_FIELDS}
              addLabel="Add experience"
              onChange={(i, k, v) => setRow("experience", i, k, v)}
              onAdd={() =>
                setValues((v) => ({
                  ...v,
                  experience: [...v.experience, { title: "", company: "", dates: "", description: "" }],
                }))
              }
              onRemove={(i) => setValues((v) => ({ ...v, experience: v.experience.filter((_, x) => x !== i) }))}
            />
          </FormSection>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <FormActions>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          Save changes
        </Button>
      </FormActions>
    </form>
  );
}

function RowEditor({
  rows,
  fields,
  addLabel,
  onChange,
  onAdd,
  onRemove,
}: {
  rows: Row[];
  fields: [string, string][];
  addLabel: string;
  onChange: (index: number, key: string, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="space-y-4">
      {rows.map((row, i) => (
        <div key={i} className="space-y-3 rounded-2xl bg-zone p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map(([key, label]) => (
              <Field key={key} label={label} htmlFor={`row-${addLabel}-${i}-${key}`}>
                {key === "description" ? (
                  <Textarea
                    id={`row-${addLabel}-${i}-${key}`}
                    rows={3}
                    value={row[key] ?? ""}
                    onChange={(e) => onChange(i, key, e.target.value)}
                  />
                ) : (
                  <Input
                    id={`row-${addLabel}-${i}-${key}`}
                    value={row[key] ?? ""}
                    onChange={(e) => onChange(i, key, e.target.value)}
                  />
                )}
              </Field>
            ))}
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => onRemove(i)}>
            <LuTrash2 className="size-4" aria-hidden />
            Remove
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={onAdd}>
        <LuPlus className="size-4" aria-hidden />
        {addLabel}
      </Button>
    </div>
  );
}
