import { Skeleton } from "@/components/ui/skeleton";

export default function NewProjectLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Skeleton className="h-4 w-24" />
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-full max-w-lg" />
      </div>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-[420px] w-full rounded-xl" />
    </div>
  );
}
