import type { Metadata } from "next";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { LuUsers, LuUserCheck, LuPercent, LuWallet, LuInbox } from "react-icons/lu";
import { auth } from "@/lib/auth";
import {
  getAmbassadorByUserId,
  getAmbassadorDashboard,
} from "@/lib/services/ambassador-portal";
import { referralLink } from "@/lib/ambassador";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { TierBadge } from "@/components/ambassadors/TierBadge";
import { ReferralShareCard } from "@/components/ambassadors/ReferralShareCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { firstName, formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "My referrals" };
export const dynamic = "force-dynamic";

function originFromHeaders(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "educraft.ng";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function AmbassadorDashboardPage() {
  const session = await auth();
  const ambassador = session?.user ? await getAmbassadorByUserId(session.user.id) : null;

  if (!ambassador) {
    return (
      <EmptyState
        icon={LuInbox}
        title="No ambassador profile yet"
        description="Your account isn't linked to an ambassador profile. Contact an admin to get set up."
      />
    );
  }

  const data = await getAmbassadorDashboard(ambassador.id);
  const link = referralLink(originFromHeaders(), data.referralCode);
  const qrDataUrl = await QRCode.toDataURL(link, { margin: 1, width: 224 });

  const { progress } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Welcome back, {firstName(data.fullName)}
        </h1>
        <TierBadge tier={data.tier} />
      </div>

      <ReferralShareCard code={data.referralCode} link={link} qrDataUrl={qrDataUrl} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatsCard label="Total referrals" value={String(data.metrics.referrals)} icon={LuUsers} tone="primary" />
        <StatsCard label="Conversions" value={String(data.metrics.conversions)} icon={LuUserCheck} tone="success" />
        <StatsCard
          label="Conversion rate"
          value={data.metrics.conversionRate != null ? `${data.metrics.conversionRate}%` : "—"}
          icon={LuPercent}
          tone="primary"
        />
        <StatsCard
          label="Commission balance"
          value={formatNaira(data.metrics.commissionBalance, { compact: true })}
          icon={LuWallet}
          tone="gold"
        />
      </div>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Tier progress</h2>
          {progress.eligibleForPromotion ? (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Eligible to promote
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {progress.next
            ? `${progress.conversions} of ${progress.conversions + progress.toNext} conversions to ${progress.nextLabel} (${data.rate}% now)`
            : `Top tier — ${progress.conversions} conversions at ${data.rate}%`}
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border" aria-hidden>
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </section>
    </div>
  );
}
