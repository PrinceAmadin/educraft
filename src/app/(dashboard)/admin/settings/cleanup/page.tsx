import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { homeForRole } from "@/lib/rbac";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { CleanupList } from "@/components/cleanup/CleanupList";
import { FlaggersSection } from "@/components/cleanup/FlaggersSection";
import { DeletedHistory } from "@/components/cleanup/DeletedHistory";
import { CLEANUP_TEXT } from "@/lib/project-cleanup";
import { listCleanupRows, listDeletedProjects, listFlaggers } from "@/lib/services/project-cleanup";

export const metadata: Metadata = { title: "Test data" };
export const dynamic = "force-dynamic";

/**
 * Deleting test projects. Founder only: the middleware, the admin layout and
 * this page all check, and every API behind it calls requireSuperAdmin.
 */
export default async function TestDataPage({ searchParams }: { searchParams: { q?: string | string[] } }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "SUPER_ADMIN") redirect(homeForRole(session.user.role));

  const q = (Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q)?.trim().slice(0, 100) ?? "";
  const [rows, flaggers, deleted] = await Promise.all([listCleanupRows(q || undefined), listFlaggers(), listDeletedProjects()]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Company details, service catalogue, team access and bank details.</p>
      </div>

      <SettingsTabs active="cleanup" role={session.user.role} />

      <div className="space-y-12">
        <section>
          <h2 className="text-lg font-semibold text-foreground">{CLEANUP_TEXT.pageTitle}</h2>
          <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">{CLEANUP_TEXT.pageIntro}</p>
          <div className="mt-6">
            <CleanupList flagged={rows.flagged} others={rows.others} q={q} />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">{CLEANUP_TEXT.flaggersHeading}</h2>
          <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">{CLEANUP_TEXT.flaggersIntro}</p>
          <div className="mt-5">
            <FlaggersSection initial={flaggers} />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            {CLEANUP_TEXT.historyHeading}
            <span className="ml-2 font-mono text-[13px] font-normal tabular-nums text-muted-foreground">{deleted.length}</span>
          </h2>
          <div className="mt-4">
            <DeletedHistory rows={deleted} />
          </div>
        </section>
      </div>
    </div>
  );
}
