import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LuArrowLeft } from "react-icons/lu";
import { getClientScope } from "@/lib/api";
import { getClientTracking } from "@/lib/services/tracking";
import { ProjectTracker } from "@/components/track/ProjectTracker";

export const metadata: Metadata = { title: "Project status" };
export const dynamic = "force-dynamic";

export default async function ClientProjectPage({ params }: { params: { projectId: string } }) {
  const scope = await getClientScope();
  if (!scope) redirect("/client/login");

  const result = await getClientTracking(decodeURIComponent(params.projectId), scope.clientIds);
  if (!result) notFound();

  return (
    <div className="mx-auto w-full max-w-lg space-y-5">
      <Link
        href="/client"
        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <LuArrowLeft className="size-4" aria-hidden />
        All projects
      </Link>
      <ProjectTracker result={result} />
    </div>
  );
}
