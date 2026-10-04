import { cn, timeAgo } from "@/lib/utils";

export interface NotificationView {
  id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

/** The dot colour for each notification type. */
export const NOTIFICATION_DOT: Record<string, string> = {
  urgent: "bg-danger",
  warning: "bg-gold",
  success: "bg-success",
  info: "bg-primary",
};

/**
 * The inner content of one notification row — a type dot, the title, a
 * two-line message and the relative time. Shared by the topbar bell dropdown
 * and the full notifications page so both read identically.
 */
export function NotificationBody({ n }: { n: NotificationView }) {
  return (
    <div className="flex gap-2.5">
      <span
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          n.read ? "bg-transparent" : NOTIFICATION_DOT[n.type] ?? "bg-primary"
        )}
        aria-hidden
      />
      <div className="min-w-0">
        <p className={cn("text-sm", n.read ? "text-muted-foreground" : "text-foreground")}>{n.title}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
        <p className="mt-0.5 text-[11px] text-subtle">{timeAgo(n.createdAt)}</p>
      </div>
    </div>
  );
}
