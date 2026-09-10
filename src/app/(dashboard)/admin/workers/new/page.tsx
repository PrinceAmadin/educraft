import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewWorkerForm } from "@/components/workers/NewWorkerForm";

export const metadata: Metadata = { title: "Add worker" };

export default function NewWorkerPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/admin/workers"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All workers
      </Link>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Add worker</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a worker profile so they can be assigned to projects.
        </p>
      </div>
      <NewWorkerForm />
    </div>
  );
}
