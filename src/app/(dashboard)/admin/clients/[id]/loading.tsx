import { Skeleton } from "@/components/ui/skeleton";

export default function ClientDetailLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-[196px] rounded-xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-5 w-32" />
      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[53px] rounded-none" />
        ))}
      </div>
      <Skeleton className="h-[180px] rounded-xl" />
    </div>
  );
}
