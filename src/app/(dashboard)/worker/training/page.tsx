import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LuGraduationCap } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getWorkerTrainingState } from "@/lib/services/training";
import { TrainingSeries } from "@/components/worker/training/TrainingSeries";
import { toEpisodeProps } from "@/components/training/types";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { TRAINING_TEXT } from "@/lib/training/rules";

export const metadata: Metadata = { title: "Training" };
export const dynamic = "force-dynamic";

/**
 * The Training tab: the whole series for rewatching (and for optional
 * episodes the gate never held anyone on). While required episodes are
 * unwatched the layout's gate sits over this page like every other.
 */
export default async function WorkerTrainingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const training = await getWorkerTrainingState(session.user.id);

  return (
    <div className="space-y-6">
      <PageHeader title={TRAINING_TEXT.pageTitle} description={TRAINING_TEXT.pageDescription} />
      {training.total === 0 ? (
        <EmptyState icon={LuGraduationCap} title={TRAINING_TEXT.pageTitle} description={TRAINING_TEXT.noEpisodes} />
      ) : (
        <TrainingSeries
          episodes={training.episodes.map(toEpisodeProps)}
          completed={training.completed}
          total={training.total}
          nextRequiredId={training.nextRequiredId}
        />
      )}
    </div>
  );
}
