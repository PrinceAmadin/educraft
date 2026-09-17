import type { Metadata } from "next";
import Link from "next/link";
import { LuCircleCheck } from "react-icons/lu";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Application submitted" };

export default function WorkerApplySuccessPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center sm:py-24">
      <span className="rounded-full bg-success/12 p-3 text-success">
        <LuCircleCheck className="size-8" aria-hidden />
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Registration submitted
      </h1>
      <p className="mt-2 text-muted-foreground">
        Status: <span className="font-medium text-foreground">Pending admin approval</span>
      </p>
      <p className="mt-2 max-w-prose text-muted-foreground">
        We&apos;ll review your application and notify you once it&apos;s approved. You can then sign in
        with the email and password you just set.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/login">Go to sign in</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
