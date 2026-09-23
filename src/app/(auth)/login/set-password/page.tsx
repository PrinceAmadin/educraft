import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/shared/Logo";
import { SetPasswordForm } from "@/app/(auth)/login/set-password/set-password-form";
import { realEmail } from "@/lib/client-email";

export const metadata: Metadata = {
  title: "Set your password",
  robots: { index: false, follow: false },
};

export default function SetPasswordPage({ searchParams }: { searchParams: { email?: string } }) {
  // The client sign-in page hands over an email that turned out to be a worker's or ambassador's.
  const initialIdentifier = realEmail(searchParams.email) ?? "";
  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-9">
        <Logo size="lg" priority className="mb-7 lg:hidden" />
        <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-tight text-foreground">
          Set your password
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          Worker, ambassador or client? Enter the email you registered with. We check which account it is, email you a
          code, and you choose a new password.
        </p>
      </div>

      <SetPasswordForm initialIdentifier={initialIdentifier} />

      <p className="mt-9 text-sm text-muted-foreground">
        Already set one?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
