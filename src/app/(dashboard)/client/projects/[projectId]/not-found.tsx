import Link from "next/link";
import { LuFolderX } from "react-icons/lu";
import { Button } from "@/components/ui/button";

/** Same answer whether the project does not exist or belongs to someone else. */
export default function ClientProjectNotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-zone px-6 py-16 text-center">
      <span className="rounded-lg bg-elevated p-2.5 text-muted-foreground">
        <LuFolderX className="size-6" aria-hidden />
      </span>
      <p className="text-sm font-medium text-foreground">We couldn&apos;t find this project on your account</p>
      <p className="max-w-[42ch] text-xs text-muted-foreground">
        Check the project ID, or open it from your list of projects.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-1">
        <Link href="/client">My projects</Link>
      </Button>
    </div>
  );
}
