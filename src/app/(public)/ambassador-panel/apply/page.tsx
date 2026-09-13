import type { Metadata } from "next";
import { PanelApplyForm } from "@/components/ambassador-panel/public/PanelApplyForm";

export const metadata: Metadata = {
  title: "Ambassador application",
  description: "Apply to become an EduCraft Ambassador and earn commission on every client you refer.",
};

export default function PanelApplyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-[clamp(2.5rem,7vh,4.5rem)] sm:px-6">
      <header className="mb-10">
        <p className="eyebrow">EduCraft Ambassador Programme</p>
        <h1 className="mt-3 font-display text-[clamp(1.875rem,4vw,2.5rem)] font-bold leading-[1.1] tracking-tight text-foreground">
          Ambassador application
        </h1>
        <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-muted-foreground">
          Earn 10% commission on every client you refer to EduCraft. Fill this in accurately — your details are used for
          account setup and paying your commission.
        </p>
      </header>
      <PanelApplyForm />
    </div>
  );
}
