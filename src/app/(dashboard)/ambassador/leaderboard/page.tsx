import type { Metadata } from "next";
import { LuInbox, LuTrophy } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getAmbassadorByUserId, getLeaderboard } from "@/lib/services/ambassador-portal";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
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
    <div className="space-y-8">
      <PageHeader title="Leaderboard" description={`Top ambassadors by conversions in ${monthLabel}.`} />

      {me ? (
        <div className="flex items-center gap-4 rounded-2xl bg-primary/10 p-5">
          <span className="font-mono text-[2rem] font-medium leading-none tabular-nums text-primary">#{me.rank}</span>
          <div>
            <p className="text-[15px] font-medium text-foreground">Your position this month</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {me.conversions} conversion{me.conversions === 1 ? "" : "s"} so far
              {me.inTop ? "" : " — keep going to break into the top 10"}
            </p>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl bg-zone p-5 text-sm text-muted-foreground">
          No conversions yet this month. Share your link to get on the board.
        </p>
      )}

      {top.length === 0 ? (
        <EmptyState
          icon={LuTrophy}
          title="No activity this month"
          description="Conversions this month will rank ambassadors here."
        />
      ) : (
        <ol className="divide-y divide-border/80">
          {top.map((row) => (
            <li
              key={`${row.rank}-${row.name}`}
              className={cn("-mx-3 flex items-center gap-3 rounded-lg px-3 py-3.5", row.isMe && "bg-primary/5")}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold",
                  row.rank === 1 ? "bg-gold/20 text-gold" : row.rank <= 3 ? "bg-elevated text-foreground" : "text-muted-foreground"
                )}
              >
                {row.rank}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("text-[15px]", row.isMe ? "font-semibold text-foreground" : "text-foreground")}>
                  {row.isMe ? "You" : row.name}
                </span>
                {row.university ? <span className="ml-2 text-[13px] text-muted-foreground">{row.university}</span> : null}
              </span>
              <span className="font-mono text-[15px] font-medium tabular-nums text-foreground">{row.conversions}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
