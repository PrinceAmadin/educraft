"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function QaStartReview({ projectCode }: { projectCode: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/qa/${projectCode}/start`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not start the review.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the review.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-gold/30 bg-gold/10 p-4">
      <p className="text-sm font-medium text-foreground">This project is waiting for QA</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Starting the review moves it to IN QA REVIEW and assigns it to you.
      </p>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      <Button size="sm" className="mt-3" onClick={start} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Start QA review
      </Button>
    </div>
  );
}
