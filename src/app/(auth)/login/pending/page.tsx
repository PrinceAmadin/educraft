import type { Metadata } from "next";
import Link from "next/link";
import { LuArrowLeft, LuClock } from "react-icons/lu";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Application under review",
  robots: { index: false, follow: false },
};

/**
 * Where a pending worker/ambassador applicant lands when they try to sign in
 * before being approved — a calm status page, not an error. The sign-in form
 * redirects here (with ?type=) instead of showing a red box. The sign-in shell
 * ((auth)/layout) supplies the top-left "Back to site" breadcrumb and the theme
 * toggle; the actions below cover "back to sign in" and "home".
 */
export default function LoginPendingPage({ searchParams }: { searchParams: { type?: string } }) {
  const roleWord = searchParams.type === "worker" ? "worker" : "ambassador";

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-12 text-center sm:py-16">
      <span className="rounded-full bg-gold/12 p-3 text-gold">
        <LuClock className="size-8" aria-hidden />
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Your application is under review
      </h1>
      <p className="mt-2 text-muted-foreground">
        Status: <span className="font-medium text-foreground">Being reviewed</span>
      </p>
      <p className="mt-3 max-w-prose text-muted-foreground">
        Thanks for applying to be an EduCraft {roleWord}. We&apos;re reviewing your application and
        will email you as soon as it&apos;s approved. You can then sign in here with the password you
        chose when you applied.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/login">
            <LuArrowLeft className="size-4" aria-hidden />
            Back to sign in
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
