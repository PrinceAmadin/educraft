import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectsLoading() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[62px]" />
          ))}
        </div>
      </div>

      {/* Mobile card skeletons */}
      <ul className="space-y-3 md:hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i}>
            <Skeleton className="h-[132px] rounded-xl" />
          </li>
        ))}
      </ul>

      {/* Desktop table skeleton */}
      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
        <div className="space-y-px">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-[52px] rounded-none" />
          ))}
        </div>
      </div>
    </div>
  );
}
