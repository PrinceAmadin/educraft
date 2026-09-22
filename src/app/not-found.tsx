import Link from "next/link";
import { auth, homeForRole } from "@/lib/auth";
import { LogoLockup } from "@/components/shared/Logo";
import { Button } from "@/components/ui/button";

/**
 * Any address that does not exist. The way out depends on who is looking:
 * signed-in people go back to their own dashboard; everyone else gets the
 * homepage and the client sign-in.
 */
export default async function NotFound() {
  const session = await auth().catch(() => null);
  const role = session?.user?.role;
  const home = role ? homeForRole(role) : null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-16 text-center">
      <LogoLockup href="/" size="md" />
      <p className="mt-12 font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-2 max-w-[42ch] text-sm text-muted-foreground">
        The link may be old or mistyped. Nothing is wrong with your account.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {home && home !== "/" ? (
          <Button asChild size="lg">
            <Link href={home}>{role === "CLIENT" ? "Go to my projects" : "Go to my dashboard"}</Link>
          </Button>
        ) : (
          <>
            <Button asChild size="lg">
              <Link href="/">Go to the homepage</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/client/login">Client sign in</Link>
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
