import type { Metadata } from "next";
import { LuInbox } from "react-icons/lu";
import { EmptyState } from "@/components/shared/EmptyState";
import { ServicesCatalogue } from "@/components/services/ServicesCatalogue";
import { getActiveServices } from "@/lib/services/intake";
import { DOWNPAYMENT_PERCENTAGE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Every EduCraft service with pricing — final year projects, reports, presentations, CVs, editing and more.",
};
export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const services = await getActiveServices();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-[clamp(2.5rem,7vh,4.5rem)] sm:px-6">
      <header className="max-w-2xl">
        <h1 className="font-display text-[clamp(2rem,4.2vw,2.75rem)] font-bold leading-[1.08] tracking-tight text-foreground">
          Services
        </h1>
        <p className="mt-3 max-w-[54ch] text-[15px] leading-relaxed text-muted-foreground sm:text-base">
          Everything you need for academic, technical and professional documentation. Prices are up
          front — you pay {DOWNPAYMENT_PERCENTAGE}% to begin and the balance once the work passes quality
          review.
        </p>
      </header>

      <div className="mt-8 sm:mt-10">
        {services.length === 0 ? (
          <EmptyState
            icon={LuInbox}
            title="No services listed right now"
            description="Please check back shortly."
          />
        ) : (
          <ServicesCatalogue services={services} />
        )}
      </div>
    </div>
  );
}
