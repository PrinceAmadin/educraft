"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";

type StatusResponse =
  | { state: "pending" }
  | { state: "consumed"; projectCode: string }
  | { state: "failed" }
  | { state: "not_found" };

/**
 * Paystack's callback redirect can land here before the webhook has finished
 * creating the project server-side, so this polls until it shows up rather
 * than assuming it's already there.
 */
export function IntakeFinalizing({ reference }: { reference: string }) {
  const router = useRouter();
  const [failed, setFailed] = React.useState(false);
  const attemptsRef = React.useRef(0);

  React.useEffect(() => {
    let cancelled = false;

    async function poll() {
      attemptsRef.current += 1;
      try {
        const res = await fetch(`/api/intake/status?ref=${encodeURIComponent(reference)}`);
        const body = (await res.json().catch(() => null)) as StatusResponse | null;
        if (cancelled || !body) return;

        if (body.state === "consumed") {
          router.replace(`/intake/success?p=${encodeURIComponent(body.projectCode)}`);
          return;
        }
        if (body.state === "failed" || body.state === "not_found") {
          setFailed(true);
          return;
        }
      } catch {
        // transient — keep polling
      }

      // Give up after ~2 minutes; a webhook that slow almost certainly needs
      // a manual admin resync rather than an indefinitely spinning client.
      if (!cancelled && attemptsRef.current < 60) {
        setTimeout(poll, 2000);
      } else if (!cancelled) {
        setFailed(true);
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [reference, router]);

  if (failed) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center sm:py-20">
        <span className="rounded-full bg-danger/12 p-3 text-danger">
          <LuCircleAlert className="size-8" aria-hidden />
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          We couldn&apos;t confirm your payment
        </h1>
        <p className="mt-3 text-muted-foreground">
          If Paystack took your payment, message us on 07063421088 with your payment reference and
          we&apos;ll sort it out. Otherwise, you can try submitting again.
        </p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">{reference}</p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/intake">Back to intake</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center sm:py-20">
      <LuLoaderCircle className="size-8 animate-spin text-primary" aria-hidden />
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Confirming your payment…
      </h1>
      <p className="mt-3 text-muted-foreground">
        This only takes a few seconds. Don&apos;t close this page.
      </p>
    </div>
  );
}
