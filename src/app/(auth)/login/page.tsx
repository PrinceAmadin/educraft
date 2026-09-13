import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/shared/Logo";
import { LoginForm } from "@/app/(auth)/login/login-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-9">
        {/* The split layout carries the brand on desktop; phones get a small mark */}
        <Logo size="lg" priority className="mb-7 lg:hidden" />
        <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-tight text-foreground">
          Welcome back
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          Sign in to your EduCraft WorkBase account.
        </p>
      </div>

      <Suspense fallback={<Skeleton className="h-[260px] w-full rounded-xl" />}>
        <LoginForm />
      </Suspense>

      <p className="mt-9 text-sm text-muted-foreground">
        Want to become an ambassador?{" "}
        <Link href="/apply" className="font-medium text-primary underline-offset-4 hover:underline">
          Apply here
        </Link>
      </p>
    </div>
  );
}
