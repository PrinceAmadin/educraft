import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div className="space-y-5">
      <div><Skeleton className="h-8 w-40" /><Skeleton className="mt-2 h-4 w-96 max-w-full" /></div>
      <Skeleton className="h-[132px] w-full rounded-xl" />
      <div className="hidden md:block">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[53px] rounded-none" />)}
      </div>
      <ul className="space-y-3 md:hidden">{Array.from({ length: 5 }).map((_, i) => <li key={i}><Skeleton className="h-[120px] rounded-xl" /></li>)}</ul>
    </div>
  );
}
