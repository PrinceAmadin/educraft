import Link from "next/link";
import { LuLink2 } from "react-icons/lu";
import type { LinkedProfile } from "@/lib/services/linked-profiles";

/** "Also an ambassador" / "Also a worker": one click to the person's other record. Nothing renders when there is none. */
export function LinkedProfileLink({ linked }: { linked: LinkedProfile | null }) {
  if (!linked) return null;
  const label = linked.kind === "ambassador" ? "Also an ambassador" : "Also a worker";
  return (
    <Link
      href={linked.href}
      className="inline-flex items-center gap-1.5 rounded-full bg-zone px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <LuLink2 className="size-3.5" aria-hidden />
      {label}
      <span className="font-mono text-muted-foreground">{linked.publicId}</span>
    </Link>
  );
}
