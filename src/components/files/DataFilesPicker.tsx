"use client";

import * as React from "react";
import { LuCircleAlert, LuFileText, LuLoaderCircle, LuUpload, LuX } from "react-icons/lu";
import { acceptAttribute, allowedKindsLabel, contentTypeFor, maxBytesFor } from "@/lib/files/policy";
import { humanSize, uploadPrivateFile, type UploadedRef } from "@/lib/files/upload-client";
import { cn } from "@/lib/utils";

interface Item {
  key: string;
  name: string;
  size: number;
  progress: number | null;
  ref: UploadedRef | null;
  error: string | null;
}

/**
 * D4: pick several data files for a pause. Each uploads straight away to the
 * private store (with progress); the parent gets the finished references and
 * sends them with its own action. Checks type and size before uploading, so a
 * wrong file is refused on the phone, not after a long upload.
 */
export function DataFilesPicker({
  endpoint,
  targetId,
  onChange,
  onBusyChange,
  max = 10,
  id,
  label = "Choose files",
  disabled = false,
}: {
  endpoint: string;
  targetId: string;
  onChange: (refs: UploadedRef[]) => void;
  onBusyChange?: (busy: boolean) => void;
  max?: number;
  id: string;
  label?: string;
  disabled?: boolean;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [items, setItems] = React.useState<Item[]>([]);
  const [notice, setNotice] = React.useState<string | null>(null);
  const aborts = React.useRef(new Map<string, AbortController>());
  const limitMb = Math.round(maxBytesFor("data") / 1024 / 1024);

  React.useEffect(() => {
    const controllers = aborts.current;
    return () => controllers.forEach((c) => c.abort());
  }, []);

  // Tell the parent what is ready and whether anything is still uploading.
  React.useEffect(() => {
    onChange(items.filter((i) => i.ref).map((i) => i.ref!));
    onBusyChange?.(items.some((i) => i.progress !== null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const update = (key: string, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function upload(item: Item, file: File) {
    const controller = new AbortController();
    aborts.current.set(item.key, controller);
    try {
      const ref = await uploadPrivateFile(file, {
        endpoint,
        purpose: "data",
        targetId,
        onProgress: (p) => update(item.key, { progress: p }),
        signal: controller.signal,
      });
      update(item.key, { ref, progress: null });
    } catch (err) {
      if (controller.signal.aborted) return;
      update(item.key, { progress: null, error: err instanceof Error ? err.message : "The upload failed. Try again." });
    } finally {
      aborts.current.delete(item.key);
    }
  }

  function onPick(list: FileList | null) {
    if (!list?.length) return;
    setNotice(null);
    const room = max - items.filter((i) => !i.error).length;
    const files = Array.from(list);
    if (files.length > room) setNotice(`You can send ${max} files at a time. The first ${Math.max(0, room)} were added.`);
    const added: { item: Item; file: File }[] = files.slice(0, Math.max(0, room)).map((file) => {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`;
      const wrongType = !contentTypeFor("data", file.name);
      const tooBig = file.size > maxBytesFor("data");
      const error = wrongType
        ? `${file.name} isn't a file we can use. Send PDF, Word, Excel, CSV, JPG or PNG.`
        : tooBig
          ? `${file.name} is over ${limitMb} MB. Send a smaller copy.`
          : null;
      return { item: { key, name: file.name, size: file.size, progress: error ? null : 0, ref: null, error }, file };
    });
    setItems((list) => [...list, ...added.map((a) => a.item)]);
    for (const a of added) if (!a.item.error) void upload(a.item, a.file);
    if (input.current) input.current.value = "";
  }

  function remove(key: string) {
    aborts.current.get(key)?.abort();
    setItems((list) => list.filter((i) => i.key !== key));
  }

  const count = items.filter((i) => !i.error).length;

  return (
    <div className="space-y-3">
      {items.length ? (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.key} className="rounded-xl bg-card px-3.5 py-3 shadow-soft" aria-live="polite">
              <div className="flex items-center gap-3">
                {i.progress !== null ? (
                  <LuLoaderCircle className="size-5 shrink-0 animate-spin text-primary" aria-hidden />
                ) : i.error ? (
                  <LuCircleAlert className="size-5 shrink-0 text-danger" aria-hidden />
                ) : (
                  <LuFileText className="size-5 shrink-0 text-primary" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{i.name}</p>
                  <p className={cn("text-xs", i.error ? "text-danger" : "text-muted-foreground")}>
                    {i.error ?? (i.progress !== null ? `Uploading · ${i.progress}%` : `Uploaded · ${humanSize(i.size)}`)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(i.key)}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={i.progress !== null ? `Cancel ${i.name}` : `Remove ${i.name}`}
                >
                  <LuX className="size-4" aria-hidden />
                </button>
              </div>
              {i.progress !== null ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zone">
                  <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${i.progress}%` }} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {count < max ? (
        <label
          className={cn(
            "flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-input-border bg-input px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-card",
            "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
            disabled && "pointer-events-none opacity-50"
          )}
        >
          <input
            ref={input}
            id={id}
            type="file"
            multiple
            accept={acceptAttribute("data")}
            className="sr-only"
            disabled={disabled}
            onChange={(e) => onPick(e.target.files)}
          />
          <LuUpload className="size-4 text-primary" aria-hidden />
          {items.length ? "Add more files" : label}
        </label>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {allowedKindsLabel("data")}. Up to {max} files.
      </p>
      {notice ? <p className="text-xs text-gold">{notice}</p> : null}
    </div>
  );
}
