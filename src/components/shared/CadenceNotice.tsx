import { LuCalendarClock } from "react-icons/lu";

/**
 * A quiet one-line reminder of when money is paid out, shown at the top of a
 * portal home or the executive earnings page. Presentational only — the text is
 * passed in, and it holds no state (nothing to dismiss, nothing in storage).
 */
export function CadenceNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-zone px-4 py-3 text-sm text-muted-foreground">
      <LuCalendarClock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <p>{children}</p>
    </div>
  );
}
