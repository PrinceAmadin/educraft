import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { NewProjectForm } from "@/components/projects/NewProjectForm";
import { listAllocatableAmbassadors } from "@/lib/services/ambassador-commission";

export const metadata: Metadata = { title: "New project" };
export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const [universities, services, ambassadors] = await Promise.all([
    db.university.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, abbreviation: true },
    }),
    db.service.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { serviceName: "asc" }],
      select: {
        id: true,
        serviceName: true,
        basePrice: true,
        pricingModel: true,
        estimatedDays: true,
        intakeFormTemplate: true,
        expressDeliverySurcharge: true,
        variants: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, priceAddon: true },
        },
      },
    }),
    listAllocatableAmbassadors(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/admin/projects"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All projects
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          New project
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          For clients who reach out on WhatsApp before the intake form. Creates the client if they
          are new, and opens the project at NEW.
        </p>
      </div>

      <NewProjectForm universities={universities} services={services} ambassadors={ambassadors} />
    </div>
  );
}
