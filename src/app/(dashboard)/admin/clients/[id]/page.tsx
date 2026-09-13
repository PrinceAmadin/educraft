import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LuPhone, LuMail, LuBuilding2, LuMegaphone } from "react-icons/lu";
import { getClientDetail } from "@/lib/services/clients";
import { ClientNotes } from "@/components/clients/ClientNotes";
import { ClientProjectHistory } from "@/components/clients/ClientProjectHistory";
import { formatDate, formatNaira } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const data = await getClientDetail(params.id);
  return { title: data ? data.client.fullName : "Client not found" };
}

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const data = await getClientDetail(params.id);
  if (!data) notFound();

  const { client, stats } = data;

  return (
    <div className="space-y-5">
      <Link
        href="/admin/clients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All clients
      </Link>

      {/* Header */}
      <div className="surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
              {client.fullName}
            </h1>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{client.clientId}</p>
          </div>
          {client.referredBy ? (
            <Link
              href={`/admin/ambassadors/${client.referredBy.id}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-elevated px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <LuMegaphone className="size-3.5" aria-hidden />
              Referred by {client.referredBy.fullName}
            </Link>
          ) : null}
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field icon={LuPhone} label="Phone">
            <a href={`tel:${client.phone}`} className="hover:text-primary">
              {client.phone}
            </a>
          </Field>
          <Field icon={LuMail} label="Email">
            {client.email ? (
              <a href={`mailto:${client.email}`} className="hover:text-primary">
                {client.email}
              </a>
            ) : (
              <span className="text-subtle">Not provided</span>
            )}
          </Field>
          <Field icon={LuBuilding2} label="University">
            {client.university?.name ?? "—"}
            {client.university?.abbreviation ? (
              <span className="text-muted-foreground"> ({client.university.abbreviation})</span>
            ) : null}
          </Field>
          <Field label="Department">{client.department}</Field>
          <Field label="Faculty">{client.faculty || <span className="text-subtle">—</span>}</Field>
          <Field label="Level">{client.level}</Field>
        </dl>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Projects" value={String(stats.totalProjects)} />
        <Stat label="Total spent" value={formatNaira(stats.totalSpent, { compact: true })} />
        <Stat
          label="First order"
          value={stats.firstOrderDate ? formatDate(stats.firstOrderDate) : "—"}
        />
      </div>

      {/* Project history */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Project history</h2>
        <ClientProjectHistory projects={client.projects} />
      </section>

      {/* Notes */}
      <section className="surface p-4 sm:p-5">
        <ClientNotes clientId={client.id} initialNotes={client.notes} />
      </section>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon?: (props: { className?: string; "aria-hidden"?: boolean }) => React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 meta-label">
        {Icon ? <Icon className="size-3" aria-hidden /> : null}
        {label}
      </dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zone p-3 sm:p-4">
      <p className="meta-label">
        {label}
      </p>
      <p className="mt-1 font-mono text-lg font-medium tabular-nums text-foreground">{value}</p>
    </div>
  );
}
