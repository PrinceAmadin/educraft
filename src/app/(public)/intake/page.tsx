import type { Metadata } from "next";
import { LuInbox } from "react-icons/lu";
import { EmptyState } from "@/components/shared/EmptyState";
import { ServiceGrid } from "@/components/intake/ServiceGrid";
import { getActiveServices } from "@/lib/services/intake";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Start a project",
  description: "Choose a service to begin. Affordable academic services for Nigerian students.",
};
export const dynamic = "force-dynamic";

export default async function IntakePage({
  searchParams,
}: {
  searchParams: { ref?: string };
}) {
  const ref = searchParams.ref?.trim();

  const [services, referrer] = await Promise.all([
    getActiveServices(),
    ref
      ? db.ambassador.findUnique({
          where: { referralCode: ref },
          select: { fullName: true, status: true },
        })
      : Promise.resolve(null),
  ]);

  const validRef =
    referrer && referrer.status !== "Suspended" && referrer.status !== "Terminated" ? ref : undefined;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Start a project
        </h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          Pick the service you need. You&apos;ll fill in a short form, we confirm the details, and
          work begins once your 45% downpayment lands.
        </p>
        {validRef ? (
          <p className="mt-3 inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            Referred by {referrer?.fullName} — your code is applied automatically
          </p>
        ) : null}
      </div>

      {services.length === 0 ? (
        <EmptyState
          icon={LuInbox}
          title="No services available right now"
          description="Please check back shortly, or reach us on WhatsApp at 07063421088."
        />
      ) : (
        <ServiceGrid services={services} referralCode={validRef} />
      )}
    </div>
  );
}
