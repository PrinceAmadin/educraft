"use client";

import * as React from "react";
import type { jsPDF as JsPDFType } from "jspdf";
import { Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MonthlyReport } from "@/lib/services/reports";
import { formatNaira } from "@/lib/utils";

function personLabel(p: { name: string; code: string; amount: number } | null): string {
  return p ? `${p.name} (${p.code}) — ${formatNaira(p.amount)}` : "—";
}

function sections(r: MonthlyReport): { title: string; rows: [string, string][] }[] {
  return [
    {
      title: "Revenue summary",
      rows: [
        ["Total revenue", formatNaira(r.revenue.totalRevenue)],
        ["Worker payouts", formatNaira(r.revenue.workerPayouts)],
        ["Ambassador commissions", formatNaira(r.revenue.ambassadorCommissions)],
        ["EduCraft share", formatNaira(r.revenue.educraftShare)],
        ["Expenses", formatNaira(r.revenue.expenses)],
        ["Net profit", formatNaira(r.revenue.netProfit)],
      ],
    },
    {
      title: "Project summary",
      rows: [
        ["Total projects created", String(r.projects.created)],
        ["Total completed", String(r.projects.completed)],
        ["Total cancelled", String(r.projects.cancelled)],
        [
          "Average delivery time",
          r.projects.avgDeliveryDays != null ? `${r.projects.avgDeliveryDays} days` : "—",
        ],
        [
          "QA first-pass rate",
          r.projects.qaFirstPassRate != null ? `${r.projects.qaFirstPassRate}%` : "—",
        ],
      ],
    },
    {
      title: "People summary",
      rows: [
        ["Active workers", String(r.people.activeWorkers)],
        ["Top worker", personLabel(r.people.topWorker)],
        ["Active ambassadors", String(r.people.activeAmbassadors)],
        ["Top ambassador", personLabel(r.people.topAmbassador)],
        ["New clients this month", String(r.people.newClients)],
      ],
    },
  ];
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** jspdf-autotable patches this onto the doc instance after each call. */
type WithAutoTable = JsPDFType & { lastAutoTable: { finalY: number } };

export function ReportExportButtons({ report }: { report: MonthlyReport }) {
  const [buildingPdf, setBuildingPdf] = React.useState(false);

  function downloadCsv() {
    const lines: string[] = [`EduCraft monthly report`, report.monthLabel, ""];
    for (const section of sections(report)) {
      lines.push(section.title);
      for (const [label, value] of section.rows) lines.push([csvCell(label), csvCell(value)].join(","));
      lines.push("");
    }
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    triggerDownload(blob, `educraft-report-${report.month}.csv`);
  }

  // PDF generation is client-only and the library is sizeable — loaded on
  // demand so it never weighs down the initial page for the CSV-only case.
  async function downloadPdf() {
    setBuildingPdf(true);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);

      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("EduCraft — Monthly Report", 14, 18);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(report.monthLabel, 14, 26);
      doc.setTextColor(0);

      let cursorY = 32;
      for (const section of sections(report)) {
        autoTable(doc, {
          startY: cursorY,
          head: [[section.title, ""]],
          body: section.rows,
          styles: { fontSize: 10 },
          headStyles: { fillColor: [13, 148, 136] },
          margin: { left: 14, right: 14 },
        });
        cursorY = (doc as WithAutoTable).lastAutoTable.finalY + 8;
      }

      doc.save(`educraft-report-${report.month}.pdf`);
    } finally {
      setBuildingPdf(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={downloadCsv}>
        <Download className="size-4" aria-hidden />
        CSV
      </Button>
      <Button variant="outline" size="sm" onClick={downloadPdf} disabled={buildingPdf}>
        {buildingPdf ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileText className="size-4" aria-hidden />}
        PDF
      </Button>
    </div>
  );
}
