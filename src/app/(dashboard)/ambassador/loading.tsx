import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-[180px] w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-[104px] rounded-xl" />)}</div>
      <Skeleton className="h-[110px] w-full rounded-xl" />
    </div>
  );
}
