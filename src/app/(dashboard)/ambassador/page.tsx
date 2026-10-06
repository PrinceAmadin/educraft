import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { LuUsers, LuUserCheck, LuPercent, LuWallet, LuInbox, LuArrowRight } from "react-icons/lu";
import { auth } from "@/lib/auth";
import {
  getAmbassadorByUserId,
  getAmbassadorDashboard,
} from "@/lib/services/ambassador-portal";
import { referralLink } from "@/lib/ambassador";
import { getAmbassadorLink } from "@/lib/services/ambassador-analytics";
import {
  PAYING_CLIENTS_HINT,
  PAYING_CLIENTS_LABEL,
  payingShareLine,
  tierProgressLine,
} from "@/lib/ambassador-copy";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { TierBadge } from "@/components/ambassadors/TierBadge";
import { ReferralShareCard } from "@/components/ambassadors/ReferralShareCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { CadenceNotice } from "@/components/shared/CadenceNotice";
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

  const [data, slotLink] = await Promise.all([
    getAmbassadorDashboard(ambassador.id),
    getAmbassadorLink(ambassador.id),
  ]);
  const origin = originFromHeaders();
  // The ambassador shares their /EduCraftA/{slot} link, which sends clients
  // straight to EduCraft's WhatsApp. Ambassadors created without a slot fall
  // back to the ?ref= intake link so they still have a working one.
  const link = slotLink ? `${origin}${slotLink.linkPath}` : referralLink(origin, data.referralCode);
  const linkLabel = slotLink ? slotLink.slotCode : data.referralCode;
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

      <CadenceNotice>Your commission is owed the moment someone you referred pays their downpayment, and paid out every Saturday to the bank account on your profile.</CadenceNotice>

      <ReferralShareCard code={linkLabel} link={link} qrDataUrl={qrDataUrl} />

      <div className="grid grid-cols-2 gap-x-6 gap-y-7 lg:grid-cols-4 lg:gap-x-8">
        <StatsCard
          label="People who used your link"
          value={String(data.metrics.referrals)}
          detail="They signed up with your code"
          icon={LuUsers}
          tone="primary"
          wrapLabel
        />
        <StatsCard
          label={PAYING_CLIENTS_LABEL}
          value={String(data.metrics.payingClients)}
          detail={PAYING_CLIENTS_HINT}
          icon={LuUserCheck}
          tone="success"
          wrapLabel
        />
        <StatsCard
          label="How many have paid"
          value={data.metrics.payingClientRate != null ? `${data.metrics.payingClientRate}%` : "—"}
          detail={payingShareLine(data.metrics.payingClients, data.metrics.referrals)}
          icon={LuPercent}
          tone="primary"
        />
        <StatsCard
          label="Commission balance"
          value={formatNaira(data.metrics.commissionBalance, { compact: true })}
          detail="Yours, not yet paid out"
          icon={LuWallet}
          tone="gold"
        />
      </div>

      {/* The phone bottom bar is full, so the referrals list is reached from here. */}
      <Link
        href="/ambassador/referrals"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        See everyone you referred
        <LuArrowRight className="size-4" aria-hidden />
      </Link>

      <section className="surface p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Your level</h2>
          {progress.eligibleForPromotion ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Ready to move up
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {tierProgressLine(progress, { current: data.rate, next: data.nextRate })}
        </p>
        {progress.next ? (
          <p className="mt-1 text-xs text-muted-foreground">
            You earn {data.rate}% on every project right now.
          </p>
        ) : null}
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
