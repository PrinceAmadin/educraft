"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LuCalendarRange, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Admin-only date range for the Analytics, Quality and Raw log tabs. Dates are
 * Nigerian calendar days, both ends inclusive. The range lives in the URL
 * (`from`, `to`) so it survives tab switches and can be shared.
 */
export function DateRangePicker({ from, to }: { from?: string; to?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [start, setStart] = React.useState(from ?? "");
  const [end, setEnd] = React.useState(to ?? "");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setStart(from ?? "");
    setEnd(to ?? "");
  }, [from, to]);

  function push(next: { from?: string; to?: string }) {
    const q = new URLSearchParams(searchParams.toString());
    q.delete("from");
    q.delete("to");
    if (next.from && next.to) {
      q.set("from", next.from);
      q.set("to", next.to);
    }
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }

  function apply() {
    if (!start || !end) return setError("Pick both dates.");
    if (end < start) return setError("The end date is before the start date.");
    const days = (Date.parse(end) - Date.parse(start)) / 86_400_000;
    if (days >= 366) return setError("Choose a range of less than a year.");
    setError(null);
    push({ from: start, to: end });
  }

  const active = Boolean(from && to);
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      <label className="block">
        <span className="meta-label mb-1 flex items-center gap-1.5">
          <LuCalendarRange className="size-3.5" aria-hidden /> From
        </span>
        <Input type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} className="h-10 w-40" />
      </label>
      <label className="block">
        <span className="meta-label mb-1 block">To</span>
        <Input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} className="h-10 w-40" />
      </label>
      <Button type="button" size="sm" onClick={apply} className="h-10">
        Apply
      </Button>
      {active ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-10"
          onClick={() => {
            setStart("");
            setEnd("");
            setError(null);
            push({});
          }}
        >
          <LuX className="size-4" aria-hidden /> Clear
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="basis-full text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
