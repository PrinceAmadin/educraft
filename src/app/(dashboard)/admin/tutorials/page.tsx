import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LuMonitorPlay } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { canAccessRoute, effectiveRole, homeForRole } from "@/lib/rbac";
import { getTrainingManagement, getTutorialsState } from "@/lib/services/training";
import { TutorialsList } from "@/components/training/TutorialsList";
import { TutorialsManager } from "@/components/training/TutorialsManager";
import { toEpisodeProps } from "@/components/training/types";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { TUTORIALS_TEXT } from "@/lib/training/rules";

export const metadata: Metadata = { title: "How operations works" };
export const dynamic = "force-dynamic";

/**
 * The COO's tutorial library — and, for the founder, the management of both
 * audiences' episodes (the COO tutorials and the worker training series).
 * Never a gate: the COO is already working.
 */
export default async function TutorialsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = effectiveRole(session.user.role);
  if (!canAccessRoute(session.user.role, "/admin/tutorials")) redirect(homeForRole(role));

  const isFounder = role === "SUPER_ADMIN";
  const state = await getTutorialsState(session.user.id);
  const management = isFounder ? await getTrainingManagement() : null;

  return (
    <div className="space-y-8">
      <PageHeader title={TUTORIALS_TEXT.pageTitle} description={TUTORIALS_TEXT.pageDescription} />

      {state.total === 0 ? (
        <EmptyState icon={LuMonitorPlay} title={TUTORIALS_TEXT.pageTitle} description={TUTORIALS_TEXT.noEpisodes} />
      ) : (
        <TutorialsList episodes={state.episodes.map(toEpisodeProps)} watched={state.watched} total={state.total} />
      )}

      {management ? (
        <TutorialsManager
          episodes={management.episodes}
          cooViewers={management.cooViewers.map((v) => ({
            userId: v.userId,
            name: v.name,
            episodes: Object.fromEntries(
              Object.entries(v.episodes).map(([id, w]) => [
                id,
                {
                  watchedAt: w.watchedAt?.toISOString() ?? null,
                  startedAt: w.startedAt?.toISOString() ?? null,
                },
              ])
            ),
          }))}
        />
      ) : null}
    </div>
  );
}
