import type { Metadata } from "next";
import Link from "next/link";
import { getPublicTracking } from "@/lib/services/tracking";
import { ProjectTracker } from "@/components/track/ProjectTracker";
import { TrackLookup } from "@/components/track/TrackLookup";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { projectId: string };
}): Promise<Metadata> {
  return { title: `Track ${params.projectId}` };
}

export default async function TrackProjectPage({
  params,
}: {
  params: { projectId: string };
}) {
  const result = await getPublicTracking(params.projectId);

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-12 sm:py-16">
      <Link href="/track" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
        Track another project
      </Link>
      <div className="mt-4">
        {result ? (
          <ProjectTracker result={result} />
        ) : (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Project not found
            </h1>
            <TrackLookup notFoundCode={decodeURIComponent(params.projectId)} />
          </div>
        )}
      </div>
    </div>
  );
}
