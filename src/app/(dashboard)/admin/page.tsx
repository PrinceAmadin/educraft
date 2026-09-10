import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { CommandCenter } from "@/components/dashboard/CommandCenter";
import { firstName } from "@/lib/utils";

export const metadata: Metadata = { title: "Command Center" };

export default async function AdminDashboardPage() {
  const session = await auth();
  const greetingName = firstName(session?.user?.name, "there");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Welcome back, {greetingName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here is where EduCraft stands today.
        </p>
      </div>

      <CommandCenter />
    </div>
  );
}
