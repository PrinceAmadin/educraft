import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LuMessageCircle } from "react-icons/lu";
import { getClientScope } from "@/lib/api";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared/PageHeader";
import { FormSection } from "@/components/forms/FormSection";
import { ClientPasswordForm } from "@/components/client/ClientPasswordForm";
import { ClientAccountActions } from "@/components/client/ClientAccountActions";
import { educraftWaLink } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ClientProfilePage() {
  const scope = await getClientScope();
  if (!scope) redirect("/client/login");

  // One record per person; if older duplicates are still linked, the oldest is theirs.
  const client = await db.client.findFirst({
    where: { id: { in: scope.clientIds } },
    orderBy: { createdAt: "asc" },
    select: {
      clientId: true,
      fullName: true,
      email: true,
      phone: true,
      faculty: true,
      department: true,
      level: true,
      university: { select: { name: true } },
    },
  });
  if (!client) redirect("/client/login");

  const details: { label: string; value: string | null; mono?: boolean }[] = [
    { label: "Client ID", value: client.clientId, mono: true },
    { label: "Name", value: client.fullName },
    { label: "Email", value: client.email },
    { label: "Phone", value: client.phone },
    { label: "University", value: client.university?.name ?? null },
    { label: "Faculty", value: client.faculty },
    { label: "Department", value: client.department },
    { label: "Level", value: client.level },
  ];

  return (
    <div className="space-y-10">
      <PageHeader title="Profile" description="Your details, password and notifications." />

      <FormSection title="Your details" description="Use your Client ID or your email to sign in.">
        <dl className="grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
          {details
            .filter((d) => d.value && d.value.trim())
            .map((d) => (
              <div key={d.label}>
                <dt className="meta-label">{d.label}</dt>
                <dd className={d.mono ? "mt-1 font-mono text-[15px] text-foreground" : "mt-1 break-words text-[15px] text-foreground"}>
                  {d.value}
                </dd>
              </div>
            ))}
        </dl>
        <a
          href={educraftWaLink(`Hi EduCraft, please update my details. My Client ID is ${client.clientId}.`)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <LuMessageCircle className="size-4" aria-hidden />
          Something wrong? Message us on WhatsApp to change it
        </a>
      </FormSection>

      <FormSection title="Password">
        <ClientPasswordForm clientId={client.clientId} />
      </FormSection>

      <FormSection title="Notifications and sign out">
        <ClientAccountActions />
      </FormSection>
    </div>
  );
}
