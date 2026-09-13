import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  LuArrowLeft,
  LuClock,
  LuShieldCheck,
  LuUserCheck,
  LuWallet,
  LuZap,
} from "react-icons/lu";
import { ActionLink } from "@/components/primitives/ActionLink";
import { getServiceByCode } from "@/lib/services/intake";
import { resolveTemplate } from "@/lib/intake-templates";
import { SERVICE_GROUPS, groupKeyFor, priceLabel, turnaroundLabel } from "@/lib/service-groups";
import { formatNaira } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { serviceCode: string };
}): Promise<Metadata> {
  const service = await getServiceByCode(params.serviceCode);
  return service
    ? { title: service.serviceName, description: service.description ?? `${service.serviceName} — EduCraft` }
    : { title: "Service not found" };
}

/**
 * One service, in full. This is where the primary call to action lives — the
 * catalogue rows only say "Details", so the decision to start is made here,
 * beside what it costs and what happens next.
 */
export default async function ServiceDetailPage({ params }: { params: { serviceCode: string } }) {
  const service = await getServiceByCode(params.serviceCode);
  if (!service) notFound();

  const group = SERVICE_GROUPS.find((g) => g.key === groupKeyFor(service));
  const online = resolveTemplate(service.intakeFormTemplate) != null;
  const fixed = service.pricingModel === "FIXED" || (service.pricingModel === "VARIABLE" && service.basePrice > 0);
  const downpayment = Math.round((service.basePrice * service.downpaymentPercentage) / 100);

  const options = service.variants.length
    ? [
        {
          name: service.variants.every((v) => /^with\s/i.test(v.name))
            ? `Without ${service.variants[0].name.replace(/^with\s/i, "")}`
            : "Standard",
          total: service.basePrice,
        },
        ...service.variants.map((v) => ({ name: v.name, total: service.basePrice + v.priceAddon })),
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-[clamp(2rem,6vh,4rem)] sm:px-6">
      <Link
        href="/services"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <LuArrowLeft className="size-4" aria-hidden />
        All services
      </Link>

      <header className="mt-4">
        {group ? <p className="eyebrow">{group.label}</p> : null}
        <h1 className="mt-3 font-display text-[clamp(1.875rem,4vw,2.625rem)] font-bold leading-[1.1] tracking-tight text-foreground">
          {service.serviceName}
        </h1>
        {service.description ? (
          <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            {service.description}
          </p>
        ) : null}
      </header>

      {/* ── The number first ── */}
      <section aria-label="Price" className="mt-10">
        <p className="meta-label">Price</p>
        <p className="mt-1 font-mono text-[clamp(2rem,5vw,2.75rem)] font-medium leading-none tabular-nums text-foreground">
          {priceLabel(service)}
        </p>

        {options.length ? (
          <ul className="mt-6 divide-y divide-border/80 border-y border-border/80">
            {options.map((o) => (
              <li key={o.name} className="flex items-baseline justify-between gap-4 py-3 text-[15px]">
                <span className="text-foreground">{o.name}</span>
                <span className="font-mono font-medium tabular-nums text-foreground">{formatNaira(o.total)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* ── Facts, as a quiet zone rather than four boxes ── */}
      <dl className="mt-8 grid grid-cols-1 gap-x-8 gap-y-5 rounded-2xl bg-zone p-5 sm:grid-cols-2 sm:p-6">
        <Fact icon={LuClock} label="Typical turnaround" value={turnaroundLabel(service.estimatedDays)} />
        {service.expressDeliverySurcharge ? (
          <Fact
            icon={LuZap}
            label="Express delivery"
            value={`+${formatNaira(service.expressDeliverySurcharge)}`}
            mono
          />
        ) : null}
        <Fact
          icon={LuWallet}
          label="To begin"
          value={
            fixed && service.basePrice > 0
              ? `${service.downpaymentPercentage}% — ${formatNaira(downpayment)}${options.length ? " and up" : ""}`
              : `${service.downpaymentPercentage}% of the agreed price`
          }
        />
        <Fact icon={LuShieldCheck} label="Before delivery" value="Mandatory quality review" />
      </dl>

      {/* ── What happens next ── */}
      <section className="mt-12" aria-labelledby="next-steps">
        <h2 id="next-steps" className="text-lg font-semibold tracking-tight text-foreground">
          What happens next
        </h2>
        <ol className="mt-4 space-y-4">
          {[
            online
              ? "Fill in one short form with your topic, department format and any files you already have."
              : "Send us your brief on WhatsApp — this service is quoted and confirmed in conversation.",
            `A specialist in your field is assigned once the ${service.downpaymentPercentage}% downpayment is verified.`,
            "Every file passes EduCraft's quality review before release.",
            "Pay the balance and receive the finished work.",
          ].map((step, i) => (
            <li key={i} className="flex gap-4">
              <span className="mt-0.5 font-mono text-sm font-medium tabular-nums text-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[15px] leading-relaxed text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-12 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-9">
        <ActionLink href={`/intake/${service.serviceCode}`} variant="primary">
          {online ? "Start this project" : "Enquire about this service"}
        </ActionLink>
        <ActionLink href="/services">Browse all services</ActionLink>
      </div>

      <p className="mt-10 flex items-center gap-2 text-[13px] text-muted-foreground">
        <LuUserCheck className="size-4 shrink-0" aria-hidden />
        Questions first? Call or WhatsApp 07063421088.
      </p>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-[18px] shrink-0 text-primary" aria-hidden />
      <div>
        <dt className="meta-label">{label}</dt>
        <dd className={mono ? "mt-0.5 font-mono text-[15px] font-medium tabular-nums text-foreground" : "mt-0.5 text-[15px] text-foreground"}>
          {value}
        </dd>
      </div>
    </div>
  );
}
