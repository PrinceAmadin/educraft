"use client";

import { useEffect } from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";

export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin/projects]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-zone px-6 py-16 text-center">
      <span className="rounded-lg bg-danger/12 p-2.5 text-danger">
        <LuTriangleAlert className="size-6" aria-hidden />
      </span>
      <p className="text-sm font-medium text-foreground">Could not load projects</p>
      <p className="max-w-[42ch] text-xs text-muted-foreground">
        Something went wrong reaching the database. This is usually temporary.
      </p>
      <Button variant="outline" size="sm" className="mt-1" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
