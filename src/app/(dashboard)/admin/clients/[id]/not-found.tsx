import Link from "next/link";
import { LuUserX } from "react-icons/lu";
import { Button } from "@/components/ui/button";

export default function ClientNotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-zone px-6 py-16 text-center">
      <span className="rounded-lg bg-elevated p-2.5 text-muted-foreground">
        <LuUserX className="size-6" aria-hidden />
      </span>
      <p className="text-sm font-medium text-foreground">Client not found</p>
      <p className="max-w-[42ch] text-xs text-muted-foreground">
        This client ID does not exist, or the record may have been removed.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-1">
        <Link href="/admin/clients">Back to clients</Link>
      </Button>
    </div>
  );
}
