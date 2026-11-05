import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getScreeningSettings, listScreeningItems } from "@/lib/services/screening";
import { getFinalSettings } from "@/lib/services/final-practical";
import { PageHeader } from "@/components/shared/PageHeader";
import { ScreeningBankManager } from "@/components/screening/ScreeningBankManager";
import { FinalBriefsForm } from "@/components/screening/FinalBriefsForm";

export const metadata: Metadata = { title: "Screening questions" };
export const dynamic = "force-dynamic";

/**
 * The founder's screening question bank and settings. Founder only — the bank
 * holds the answers. `/admin/settings/screening` has no route row, so it is
 * SUPER_ADMIN by the fail-closed default; this guard is the second layer.
 */
export default async function ScreeningSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "SUPER_ADMIN") redirect("/admin");

  const [items, settings, finalSettings] = await Promise.all([listScreeningItems(), getScreeningSettings(), getFinalSettings()]);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Screening questions"
        description="The Stage-1 worker screening bank. Each candidate's test draws from the active questions at random. Answers live here and are never shown to a candidate."
        back={{ href: "/admin/workers/screening", label: "Screening results" }}
      />
      <ScreeningBankManager
        settings={settings}
        items={items.map((i) => ({ id: i.id, kind: i.kind, payload: i.payload, answerKey: i.answerKey, isActive: i.isActive, notes: i.notes }))}
      />
      <div className="border-t border-border/60 pt-7">
        <FinalBriefsForm settings={finalSettings} />
      </div>
    </div>
  );
}
