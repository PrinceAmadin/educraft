import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Command Center" };

export default async function AdminDashboardPage() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Command Center
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome back, {session?.user?.name}. Here is where EduCraft stands today.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            Pipeline, revenue cards, activity feed and alerts land here in Phase 2.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
