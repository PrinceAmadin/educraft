import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { CommandCenter } from "@/components/command-center/CommandCenter";
import { PageHeader } from "@/components/shared/PageHeader";
import { firstName } from "@/lib/utils";

export const metadata: Metadata = { title: "Command Center" };
export const dynamic = "force-dynamic";
/** Next to the database, like the Command Center's endpoints (the dashboard layout reads it on every load). */
export const preferredRegion = ["dub1"];

/**
 * The founder's Command Center (Phase 5): four tabs under /admin, picked by
 * `?tab=` (Today when absent; the shell reads it with `useSearchParams`).
 * Each tab fetches its own aggregation from /api/admin/command-center/*; the
 * greeting is the only server-rendered data.
 */
export default async function AdminDashboardPage() {
  const session = await auth();
  const greetingName = firstName(session?.user?.name, "there");

  return (
    <div className="space-y-8 sm:space-y-10">
      <PageHeader
        title={`Welcome back, ${greetingName}`}
        description="Here is where EduCraft stands today."
      />
      <CommandCenter />
    </div>
  );
}
