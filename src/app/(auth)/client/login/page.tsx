import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/shared/Logo";
import { ClientLoginForm } from "@/app/(auth)/client/login/client-login-form";
import { SignedInNotice } from "@/app/(auth)/login/signed-in-notice";
import { auth, ROLE_LABELS } from "@/lib/auth";
import { isClientSessionExpired } from "@/lib/roles";
import { normalizeClientIdInput } from "@/lib/id-format";
import { realEmail } from "@/lib/client-email";

export const metadata: Metadata = {
  title: "Client sign in",
  robots: { index: false, follow: false },
};

/** Only a path inside the client dashboard, so the page cannot be used to bounce people elsewhere. */
function safeClientPath(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/client") || raw.startsWith("//") || raw.includes("\\")) return "/client";
  return raw.startsWith("/client/login") ? "/client" : raw;
}

export const dynamic = "force-dynamic";

export default async function ClientLoginPage({
  searchParams,
}: {
  searchParams: { id?: string; callbackUrl?: string };
}) {
  // The intake success page hands over the Client ID, the forgot-password page the ID or email
  // a client just set a password for. Only a well-formed ID or email is used.
  const initialId = normalizeClientIdInput(searchParams.id ?? "") ?? realEmail(searchParams.id) ?? "";
  // Already signed in (as anyone): say so instead of a form, so nobody signs in on
  // top of someone else's session by mistake.
  const session = await auth();
  const signedIn =
    session?.user && !isClientSessionExpired(session.user) ? { email: session.user.email ?? "", role: session.user.role } : null;
  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-9">
        <Logo size="lg" priority className="mb-7 lg:hidden" />
        <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-tight text-foreground">
          Open your dashboard
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          Sign in with your Client ID or email and your password. First time here? Set your password with a code we
          email you.
        </p>
      </div>

      {signedIn ? (
        <SignedInNotice email={signedIn.email} roleLabel={ROLE_LABELS[signedIn.role] ?? "Member"} />
      ) : (
        <ClientLoginForm initialId={initialId} callbackUrl={safeClientPath(searchParams.callbackUrl)} />
      )}

      <p className="mt-9 text-sm text-muted-foreground">
        Also a worker or ambassador? One login opens all your dashboards.{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in here
        </Link>
      </p>
    </div>
  );
}
