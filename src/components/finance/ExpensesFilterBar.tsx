"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { BUCKET_META } from "@/lib/finance/commission-config";
import { EXPENSE_BUCKETS, EXPENSE_FILTER_CATEGORIES, EXPENSE_STATUSES } from "@/lib/validations/expenses";

const STATUS_LABELS: Record<(typeof EXPENSE_STATUSES)[number], string> = {
  AUTO_APPROVED: "Logged",
  PENDING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  DECLINED: "Declined",
};

const KEYS = ["category", "bucket", "status", "from", "to"] as const;

/** URL-bound filters: category, bucket, approval status and a date range. */
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

  const activeCount = KEYS.filter((k) => searchParams.get(k)).length;
  const get = (k: string) => searchParams.get(k) ?? "";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Select aria-label="Category" value={get("category")} onChange={(e) => commit({ category: e.target.value || null })}>
          <option value="">All categories</option>
          {EXPENSE_FILTER_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select aria-label="Bucket" value={get("bucket")} onChange={(e) => commit({ bucket: e.target.value || null })}>
          <option value="">All buckets</option>
          {EXPENSE_BUCKETS.map((b) => (
            <option key={b} value={b}>
              {BUCKET_META[b].label}
            </option>
          ))}
        </Select>
        <Select aria-label="Status" value={get("status")} onChange={(e) => commit({ status: e.target.value || null })}>
          <option value="">All statuses</option>
          {EXPENSE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Input type="date" aria-label="From date" value={get("from")} onChange={(e) => commit({ from: e.target.value || null, month: null })} />
        <Input type="date" aria-label="To date" value={get("to")} onChange={(e) => commit({ to: e.target.value || null, month: null })} />
      </div>

      {activeCount > 0 ? (
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => commit(Object.fromEntries(KEYS.map((k) => [k, null])))}>
          <LuX className="size-4" aria-hidden />
          Clear {activeCount} filter{activeCount === 1 ? "" : "s"}
        </Button>
      ) : null}
    </div>
  );
}
