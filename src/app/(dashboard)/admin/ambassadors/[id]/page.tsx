import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LuPhone, LuMail, LuBuilding2 } from "react-icons/lu";
import { getAmbassadorDetail, listParentCandidates } from "@/lib/services/ambassadors";
import { getDefaultParentCommissionRate } from "@/lib/services/settings";
import { TierBadge } from "@/components/ambassadors/TierBadge";
import { ReferralLinkCard } from "@/components/ambassadors/ReferralLinkCard";
import { AmbassadorControls } from "@/components/ambassadors/AmbassadorControls";
import { ParentAssignment, SubAmbassadorsList } from "@/components/ambassadors/ParentAssignment";
import { MessageAmbassadorButton } from "@/components/ambassadors/MessageAmbassadorButton";
import { CreateLoginControl } from "@/components/shared/CreateLoginControl";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { AdminAnalytics } from "@/components/ambassador-analytics/AdminAnalytics";
import { EmptyState } from "@/components/shared/EmptyState";
import { LuUsers } from "react-icons/lu";
import { cn, formatDate, formatNaira } from "@/lib/utils";
import type { ProjectStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const data = await getAmbassadorDetail(params.id);
  return { title: data ? data.ambassador.fullName : "Ambassador not found" };
}

export default async function AmbassadorDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { view?: string; tab?: string; from?: string; to?: string };
}) {
  const data = await getAmbassadorDetail(params.id);
  if (!data) notFound();

  const { ambassador, metrics, progress, payouts, parentCommission } = data;
  const view = searchParams.view === "analytics" ? "analytics" : "profile";
  const [parentCandidates, defaultParentRate] = await Promise.all([
    listParentCandidates(ambassador.id),
    getDefaultParentCommissionRate(),
  ]);

  return (
    <div className="space-y-5">
      <Link
        href="/admin/ambassadors"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All ambassadors
      </Link>

      {/* Header */}
      <div className="surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
                {ambassador.fullName}
              </h1>
              <TierBadge tier={ambassador.tier} />
            </div>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {ambassador.ambassadorId}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MessageAmbassadorButton
              ambassadorId={ambassador.id}
              ambassadorName={ambassador.fullName}
              hasEmail={Boolean(ambassador.email)}
            />
            <CreateLoginControl
              endpoint={`/api/admin/ambassadors/${ambassador.id}/login`}
              hasLogin={Boolean(ambassador.userId)}
              prefillEmail={ambassador.email ?? ""}
            />
            <AmbassadorControls
              ambassadorId={ambassador.id}
              status={ambassador.status}
              tier={ambassador.tier}
            />
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
          <Field icon={LuPhone} label="Phone">
            {ambassador.phone ? (
              <a href={`tel:${ambassador.phone}`} className="hover:text-primary">
                {ambassador.phone}
              </a>
            ) : (
              <span className="text-subtle">Not provided</span>
            )}
          </Field>
          <Field icon={LuMail} label="Email">
            {ambassador.email ? (
              <a href={`mailto:${ambassador.email}`} className="hover:text-primary">
                {ambassador.email}
              </a>
            ) : (
              <span className="text-subtle">Not provided</span>
            )}
          </Field>
          <Field icon={LuBuilding2} label="University">
            {ambassador.university?.name ?? "—"}
            {ambassador.department ? (
              <span className="block text-xs text-muted-foreground">{ambassador.department}</span>
            ) : null}
          </Field>
        </dl>
      </div>

      <nav aria-label="Ambassador sections" className="inline-flex gap-1 rounded-xl bg-zone p-1">
        {[
          { key: "profile", label: "Profile", href: `/admin/ambassadors/${ambassador.id}` },
          { key: "analytics", label: "Link analytics", href: `/admin/ambassadors/${ambassador.id}?view=analytics` },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.href}
            scroll={false}
            aria-current={t.key === view ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium transition-colors",
              t.key === view ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {view === "analytics" ? (
        <AdminAnalytics
          ambassadorId={ambassador.id}
          ambassadorName={ambassador.fullName}
          basePath={`/admin/ambassadors/${ambassador.id}`}
          tab={searchParams.tab}
          from={searchParams.from}
          to={searchParams.to}
        />
      ) : (
      <>
      <ReferralLinkCard code={ambassador.referralCode} />

      <ParentAssignment
        ambassadorId={ambassador.id}
        current={ambassador.parent}
        currentRate={ambassador.parentCommRate}
        candidates={parentCandidates}
        defaultRate={defaultParentRate}
      />
      <SubAmbassadorsList subs={ambassador.children} parentCommission={parentCommission} />

      {/* Tier progress */}
      <section className="surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Tier progress</h2>
          {progress.eligibleForPromotion ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Eligible to promote
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {progress.next
            ? `${progress.conversions}/${progress.conversions + progress.toNext} conversions to ${progress.nextLabel}`
            : `Top tier — ${progress.conversions} conversions`}
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border" aria-hidden>
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </section>

      {/* Performance + commission */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface p-4">
          <h2 className="text-sm font-semibold text-foreground">Performance</h2>
          <dl className="mt-2 space-y-2 text-sm">
            <Line label="Total referrals" value={String(metrics.referrals)} />
            <Line label="Conversions" value={String(metrics.conversions)} />
            <Line
              label="Conversion rate"
              value={metrics.conversionRate != null ? `${metrics.conversionRate}%` : "—"}
            />
            <Line label="Revenue generated" value={formatNaira(metrics.revenueGenerated)} strong />
          </dl>
        </section>
        <section className="surface p-4">
          <h2 className="text-sm font-semibold text-foreground">Commission</h2>
          <dl className="mt-2 space-y-2 text-sm">
            <Line label="Total earned (completed)" value={formatNaira(metrics.commissionEarned)} />
            <Line label="Total paid" value={formatNaira(metrics.commissionPaid)} />
            <Line label="Outstanding balance" value={formatNaira(metrics.commissionBalance)} strong />
          </dl>
          <div className="mt-3 border-t border-border pt-3">
            <p className="meta-label">
              Bank details
            </p>
            <dl className="mt-1.5 space-y-1.5 text-sm">
              <Line label="Bank" value={ambassador.bankName || "—"} />
              <Line label="Account number" value={ambassador.accountNumber || "—"} mono />
              <Line label="Account name" value={ambassador.accountName || "—"} />
            </dl>
          </div>
        </section>
      </div>

      {/* Referral history */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          Referral history
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            {ambassador.referredClients.length}
          </span>
        </h2>
        {ambassador.referredClients.length === 0 ? (
          <EmptyState
            icon={LuUsers}
            title="No referrals yet"
            description="Clients who sign up with this ambassador's code appear here."
            className="py-8"
          />
        ) : (
          <ul className="divide-y divide-border/80">
            {ambassador.referredClients.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/clients/${c.id}`}
                  className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-foreground">{c.fullName}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {c.clientId} · joined {formatDate(c.createdAt)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
                      c._count.projects > 0
                        ? "border-transparent bg-success/15 text-success"
                        : "border-border bg-elevated text-muted-foreground"
                    )}
                  >
                    {c._count.projects > 0
                      ? `${c._count.projects} project${c._count.projects === 1 ? "" : "s"}`
                      : "No order yet"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Payout history */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Payout history</h2>
        {payouts.length === 0 ? (
          <p className="rounded-2xl bg-zone px-4 py-6 text-sm text-muted-foreground">
            No commission payments recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/80">
            {payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{p.paymentId}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(p.date)} · {p.status}
                    {p.reference ? ` · ref ${p.reference}` : ""}
                  </p>
                </div>
                <span className="font-mono tabular-nums text-foreground">
                  −{formatNaira(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Ambassador projects */}
      {ambassador.projects.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Projects</h2>
          <ul className="divide-y divide-border/80">
            {ambassador.projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/admin/projects/${p.projectId}`}
                  className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-sm text-foreground">{p.projectId}</span>
                    <StatusBadge status={p.status as ProjectStatus} short />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {p.ambassadorCommission != null ? formatNaira(p.ambassadorCommission) : "—"}
                    {p.ambassadorCommPaid ? " · paid" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      </>
      )}
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
