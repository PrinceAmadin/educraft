import type { Metadata } from "next";
import { LuInbox } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getWorkerByUserId, getWorkerProfile } from "@/lib/services/worker-portal";
import { WorkerBankForm } from "@/components/worker/WorkerBankForm";
import { EmptyState } from "@/components/shared/EmptyState";

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
          Contact an admin to change your name, specialties, or availability.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">{profile.fullName}</h2>
          <span className="font-mono text-xs text-muted-foreground">{profile.workerId}</span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-3 text-sm sm:grid-cols-3">
          <Item label="Phone">{profile.phone}</Item>
          <Item label="Email">{profile.email || "—"}</Item>
          <Item label="Education">{profile.educationLevel || "—"}</Item>
          <Item label="Status">{profile.status}</Item>
          <Item label="Max concurrent">{String(profile.maxConcurrentProjects)}</Item>
        </dl>
        <TagRow label="Specialties" tags={profile.specialties} />
        <TagRow label="Skills" tags={profile.skills} />
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

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
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

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  );
}

function TagRow({ label, tags }: { label: string; tags: string[] }) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      {tags.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <li
              key={t}
              className="rounded-full border border-border bg-elevated px-2.5 py-0.5 text-xs text-foreground"
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-medium tabular-nums text-foreground">{value}</p>
    </div>
  );
}
