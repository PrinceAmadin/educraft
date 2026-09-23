"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle, LuMegaphone } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/** Posts a line to the client's activity feed, in words the client should read. */
export function PostUpdateForm({ projectCode }: { projectCode: string }) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectCode)}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not post the update.");
      }
      setTitle("");
      setBody("");
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the update.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="upd-title">Title</Label>
        <Input id="upd-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Chapter 2 is taking shape" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="upd-body">Details (optional)</Label>
        <Textarea id="upd-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={600} rows={3} />
      </div>
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || title.trim().length < 2}>
          {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuMegaphone className="size-4" aria-hidden />}
          Post to the client
        </Button>
        {done ? <span className="text-sm text-success">Posted. The client has been notified.</span> : null}
      </div>
    </form>
  );
}
