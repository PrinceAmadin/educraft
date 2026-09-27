"use client";

import { LuDownload } from "react-icons/lu";
import { Button } from "@/components/ui/button";

/**
 * Phase D7: the assembled report as a Word file. Live once every chapter is
 * written; the file is built on request (nothing stored), so the link always
 * gives the current chapters.
 */
export function ReportDownload({ href, ready, total }: { href: string; ready: boolean; total: number }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4" data-report-download={ready ? "ready" : "waiting"}>
      {ready ? (
        <Button asChild className="h-12 w-full sm:h-11 sm:w-auto">
          <a href={href} download>
            <LuDownload aria-hidden />
            Download report (.docx)
          </a>
        </Button>
      ) : (
        <Button disabled className="h-12 w-full sm:h-11 sm:w-auto" aria-describedby="report-download-note">
          <LuDownload aria-hidden />
          Download report (.docx)
        </Button>
      )}
      <p id="report-download-note" className="text-xs leading-relaxed text-muted-foreground">
        {ready
          ? "When Word asks whether to update fields, choose Yes: that fills in the contents, the lists and their page numbers."
          : `Available when all ${total} chapters are written.`}
      </p>
    </div>
  );
}
