import { LuCircleCheck, LuMegaphone, LuWallet } from "react-icons/lu";
import type { ClientUpdateRow } from "@/lib/services/client-updates";
import { formatDate } from "@/lib/utils";

const ICONS = {
  PAYMENT: LuWallet,
  MANUAL: LuMegaphone,
} as const;

/** Dated, plain-language updates, newest first. Only ProjectUpdate rows ever appear here. */
export function ClientActivityFeed({ updates }: { updates: ClientUpdateRow[] }) {
  if (updates.length === 0) {
    return <p className="text-sm text-muted-foreground">Updates on your project will appear here.</p>;
  }
  return (
    <ul className="space-y-5">
      {updates.map((u) => {
        const Icon = ICONS[u.kind as keyof typeof ICONS] ?? LuCircleCheck;
        return (
          <li key={u.id} className="flex gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-zone text-primary">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-medium leading-snug text-foreground">{u.title}</p>
              {u.body ? <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{u.body}</p> : null}
              <p className="mt-1 text-xs text-subtle">{formatDate(u.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
