import type { Metadata } from "next";
import { LuInbox, LuTrophy } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getAmbassadorByUserId, getLeaderboard } from "@/lib/services/ambassador-portal";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

export default async function AmbassadorLeaderboardPage() {
  const session = await auth();
  const ambassador = session?.user ? await getAmbassadorByUserId(session.user.id) : null;
  if (!ambassador) {
    return <EmptyState icon={LuInbox} title="No ambassador profile" description="Contact an admin." />;
  }

  const { top, me } = await getLeaderboard(ambassador.id);
  const monthLabel = new Date().toLocaleDateString("en-NG", { month: "long" });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Top ambassadors by conversions in {monthLabel}.
        </p>
      </div>

      {me ? (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
          <p className="text-sm font-medium text-foreground">You&apos;re #{me.rank} this month</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {me.conversions} conversion{me.conversions === 1 ? "" : "s"} so far
            {me.inTop ? "" : " — keep going to break into the top 10"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            No conversions yet this month. Share your link to get on the board.
          </p>
        </div>
      )}

      {top.length === 0 ? (
        <EmptyState
          icon={LuTrophy}
          title="No activity this month"
          description="Conversions this month will rank ambassadors here."
        />
      ) : (
        <ol className="divide-y divide-border rounded-xl border border-border">
          {top.map((row) => (
            <li
              key={`${row.rank}-${row.name}`}
              className={cn("flex items-center gap-3 px-4 py-3", row.isMe && "bg-primary/5")}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold",
                  row.rank === 1
                    ? "bg-gold/20 text-gold"
                    : row.rank <= 3
                      ? "bg-elevated text-foreground"
                      : "bg-elevated text-muted-foreground"
                )}
              >
                {row.rank}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "text-sm",
                    row.isMe ? "font-semibold text-foreground" : "text-foreground"
                  )}
                >
                  {row.isMe ? "You" : row.name}
                </span>
                {row.university ? (
                  <span className="ml-2 text-xs text-muted-foreground">{row.university}</span>
                ) : null}
              </span>
              <span className="font-mono text-sm tabular-nums text-foreground">{row.conversions}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
