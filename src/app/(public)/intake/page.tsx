import type { Metadata } from "next";
import { LuInbox } from "react-icons/lu";
import { EmptyState } from "@/components/shared/EmptyState";
import { ServiceGrid } from "@/components/intake/ServiceGrid";
import { getActiveServices } from "@/lib/services/intake";

export const metadata: Metadata = {
  title: "Start a project",
  description: "Choose a service to begin. Affordable academic services for Nigerian students.",
};
export const dynamic = "force-dynamic";

export default async function IntakePage() {
  const services = await getActiveServices();

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
      </div>

      {services.length === 0 ? (
        <EmptyState
          icon={LuInbox}
          title="No services available right now"
          description="Please check back shortly, or reach us on WhatsApp at 07063421088."
        />
      ) : (
        <ServiceGrid services={services} />
      )}
    </div>
  );
}
