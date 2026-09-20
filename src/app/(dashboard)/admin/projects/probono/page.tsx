import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProBonoLinks } from "@/components/projects/ProBonoLinks";
import { resolveTemplate } from "@/lib/intake-templates";
import { listInvites } from "@/lib/services/probono";

export const metadata: Metadata = { title: "Pro bono links" };
export const dynamic = "force-dynamic";

export default async function ProBonoLinksPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") redirect("/admin/projects");

  const [services, invites] = await Promise.all([
    db.service.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { serviceName: "asc" }],
      select: { serviceCode: true, serviceName: true, intakeFormTemplate: true },
    }),
    listInvites(),
  ]);

  // Only services that have an online form can be sent as a link.
  const withForms = services
    .filter((s) => resolveTemplate(s.intakeFormTemplate))
    .map(({ serviceCode, serviceName }) => ({ serviceCode, serviceName }));

  return (
    <div className="space-y-8">
      <PageHeader
        back={{ href: "/admin/projects", label: "All projects" }}
        title="Pro bono links"
        description="One-time intake links for free work. Each opens on one device only and expires when submitted."
      />
      <ProBonoLinks services={withForms} invites={invites} />
    </div>
  );
}
