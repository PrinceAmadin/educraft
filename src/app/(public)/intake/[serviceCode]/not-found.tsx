import Link from "next/link";
import { LuSearchX } from "react-icons/lu";
import { Button } from "@/components/ui/button";

export default function ServiceNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-20 text-center">
      <span className="rounded-lg bg-elevated p-2.5 text-muted-foreground"><LuSearchX className="size-6" aria-hidden /></span>
      <p className="text-sm font-medium text-foreground">Service not found</p>
      <p className="text-xs text-muted-foreground">That service link is invalid or no longer available.</p>
      <Button asChild variant="outline" size="sm" className="mt-1"><Link href="/intake">Browse services</Link></Button>
    </div>
  );
}
