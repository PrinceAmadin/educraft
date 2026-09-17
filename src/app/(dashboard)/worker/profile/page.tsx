import type { Metadata } from "next";
import { LuInbox } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getWorkerByUserId, getWorkerProfile } from "@/lib/services/worker-portal";
import { WorkerBankForm } from "@/components/worker/WorkerBankForm";
import { WorkerIntakeForm } from "@/components/worker/WorkerIntakeForm";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "My profile" };
export const dynamic = "force-dynamic";

function pct(v: number | null) {
  return v == null ? "—" : `${v}%`;
}

export default async function WorkerProfilePage() {
  const session = await auth();
  const worker = session?.user ? await getWorkerByUserId(session.user.id) : null;
  if (!worker) {
    return <EmptyState icon={LuInbox} title="No worker profile" description="Contact an admin." />;
  }

  const { profile, metrics } = await getWorkerProfile(worker.id);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">My profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update your contact info, education, and skills below. Contact an admin to change your name,
          status, or capacity.
        </p>
      </div>

      <section className="surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">{profile.fullName}</h2>
          <span className="font-mono text-xs text-muted-foreground">{profile.workerId}</span>
          <span className="rounded-full bg-elevated px-2 py-0.5 text-xs text-muted-foreground">
            {profile.status}
          </span>
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <WorkerIntakeForm
            initial={{
              phone: profile.phone,
              email: profile.email,
              educationLevel: profile.educationLevel,
              specialties: profile.specialties,
              skills: profile.skills,
            }}
          />
        </div>
        {profile.updatedBy ? (
          <p className="mt-3 border-t border-border pt-3 text-xs text-subtle">
            Last updated by {profile.updatedByRole === "admin" ? "an admin" : "you"}
            {profile.updatedByRole === "admin" && profile.updatedBy.displayName
              ? ` (${profile.updatedBy.displayName})`
              : ""}{" "}
            · {formatDateTime(profile.updatedAt)}
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">My performance</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Completed" value={String(metrics.completedProjects)} />
          <Stat label="Avg delivery" value={metrics.avgDeliveryDays != null ? `${metrics.avgDeliveryDays}d` : "—"} />
          <Stat label="On-time" value={pct(metrics.onTimeRate)} />
          <Stat label="Revisions" value={pct(metrics.revisionRate)} />
          <Stat label="Rating" value={metrics.rating != null ? `${metrics.rating.toFixed(1)}/5` : "—"} />
        </div>
      </section>

      <section className="surface p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">Bank details</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Where your payouts are sent. Changes notify the finance team.
        </p>
        <div className="mt-3">
          <WorkerBankForm
            initial={{
              bankName: profile.bankName,
              accountNumber: profile.accountNumber,
              accountName: profile.accountName,
            }}
          />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zone p-3">
      <p className="meta-label">{label}</p>
      <p className="mt-1 font-mono text-lg font-medium tabular-nums text-foreground">{value}</p>
    </div>
  );
}
