import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "My Work" };

export default async function WorkerDashboardPage() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          My Assignments
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome back, {session?.user?.name}.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            Active assignments, deadlines and QA feedback land here in Phase 7.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
