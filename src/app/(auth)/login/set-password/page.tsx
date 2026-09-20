import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/shared/Logo";
import { SetPasswordForm } from "@/app/(auth)/login/set-password/set-password-form";

export const metadata: Metadata = {
  title: "Set your password",
  robots: { index: false, follow: false },
};

export default function SetPasswordPage() {
  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-9">
        <Logo size="lg" priority className="mb-7 lg:hidden" />
        <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-tight text-foreground">
          Set your password
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          Already an EduCraft ambassador? Confirm it is you with a code we email you, then choose the password for your
          dashboard.
        </p>
      </div>

      <SetPasswordForm />

      <p className="mt-9 text-sm text-muted-foreground">
        Already set one?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
