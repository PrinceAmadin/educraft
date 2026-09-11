import type { Metadata } from "next";
import { TrackLookup } from "@/components/track/TrackLookup";

export const metadata: Metadata = { title: "Track your project" };

export default function TrackHomePage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:py-24">
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Track your project
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your project ID looks like <span className="font-mono">EC-00123</span> — it was sent to you
        when you submitted.
      </p>
      <div className="mt-6">
        <TrackLookup />
      </div>
    </div>
  );
}
