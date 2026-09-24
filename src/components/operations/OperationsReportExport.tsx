"use client";

import * as React from "react";
import { LuFileText, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";

/** The monthly operations report as a Word document, ready to send to the CEO. */
export function OperationsReportExport({ month }: { month: string }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reports/operations/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not build the report.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `educraft-operations-report-${month}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => void download()} disabled={busy}>
        {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuFileText className="size-4" aria-hidden />}
        Monthly report (.docx)
      </Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
