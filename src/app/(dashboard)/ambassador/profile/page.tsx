import type { Metadata } from "next";
import { headers } from "next/headers";
import { LuInbox } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getAmbassadorByUserId, getAmbassadorProfile } from "@/lib/services/ambassador-portal";
import { AmbassadorBankForm } from "@/components/ambassadors/AmbassadorBankForm";
import { WeeklyEmailToggle } from "@/components/ambassadors/WeeklyEmailToggle";
import { TierBadge } from "@/components/ambassadors/TierBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { referralLink, TIER_LADDER } from "@/lib/ambassador";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "My profile" };
export const dynamic = "force-dynamic";

function origin(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "educraft.ng";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function AmbassadorProfilePage() {
  const session = await auth();
  const ambassador = session?.user ? await getAmbassadorByUserId(session.user.id) : null;
  if (!ambassador) {
    return <EmptyState icon={LuInbox} title="No ambassador profile" description="Contact an admin." />;
  }

  const { profile, progress, rate } = await getAmbassadorProfile(ambassador.id);
  const link = referralLink(origin(), profile.referralCode);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">My profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contact an admin to change your name, university, or department.
        </p>
      </div>

      <section className="surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">{profile.fullName}</h2>
          <span className="font-mono text-xs text-muted-foreground">{profile.ambassadorId}</span>
          <TierBadge tier={profile.tier} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-3 text-sm sm:grid-cols-3">
          <Item label="Phone">{profile.phone}</Item>
          <Item label="Email">{profile.email || "—"}</Item>
          <Item label="University">
            {profile.university?.name ?? "—"}
            {profile.university?.abbreviation ? ` (${profile.university.abbreviation})` : ""}
          </Item>
          <Item label="Department">{profile.department || "—"}</Item>
          <Item label="Level">{profile.level || "—"}</Item>
          <Item label="Joined">{formatDate(profile.createdAt)}</Item>
        </dl>
      </section>

      <section className="surface p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">Referral code &amp; link</h2>
        <p className="mt-2 font-mono text-sm text-foreground">{profile.referralCode}</p>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{link}</p>
      </section>

      <section className="surface p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">Tier</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Currently <span className="font-medium text-foreground">{progress.currentLabel}</span> —{" "}
          {rate}% commission.
          {progress.next
            ? ` ${progress.toNext} more conversion${progress.toNext === 1 ? "" : "s"} to ${progress.nextLabel}.`
            : " You're at the top tier."}
        </p>
        <ol className="mt-3 flex flex-wrap gap-2">
          {TIER_LADDER.map((t) => (
            <li
              key={t.tier}
              className={
                t.tier === profile.tier
                  ? "rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                  : "rounded-full bg-elevated px-2.5 py-0.5 text-xs text-muted-foreground"
              }
            >
              {t.label} · {t.rate}% · {t.minConversions}+
            </li>
          ))}
        </ol>
      </section>

      <section className="surface p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Email preferences</h2>
        <WeeklyEmailToggle initialOn={!profile.weeklyEmailOptOut} hasEmail={Boolean(profile.email)} />
      </section>

      <section className="surface p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">Bank details</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Where your commission is paid. Saving notifies the finance team.
        </p>
        <div className="mt-3">
          <AmbassadorBankForm
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
      <dt className="meta-label">
        {label}
      </dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  );
}
