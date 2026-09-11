"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TrackLookup({ notFoundCode }: { notFoundCode?: string }) {
  const router = useRouter();
  const [code, setCode] = React.useState(notFoundCode ?? "");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = code.trim();
        if (trimmed) router.push(`/track/${encodeURIComponent(trimmed.toUpperCase())}`);
      }}
    >
      <label htmlFor="track-code" className="text-sm font-medium text-foreground">
        Enter your project ID
      </label>
      <div className="flex gap-2">
        <Input
          id="track-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="EC-00123"
          autoComplete="off"
          className="font-mono uppercase"
        />
        <Button type="submit" disabled={!code.trim()}>
          Track
        </Button>
      </div>
      {notFoundCode ? (
        <p className="text-sm text-danger">
          We couldn&apos;t find a project with ID{" "}
          <span className="font-mono">{notFoundCode}</span>. Double-check and try again.
        </p>
      ) : null}
    </form>
  );
}
