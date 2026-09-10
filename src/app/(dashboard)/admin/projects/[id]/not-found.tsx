import Link from "next/link";
import { LuFileQuestion } from "react-icons/lu";
import { Button } from "@/components/ui/button";

export default function ProjectNotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <span className="rounded-lg bg-elevated p-2.5 text-muted-foreground">
        <LuFileQuestion className="size-6" aria-hidden />
      </span>
      <p className="text-sm font-medium text-foreground">Project not found</p>
      <p className="max-w-[42ch] text-xs text-muted-foreground">
        This project ID does not exist, or it may have been removed.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-1">
        <Link href="/admin/projects">Back to projects</Link>
      </Button>
    </div>
  );
}
