import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/shared/Logo";
import { ClientLoginForm } from "@/app/(auth)/client/login/client-login-form";

export const metadata: Metadata = {
  title: "Client sign in",
  robots: { index: false, follow: false },
};

export default function ClientLoginPage() {
  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-9">
        <Logo size="lg" priority className="mb-7 lg:hidden" />
        <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-tight text-foreground">
          Open your dashboard
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          Sign in with your Client ID and password. First time here? Set your password with a code we email you.
        </p>
      </div>

      <ClientLoginForm />

      <p className="mt-9 text-sm text-muted-foreground">
        Not a client?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Team sign in
        </Link>
      </p>
    </div>
  );
}
