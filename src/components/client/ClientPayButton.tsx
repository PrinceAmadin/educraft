"use client";

import * as React from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";

/** Starts a Paystack checkout for the signed-in client's own project and sends them there. */
export function ClientPayButton({
  projectCode,
  leg,
  label,
}: {
  projectCode: string;
  leg: "downpayment" | "balance";
  label: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/client/projects/${encodeURIComponent(projectCode)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leg }),
      });
      const data = (await res.json().catch(() => null)) as { authorizationUrl?: string; error?: string } | null;
      if (!res.ok || !data?.authorizationUrl) throw new Error(data?.error ?? "Could not start the payment. Try again.");
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the payment. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" size="lg" className="w-full sm:w-auto" onClick={() => void pay()} disabled={busy}>
        {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
        {busy ? "Opening Paystack…" : label}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
