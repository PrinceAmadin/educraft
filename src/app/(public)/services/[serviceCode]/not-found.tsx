import Link from "next/link";
import { LuSearchX } from "react-icons/lu";

export default function ServiceNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-24 text-center">
      <LuSearchX className="size-7 text-subtle" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold text-foreground">That service isn’t listed</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        It may have been renamed or retired. Every current service is on the price list.
      </p>
      <Link
        href="/services"
        className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
      >
        See all services
      </Link>
    </div>
  );
}
