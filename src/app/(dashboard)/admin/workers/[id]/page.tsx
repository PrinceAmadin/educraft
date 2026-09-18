import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LuPhone, LuMail, LuGraduationCap } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getWorkerDetail } from "@/lib/services/workers";
import { WorkerStatusControl } from "@/components/workers/WorkerStatusControl";
import { WorkerProjectHistory } from "@/components/workers/WorkerProjectHistory";
import { CreateLoginControl } from "@/components/shared/CreateLoginControl";
import { EditWorkerDialog } from "@/components/workers/EditWorkerDialog";
import { DeleteWorkerButton } from "@/components/workers/DeleteWorkerButton";
import { formatDateTime, formatNaira } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const data = await getWorkerDetail(params.id);
  return { title: data ? data.worker.fullName : "Worker not found" };
}

function pct(v: number | null) {
  return v == null ? "—" : `${v}%`;
}

export default async function WorkerDetailPage({ params }: { params: { id: string } }) {
  const [data, session] = await Promise.all([getWorkerDetail(params.id), auth()]);
  if (!data) notFound();

  const { worker, metrics } = data;
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";

  return (
    <div className="space-y-5">
      <Link
        href="/admin/workers"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Manage Workers
      </Link>

      {/* Header */}
      <div className="surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
              {worker.fullName}
            </h1>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{worker.workerId}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <EditWorkerDialog
              worker={{
                id: worker.id,
                fullName: worker.fullName,
                phone: worker.phone,
                email: worker.email,
                educationLevel: worker.educationLevel,
                specialties: worker.specialties,
                skills: worker.skills,
                maxConcurrentProjects: worker.maxConcurrentProjects,
                bankName: worker.bankName,
                accountNumber: worker.accountNumber,
                accountName: worker.accountName,
                notes: worker.notes,
              }}
            />
            <CreateLoginControl
              endpoint={`/api/admin/workers/${worker.id}/login`}
              hasLogin={Boolean(worker.userId)}
              prefillEmail={worker.email ?? ""}
            />
            <WorkerStatusControl workerId={worker.id} current={worker.status} />
            {isSuperAdmin ? <DeleteWorkerButton workerId={worker.id} fullName={worker.fullName} /> : null}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
          <Field icon={LuPhone} label="Phone">
            <a href={`tel:${worker.phone}`} className="hover:text-primary">
              {worker.phone}
            </a>
          </Field>
          <Field icon={LuMail} label="Email">
            {worker.email ? (
              <a href={`mailto:${worker.email}`} className="hover:text-primary">
                {worker.email}
              </a>
            ) : (
              <span className="text-subtle">Not provided</span>
            )}
          </Field>
          <Field icon={LuGraduationCap} label="Education">
            {worker.educationLevel || <span className="text-subtle">—</span>}
          </Field>
        </dl>

        {worker.updatedBy ? (
          <p className="mt-3 text-xs text-subtle">
            Last updated by {worker.updatedByRole === "worker" ? "the worker" : "an admin"}
            {worker.updatedBy.displayName ? ` (${worker.updatedBy.displayName})` : ""} ·{" "}
            {formatDateTime(worker.updatedAt)}
          </p>
        ) : null}

        <TagRow label="Specialties" tags={worker.specialties} />
        <TagRow label="Skills" tags={worker.skills} />
      </div>

      {/* Performance */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Performance</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Completed" value={String(metrics.completedProjects)} />
          <Stat label="Active load" value={metrics.load} tone={metrics.atCapacity ? "danger" : "default"} />
          <Stat label="On-time" value={pct(metrics.onTimeRate)} />
          <Stat label="Revisions" value={pct(metrics.revisionRate)} />
          <Stat
            label="Avg delivery"
            value={metrics.avgDeliveryDays != null ? `${metrics.avgDeliveryDays}d` : "—"}
          />
          <Stat label="Rating" value={metrics.rating != null ? `${metrics.rating.toFixed(1)}/5` : "—"} />
        </div>
      </section>

      {/* Earnings + bank */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface p-4">
          <h2 className="text-sm font-semibold text-foreground">Earnings</h2>
          <dl className="mt-2 space-y-2 text-sm">
            <Line label="Total earned (completed)" value={formatNaira(metrics.totalEarned)} />
            <Line label="Total paid" value={formatNaira(metrics.totalPaid)} />
            <Line label="Outstanding balance" value={formatNaira(metrics.payoutBalance)} strong />
          </dl>
        </section>
        <section className="surface p-4">
          <h2 className="text-sm font-semibold text-foreground">Bank details</h2>
          <dl className="mt-2 space-y-2 text-sm">
            <Line label="Bank" value={worker.bankName || "—"} />
            <Line label="Account number" value={worker.accountNumber || "—"} mono />
            <Line label="Account name" value={worker.accountName || "—"} />
          </dl>
        </section>
      </div>

      {worker.notes ? (
        <section className="surface p-4">
          <h2 className="text-sm font-semibold text-foreground">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{worker.notes}</p>
        </section>
      ) : null}

      {/* Project history */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Project history</h2>
        <WorkerProjectHistory projects={worker.projects} />
      </section>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: (props: { className?: string; "aria-hidden"?: boolean }) => React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 meta-label">
        <Icon className="size-3" aria-hidden />
        {label}
      </dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  );
}

function TagRow({ label, tags }: { label: string; tags: string[] }) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="meta-label">{label}</p>
      {tags.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <li
              key={t}
              className="rounded-full bg-elevated px-2.5 py-0.5 text-xs text-foreground"
            >
              {t}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-subtle">None recorded</p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-xl bg-zone p-3">
      <p className="meta-label">
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-lg font-medium tabular-nums ${
          tone === "danger" ? "text-danger" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
  mono,
}: {
  label: string;
  value: string;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-2 last:border-0">
      <dt className={strong ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</dt>
      <dd
        className={`${mono ? "font-mono" : ""} tabular-nums ${
          strong ? "font-semibold text-foreground" : "text-foreground"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
