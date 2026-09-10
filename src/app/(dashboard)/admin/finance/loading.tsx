import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div className="space-y-5">
      <div><Skeleton className="h-8 w-32" /><Skeleton className="mt-2 h-4 w-96 max-w-full" /></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[148px] rounded-xl" />)}
      </div>
    </div>
  );
}
