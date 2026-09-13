import { Skeleton } from "@/components/ui/skeleton";

export default function ClientsLoading() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-12 w-full max-w-md" />
      <div className="hidden md:block">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-[53px] rounded-none" />
        ))}
      </div>
      <ul className="space-y-3 md:hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i}><Skeleton className="h-[116px] rounded-xl" /></li>
        ))}
      </ul>
    </div>
  );
}
