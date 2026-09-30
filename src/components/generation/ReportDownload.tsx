"use client";

import { LuDownload } from "react-icons/lu";
import { Button } from "@/components/ui/button";

/** Chapter review: which chapters are approved, and whose download this is. */
export interface ReportReviewSummary {
  /** Chapters with no approved version yet (the report cannot be built from approvals alone). */
  notApproved: number[];
  audience: "staff" | "specialist";
}

const list = (ns: number[]) => (ns.length === 1 ? `Chapter ${ns[0]}` : `Chapters ${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`);

/**
 * Phase D7: the assembled report as a Word file, built on request (nothing
 * stored), so the link always gives the current chapters. Chapter review: the
 * specialist's copy is built only from the COO-approved chapters and opens once
 * every chapter is approved; the founder's and the COO's is a working copy (the
 * AI text where a chapter is not approved yet) until then.
 */
export function ReportDownload({ href, ready, total, review }: { href: string; ready: boolean; total: number; review?: ReportReviewSummary | null }) {
  const written = ready;
  const allApproved = !review || review.notApproved.length === 0;
  const live = written && (review?.audience !== "specialist" || allApproved);
  const workingCopy = Boolean(review && review.audience === "staff" && !allApproved);
  const label = workingCopy ? "Download working copy (.docx)" : "Download report (.docx)";
  const note = !written
    ? `Available when all ${total} chapters are written.`
    : !live
      ? `Available once the COO has approved every chapter. Still to approve: ${list(review!.notApproved)}.`
      : workingCopy
        ? `${list(review!.notApproved)} ${review!.notApproved.length === 1 ? "is" : "are"} not approved yet, so this copy uses the AI text there. When Word asks whether to update fields, choose Yes.`
        : "When Word asks whether to update fields, choose Yes: that fills in the contents, the lists and their page numbers.";
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4" data-report-download={live ? (workingCopy ? "working-copy" : "ready") : "waiting"}>
      {live ? (
        <Button asChild variant={workingCopy ? "outline" : "default"} className="h-12 w-full sm:h-11 sm:w-auto">
          <a href={href} download>
            <LuDownload aria-hidden />
            {label}
          </a>
        </Button>
      ) : (
        <Button disabled className="h-12 w-full sm:h-11 sm:w-auto" aria-describedby="report-download-note">
          <LuDownload aria-hidden />
          {label}
        </Button>
      )}
      <p id="report-download-note" className="text-xs leading-relaxed text-muted-foreground">
        {note}
      </p>
    </div>
  );
}
