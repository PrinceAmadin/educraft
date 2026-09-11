import type { Metadata } from "next";
import Link from "next/link";
import { LuCircleCheck } from "react-icons/lu";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Application received" };

export default function ApplySuccessPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center sm:py-24">
      <span className="rounded-full bg-success/12 p-3 text-success">
        <LuCircleCheck className="size-8" aria-hidden />
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Thanks for applying
      </h1>
      <p className="mt-2 text-muted-foreground">
        We&apos;ll review your application and get back to you on WhatsApp within 48 hours.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
