import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPendingPayouts } from "@/lib/services/payouts";
import { PayoutQueue } from "@/components/finance/PayoutQueue";

export const metadata: Metadata = { title: "Payout queue" };
export const dynamic = "force-dynamic";

export default async function PayoutsPage() {
  const data = await getPendingPayouts();

  return (
    <div className="space-y-5">
      <Link
        href="/admin/finance"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Finance
      </Link>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Payout queue
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Worker payouts and ambassador commissions owed on completed projects.
        </p>
      </div>
      <PayoutQueue data={data} />
    </div>
  );
}
