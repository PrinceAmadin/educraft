import Link from "next/link";
import { LuSearchX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
export default function NF() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-zone px-6 py-16 text-center">
      <span className="rounded-lg bg-elevated p-2.5 text-muted-foreground"><LuSearchX className="size-6" aria-hidden /></span>
      <p className="text-sm font-medium text-foreground">Assignment not found</p>
      <p className="max-w-[42ch] text-xs text-muted-foreground">This project isn&apos;t assigned to you, or it doesn&apos;t exist.</p>
      <Button asChild variant="outline" size="sm" className="mt-1"><Link href="/worker/projects">My projects</Link></Button>
    </div>
  );
}
