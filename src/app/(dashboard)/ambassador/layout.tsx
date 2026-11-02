import { auth } from "@/lib/auth";
import { requirePortalProfile } from "@/lib/portal-access-guard";
import { getTourStateForUser } from "@/lib/services/ambassador-tour";
import { AmbassadorTourGate } from "@/components/ambassador/tour/AmbassadorTourGate";

export default async function AmbassadorPortalLayout({ children }: { children: React.ReactNode }) {
  await requirePortalProfile("ambassador");

  // The tutorial gate lives here rather than on the dashboard page so it covers
  // every ambassador screen: opening /ambassador/commissions directly meets it
  // too. With no video configured this is one small settings read and nothing
  // renders.
  const session = await auth();
  const tour = session?.user ? await getTourStateForUser(session.user.id) : null;

  return (
    <>
      {tour?.required ? (
        <AmbassadorTourGate
          videoUrl={tour.videoUrl}
          posterUrl={tour.posterUrl}
          startAt={tour.startAt}
          secondsWatched={tour.secondsWatched}
        />
      ) : null}
      {children}
    </>
  );
}
