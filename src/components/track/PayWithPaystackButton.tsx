"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { LuLoaderCircle } from "react-icons/lu";

export function PayWithPaystackButton({
  projectId,
  leg,
  label,
  /** Fires the redirect once on mount — used for the "straight to Paystack" intake flow. */
  autoStart = false,
}: {
  projectId: string;
  leg: "downpayment" | "balance";
  label: string;
  autoStart?: boolean;
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const startedRef = React.useRef(false);

  const handlePay = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, leg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not start payment");
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start payment");
      setLoading(false);
    }
  }, [projectId, leg]);

  React.useEffect(() => {
    if (!autoStart || startedRef.current) return;
    startedRef.current = true;
    handlePay();
  }, [autoStart, handlePay]);

  return (
    <div className="space-y-2">
      <Button onClick={handlePay} disabled={loading} className="w-full">
        {loading ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
        {loading ? "Redirecting to Paystack…" : label}
      </Button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
