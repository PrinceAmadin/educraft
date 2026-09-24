import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { canAccessRoute, canMarkPayoutsPaid } from "@/lib/rbac";
import { getPendingPayouts } from "@/lib/services/payouts";
import { PayoutQueue } from "@/components/finance/PayoutQueue";

export const metadata: Metadata = { title: "Payout queue" };
export const dynamic = "force-dynamic";

/** Owed to workers and ambassadors. The founder and the CFO record payments; the COO only reviews. */
export default async function PayoutsPage() {
  const [session, data] = await Promise.all([auth(), getPendingPayouts()]);
  const role = session?.user?.role;
  const canMarkPaid = canMarkPayoutsPaid(role);

  return (
    <div className="space-y-5">
      {canAccessRoute(role, "/admin/finance") ? (
        <Link
          href="/admin/finance"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Finance
        </Link>
      ) : null}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Payout queue
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {canMarkPaid
            ? "Worker payouts and ambassador commissions owed on completed projects."
            : "Worker payouts and ambassador commissions owed on completed projects. Recording a payment is the CFO's step."}
        </p>
      </div>
      <PayoutQueue data={data} canMarkPaid={canMarkPaid} />
    </div>
  );
}
