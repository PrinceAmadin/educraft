"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, CircleAlert, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import type { ApplicationRow } from "@/lib/services/applications";

export function ApplicationReview({
  rows,
  universities,
}: {
  rows: ApplicationRow[];
  universities: { id: string; name: string; abbreviation: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [modal, setModal] = React.useState<
    { row: ApplicationRow; action: "approve" | "reject" } | null
  >(null);
  const [universityId, setUniversityId] = React.useState("");
  const [note, setNote] = React.useState("");

  async function run(id: string, action: "approve" | "reject", body: unknown) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ambassadors/applications/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "That action could not be completed.");
      }
      setModal(null);
      setNote("");
      setUniversityId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && !modal ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{row.fullName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.phone}
                  {row.email ? ` · ${row.email}` : ""} · applied {formatDate(row.createdAt)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.university ?? "University not given"}
                  {row.department ? ` · ${row.department}` : ""}
                  {row.level ? ` · ${row.level}` : ""}
                </p>
                {row.motivation ? (
                  <p className="mt-2 rounded-lg bg-elevated p-2 text-sm text-foreground">
                    &ldquo;{row.motivation}&rdquo;
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => {
                    setModal({ row, action: "approve" });
                    setUniversityId("");
                    setError(null);
                  }}
                >
                  <Check className="size-4" aria-hidden />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-danger/40 text-danger hover:bg-danger/10"
                  disabled={busy !== null}
                  onClick={() => {
                    setModal({ row, action: "reject" });
                    setNote("");
                    setError(null);
                  }}
                >
                  <X className="size-4" aria-hidden />
                  Reject
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={modal !== null} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent>
          {modal?.action === "approve" ? (
            <>
              <DialogHeader>
                <DialogTitle>Approve {modal.row.fullName}</DialogTitle>
                <DialogDescription>
                  Creates an ambassador with a fresh referral code.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(modal.row.id, "approve", universityId ? { universityId } : {});
                }}
              >
                {modal.row.needsUniversity ? (
                  <label className="block">
                    <span className="mb-1 block text-[13px] font-medium text-foreground">
                      University (the applicant chose &ldquo;Other&rdquo;)
                    </span>
                    <Select
                      value={universityId}
                      onChange={(e) => setUniversityId(e.target.value)}
                      required
                    >
                      <option value="">Select a university</option>
                      {universities.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.abbreviation})
                        </option>
                      ))}
                    </Select>
                  </label>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    University: {modal.row.university}
                  </p>
                )}
                {error ? <p className="text-xs text-danger">{error}</p> : null}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setModal(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busy !== null || (modal.row.needsUniversity && !universityId)}
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                    Approve
                  </Button>
                </div>
              </form>
            </>
          ) : modal ? (
            <>
              <DialogHeader>
                <DialogTitle>Reject {modal.row.fullName}</DialogTitle>
                <DialogDescription>Optionally leave a note for the record.</DialogDescription>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(modal.row.id, "reject", { note: note.trim() });
                }}
              >
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Reason (optional)"
                  className="w-full rounded-lg border border-border bg-input p-2 text-sm text-foreground focus-visible:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {error ? <p className="text-xs text-danger">{error}</p> : null}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setModal(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    variant="destructive"
                    disabled={busy !== null}
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                    Reject
                  </Button>
                </div>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
