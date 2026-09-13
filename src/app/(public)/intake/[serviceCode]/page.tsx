import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LuArrowLeft as ArrowLeft } from "react-icons/lu";
import { db } from "@/lib/db";
import { getServiceByCode } from "@/lib/services/intake";
import { resolveTemplate } from "@/lib/intake-templates";
import { IntakeForm } from "@/components/intake/IntakeForm";
import { formatNaira } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { serviceCode: string };
}): Promise<Metadata> {
  const service = await getServiceByCode(params.serviceCode);
  return { title: service ? `Start: ${service.serviceName}` : "Service not found" };
}

export default async function IntakeServicePage({
  params,
  searchParams,
}: {
  params: { serviceCode: string };
  searchParams: { ref?: string };
}) {
  const service = await getServiceByCode(params.serviceCode);
  if (!service) notFound();

  const template = resolveTemplate(service.intakeFormTemplate);

  // Validate a URL referral code so the form only prefills a real one.
  const ref = searchParams.ref?.trim();
  const referrer = ref
    ? await db.ambassador.findUnique({
        where: { referralCode: ref },
        select: { status: true },
      })
    : null;
  const initialReferralCode =
    referrer && referrer.status !== "Suspended" && referrer.status !== "Terminated"
      ? ref
      : undefined;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <Link
        href="/intake"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All services
      </Link>

      <div className="mb-9 mt-3">
        <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-tight text-foreground sm:text-[2rem]">
          {service.serviceName}
        </h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          {service.pricingModel === "VARIABLE" && service.basePrice === 0
            ? "Price confirmed after review"
            : `${service.variants.length > 0 ? "from " : ""}${formatNaira(service.basePrice)}`}
          {" · "}~{service.estimatedDays} days
        </p>
      </div>

      {template ? (
        <IntakeForm
          template={template}
          service={{
            serviceCode: service.serviceCode,
            serviceName: service.serviceName,
            basePrice: service.basePrice,
            estimatedDays: service.estimatedDays,
            expressDeliverySurcharge: service.expressDeliverySurcharge,
            pricingModel: service.pricingModel,
            downpaymentPercentage: service.downpaymentPercentage,
          }}
          universities={await db.university.findMany({
            orderBy: { name: "asc" },
            select: { id: true, name: true, abbreviation: true },
          })}
          initialReferralCode={initialReferralCode}
        />
      ) : (
        <div className="rounded-2xl bg-zone p-6 text-sm">
          <p className="font-medium text-foreground">This one we handle over WhatsApp</p>
          <p className="mt-1 text-muted-foreground">
            The online form for this service isn&apos;t ready yet. Message us on 07063421088 or
            educraft611@gmail.com with your requirements and we&apos;ll take it from there.
          </p>
          <Link
            href="/intake"
            className="mt-4 inline-flex text-sm font-medium text-primary hover:underline"
          >
            Choose another service
          </Link>
        </div>
      )}
    </div>
  );
}
