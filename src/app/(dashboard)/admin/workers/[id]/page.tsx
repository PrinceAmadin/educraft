import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LuPhone, LuMail, LuGraduationCap } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getWorkerDetail } from "@/lib/services/workers";
import { getWorkerProfileOps } from "@/lib/services/operations/workers-ops";
import { getLinkedAmbassador } from "@/lib/services/linked-profiles";
import { LinkedProfileLink } from "@/components/shared/LinkedProfileLink";
import { WorkerStatusControl } from "@/components/workers/WorkerStatusControl";
import { WorkerProjectHistory } from "@/components/workers/WorkerProjectHistory";
import { CreateLoginControl } from "@/components/shared/CreateLoginControl";
import { EditWorkerDialog } from "@/components/workers/EditWorkerDialog";
import { DeleteWorkerButton } from "@/components/workers/DeleteWorkerButton";
import { WorkerProfileOps } from "@/components/operations/WorkerProfileOps";
import { WorkerCooActions } from "@/components/operations/WorkerCooActions";
import { toWaNumber, waLink, greetingName } from "@/lib/whatsapp";
import { cn, formatDate, formatDateTime, formatNaira, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const data = await getWorkerDetail(params.id);
  return { title: data ? data.worker.fullName : "Worker not found" };
}

const ACTIVITY_TEXT: Record<string, string> = {
  Active: "text-success",
  Busy: "text-gold",
  Inactive: "text-danger",
  "On Break": "text-muted-foreground",
  Suspended: "text-danger",
  Terminated: "text-subtle",
};

export default async function WorkerDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { flag?: string } }) {
  const [data, ops, session] = await Promise.all([getWorkerDetail(params.id), getWorkerProfileOps(params.id), auth()]);
  if (!data || !ops) notFound();

  const { worker, metrics } = data;
  const linked = await getLinkedAmbassador(worker.userId);
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";
  const wa = toWaNumber(worker.phone);

  return (
    <div className="space-y-8">
      <Link
        href="/admin/workers"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Manage Workers
      </Link>

      {/* Header */}
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{worker.fullName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className={cn("font-medium", ACTIVITY_TEXT[ops.activity])}>{ops.activity}</span>
              {" · "}Joined {formatDate(worker.createdAt)}
              {" · "}
              <span className="font-mono text-xs">{worker.workerId}</span>
              {ops.lastActiveAt ? ` · last active ${timeAgo(ops.lastActiveAt)}` : ""}
              {worker.isQaReviewer ? " · QA reviewer" : ""}
            </p>
            {linked ? (
              <div className="mt-2">
                <LinkedProfileLink linked={linked} />
              </div>
            ) : null}
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
            <CreateLoginControl endpoint={`/api/admin/workers/${worker.id}/login`} hasLogin={Boolean(worker.userId)} prefillEmail={worker.email ?? ""} />
            <WorkerStatusControl workerId={worker.id} current={worker.status} />
            {isSuperAdmin ? <DeleteWorkerButton workerId={worker.id} fullName={worker.fullName} /> : null}
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 rounded-2xl bg-zone p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Field icon={LuPhone} label="WhatsApp">
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
          <Field icon={LuGraduationCap} label="Academic background">{worker.educationLevel || <span className="text-subtle">—</span>}</Field>
          <div>
            <dt className="meta-label">Load</dt>
            <dd className={cn("mt-0.5 font-mono tabular-nums", metrics.atCapacity ? "text-danger" : "text-foreground")}>
              {metrics.load} · max {worker.maxConcurrentProjects}
            </dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <dt className="meta-label">Departments</dt>
            <dd className="mt-1">
              {worker.specialties.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {worker.specialties.map((t, i) => (
                    <li key={t} className="rounded-full bg-card px-2.5 py-0.5 text-xs text-foreground shadow-soft">
                      {t}
                      {i === 0 ? <span className="text-muted-foreground"> (primary)</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-sm text-subtle">None recorded</span>
              )}
              {worker.skills.length > 0 ? <p className="mt-1.5 text-[13px] text-muted-foreground">Skills: {worker.skills.join(", ")}</p> : null}
            </dd>
          </div>
        </dl>

        {worker.updatedBy ? (
          <p className="text-xs text-subtle">
            Last updated by {worker.updatedByRole === "worker" ? "the worker" : "an admin"}
            {worker.updatedBy.displayName ? ` (${worker.updatedBy.displayName})` : ""} · {formatDateTime(worker.updatedAt)}
          </p>
        ) : null}
      </div>

      <WorkerCooActions
        workerId={worker.id}
        status={worker.status}
        maxConcurrentProjects={worker.maxConcurrentProjects}
        isQaReviewer={worker.isQaReviewer}
        whatsappHref={wa ? waLink(wa, `Hi ${greetingName(worker.fullName)}, this is EduCraft.`) : null}
        openFlag={searchParams.flag === "1"}
      />

      <WorkerProfileOps workerId={worker.id} data={ops} />

      {/* Lifetime figures and bank details, as before */}
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <section>
          <h2 className="text-[15px] font-semibold text-foreground">Lifetime</h2>
          <dl className="mt-2 space-y-2 text-sm">
            <Line label="Completed projects" value={String(metrics.completedProjects)} />
            <Line label="Revision rate" value={metrics.revisionRate != null ? `${metrics.revisionRate}%` : "—"} />
            <Line label="Average delivery" value={metrics.avgDeliveryDays != null ? `${metrics.avgDeliveryDays} days` : "—"} />
            <Line label="Total earned (completed)" value={formatNaira(metrics.totalEarned)} />
            <Line label="Total paid" value={formatNaira(metrics.totalPaid)} />
            <Line label="Outstanding balance" value={formatNaira(metrics.payoutBalance)} strong />
          </dl>
        </section>
        <section>
          <h2 className="text-[15px] font-semibold text-foreground">Bank details</h2>
          <dl className="mt-2 space-y-2 text-sm">
            <Line label="Bank" value={worker.bankName || "—"} />
            <Line label="Account number" value={worker.accountNumber || "—"} mono />
            <Line label="Account name" value={worker.accountName || "—"} />
          </dl>
          {worker.notes ? (
            <>
              <h3 className="mt-6 text-[15px] font-semibold text-foreground">Record notes</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{worker.notes}</p>
            </>
          ) : null}
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-foreground">Project history</h2>
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

function Line({ label, value, strong, mono }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-2 last:border-0">
      <dt className={strong ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</dt>
      <dd className={`${mono ? "font-mono" : ""} tabular-nums ${strong ? "font-semibold text-foreground" : "text-foreground"}`}>{value}</dd>
    </div>
  );
}
