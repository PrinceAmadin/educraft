import type { Metadata } from "next";
import Link from "next/link";
import { LuArrowRight, LuCalendarDays, LuHandshake, LuLayoutDashboard, LuNetwork, LuTrophy, LuWallet } from "react-icons/lu";
import { PageHeader } from "@/components/shared/PageHeader";
import { InProgressNotice } from "@/components/shared/InProgressNotice";
import type { AppIcon } from "@/lib/icons";

export const metadata: Metadata = { title: "Growth" };

const TOOLS: { href: string; title: string; body: string; icon: AppIcon }[] = [
  { href: "/admin/ambassadors", title: "Ambassador dashboard", body: "Active this month against the activation target, referrals and conversions against last month, and who needs a hand.", icon: LuLayoutDashboard },
  { href: "/admin/ambassadors/leaderboard", title: "Leaderboard", body: "Rankings by conversions, badges, and the Friday spotlight with its message.", icon: LuTrophy },
  { href: "/admin/ambassadors/commissions?tab=quarterly", title: "Quarterly challenge", body: "Every ambassador's progress toward the challenge and the Platinum bonus, and processing them at quarter end.", icon: LuWallet },
  { href: "/admin/ambassadors/network", title: "Network map", body: "Core ambassadors and their Sub-teams, and who is ready to lead one.", icon: LuNetwork },
  { href: "/admin/ambassadors/partnerships", title: "Partnerships", body: "Student unions and faculty associations, what they cost the Growth Fund and the projects they brought.", icon: LuHandshake },
  { href: "/admin/ambassadors/content", title: "Content hub", body: "The weekly content rhythm, how consistently it went out, and the pre-season campaign.", icon: LuCalendarDays },
];

/** The Head of Growth's front door: the Ambassador Platform's tools, and what is still to come. */
export default function GrowthPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Growth" description="How EduCraft reaches students: the ambassador network, the weekly rhythm, partnerships and campaigns." />

      <section aria-label="Growth tools" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} className="group surface flex flex-col gap-2 p-5 transition-shadow hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon className="size-4 text-primary" aria-hidden />
                {t.title}
                <LuArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
              <span className="text-[13px] leading-relaxed text-muted-foreground">{t.body}</span>
            </Link>
          );
        })}
      </section>

      <InProgressNotice
        phase="a later phase"
        summary="Still to build on this page."
        items={[
          "Every school with its active ambassadors and paying clients, and the ones approaching 10+",
          "The new-client target for the period and how far past it the team is",
          "The Head of Growth's own bonus tracker, calculated from the numbers above",
        ]}
      />
    </div>
  );
}
