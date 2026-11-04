import { auth } from "@/lib/auth";
import { requirePortalProfile } from "@/lib/portal-access-guard";
import { getWorkerTrainingState } from "@/lib/services/training";
import { WorkerTrainingGate } from "@/components/worker/training/WorkerTrainingGate";
import { toEpisodeProps } from "@/components/training/types";

export default async function WorkerPortalLayout({ children }: { children: React.ReactNode }) {
  await requirePortalProfile("worker");

  // The training gate lives here rather than on a page so it covers every
  // worker screen: opening /worker/projects directly meets it too. With no
  // published episode this is one small query and nothing renders — publishing
  // the series is the founder's go-live switch. Executives' own worker records
  // are exempt; everyone else, current workers included, watches once.
  const session = await auth();
  const training = session?.user ? await getWorkerTrainingState(session.user.id) : null;
  const current = training?.gated
    ? (training.episodes.find((e) => e.id === training.nextRequiredId) ?? null)
    : null;
  const isLast =
    current != null &&
    training != null &&
    training.episodes.every((e) => e.id === current.id || !e.requiredForGate || e.watchedAt != null);

  return (
    <>
      {training && current ? (
        <WorkerTrainingGate
          episode={toEpisodeProps(current)}
          episodes={training.episodes.map((e) => ({
            id: e.id,
            episodeNo: e.episodeNo,
            title: e.title,
            watchedAt: e.watchedAt?.toISOString() ?? null,
            unlocked: e.unlocked,
          }))}
          watched={training.watched}
          total={training.total}
          isLast={isLast}
        />
      ) : null}
      {children}
    </>
  );
}
