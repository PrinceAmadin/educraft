"use client";

import * as React from "react";
import { upload } from "@vercel/blob/client";
import { useFormContext } from "react-hook-form";
import { LuCircleAlert, LuFileText, LuLoaderCircle, LuPaperclip, LuX } from "react-icons/lu";
import { Field } from "@/components/forms/Field";
import { MAX_ATTACHMENTS, type IntakeAttachment } from "@/lib/validations/intake";
import type { IntakeSubmitInput } from "@/lib/validations/intake";

/** Set by the form: true while any file is still uploading, so Continue and Submit wait for it. */
export const UploadBusyContext = React.createContext<(busy: boolean) => void>(() => {});

const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.webp";

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * File picker for the intake form. Files go straight from the browser to
 * storage; the form only keeps the resulting links (`attachments`), grouped by
 * `category`, so several pickers on one form share the same list.
 */
export function AttachmentsField({
  category,
  label,
  hint,
  id,
  bare = false,
}: {
  category: IntakeAttachment["category"];
  label?: string;
  hint?: string;
  id: string;
  /** Just the picker and its list, to sit under a text field that supplies the label. */
  bare?: boolean;
}) {
  const { watch, setValue } = useFormContext<IntakeSubmitInput>();
  const setBusy = React.useContext(UploadBusyContext);
  const all = (watch("attachments") ?? []) as IntakeAttachment[];
  const mine = all.filter((f) => f.category === category);
  const [pending, setPending] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const input = React.useRef<HTMLInputElement>(null);

  const busy = pending.length > 0;
  React.useEffect(() => {
    setBusy(busy);
    return () => setBusy(false);
  }, [busy, setBusy]);

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    for (const file of Array.from(files)) {
      const current = (input.current ? (watch("attachments") ?? []) : []) as IntakeAttachment[];
      if (current.length >= MAX_ATTACHMENTS) {
        setError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
        break;
      }
      if (file.size > MAX_BYTES) {
        setError(`${file.name} is over 25 MB.`);
        continue;
      }
      setPending((p) => [...p, file.name]);
      try {
        const blob = await upload(`intake/${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/intake/upload",
          contentType: file.type || undefined,
        });
        const next: IntakeAttachment = {
          url: blob.url,
          name: file.name,
          size: file.size,
          type: file.type || undefined,
          category,
        };
        setValue("attachments", [...((watch("attachments") ?? []) as IntakeAttachment[]), next], {
          shouldDirty: true,
        });
      } catch (err) {
        setError(
          err instanceof Error && err.message
            ? `${file.name}: ${err.message}`
            : `${file.name} could not be uploaded. Please try again.`
        );
      } finally {
        setPending((p) => p.filter((n) => n !== file.name));
      }
    }
    if (input.current) input.current.value = "";
  }

  function remove(url: string) {
    setValue(
      "attachments",
      ((watch("attachments") ?? []) as IntakeAttachment[]).filter((f) => f.url !== url),
      { shouldDirty: true }
    );
  }

  const body = (
      <div className="space-y-2">
        <label
          htmlFor={id}
          className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-input px-4 text-sm text-muted-foreground ring-1 ring-inset ring-input-border transition-colors hover:bg-elevated"
        >
          <LuPaperclip className="size-4 shrink-0" aria-hidden />
          <span>{busy ? "Uploading…" : "Or attach the file"}</span>
          <span className="ml-auto hidden text-xs text-subtle sm:block">PDF, Word, PowerPoint, images · up to 25 MB</span>
        </label>
        <input
          id={id}
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => void onPick(e.target.files)}
        />

        {mine.length > 0 || pending.length > 0 ? (
          <ul className="divide-y divide-border/60 text-sm">
            {mine.map((f) => (
              <li key={f.url} className="flex min-h-11 items-center gap-3 py-1">
                <LuFileText className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-foreground">{f.name}</span>
                {f.size ? <span className="shrink-0 font-mono text-xs text-subtle">{kb(f.size)}</span> : null}
                <button
                  type="button"
                  onClick={() => remove(f.url)}
                  aria-label={`Remove ${f.name}`}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-subtle hover:text-foreground"
                >
                  <LuX className="size-4" aria-hidden />
                </button>
              </li>
            ))}
            {pending.map((name) => (
              <li key={`p-${name}`} className="flex min-h-11 items-center gap-3 py-1 text-muted-foreground">
                <LuLoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{name}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? (
          <p role="alert" className="flex items-start gap-2 text-xs text-danger">
            <LuCircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
      </div>
  );

  if (bare) return body;
  return (
    <Field label={label ?? ""} htmlFor={id} hint={hint}>
      {body}
    </Field>
  );
}
