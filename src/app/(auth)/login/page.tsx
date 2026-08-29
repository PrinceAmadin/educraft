import type { Metadata } from "next";
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
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size="xl" priority />
        <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-foreground">
          Welcome back
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Sign in to your EduCraft WorkBase account
        </p>
      </div>

      <Suspense fallback={<Skeleton className="h-[340px] w-full rounded-xl" />}>
        <LoginForm />
      </Suspense>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Want to become an ambassador?{" "}
        <a
          href="/apply"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Apply here
        </a>
      </p>
    </div>
  );
}
