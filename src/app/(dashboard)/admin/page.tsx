import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { CommandCenter } from "@/components/dashboard/CommandCenter";
import { PageHeader } from "@/components/shared/PageHeader";
import { firstName } from "@/lib/utils";

export const metadata: Metadata = { title: "Command Center" };

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
