"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EXPENSE_FILTER_CATEGORIES } from "@/lib/validations/expenses";

export function ExpensesFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function commit(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const activeCount = ["category", "from", "to"].filter((k) => searchParams.get(k)).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <FilterSelect
          label="Category"
          value={searchParams.get("category") ?? ""}
          onChange={(v) => commit({ category: v || null })}
        >
          <option value="">All categories</option>
          {EXPENSE_FILTER_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </FilterSelect>

        <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-2">
          <FilterDate
            label="From"
            value={searchParams.get("from") ?? ""}
            onChange={(v) => commit({ from: v || null })}
          />
          <FilterDate
            label="To"
            value={searchParams.get("to") ?? ""}
            onChange={(v) => commit({ to: v || null })}
          />
        </div>
      </div>

      {activeCount > 0 ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {activeCount} filter{activeCount === 1 ? "" : "s"} active
          </p>
          <Button variant="ghost" size="sm" onClick={() => router.replace(pathname, { scroll: false })}>
            <X className="size-4" aria-hidden />
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block meta-label">
        {label}
      </span>
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 text-sm" aria-label={label}>
        {children}
      </Select>
    </label>
  );
}

function FilterDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block meta-label">
        {label}
      </span>
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 text-sm"
        aria-label={`${label} date`}
      />
    </label>
  );
}
