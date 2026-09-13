import type { Metadata } from "next";
import { PanelRegisterForm } from "@/components/ambassador-panel/public/PanelRegisterForm";

export const metadata: Metadata = {
  title: "Activate your ambassador account",
  description: "Existing EduCraft Ambassadors: submit your details once to activate your referral link.",
};

export default function PanelRegisterPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-[clamp(2.5rem,7vh,4.5rem)] sm:px-6">
      <header className="mb-10">
        <p className="eyebrow">EduCraft Ambassador Programme</p>
        <h1 className="mt-3 font-display text-[clamp(1.875rem,4vw,2.5rem)] font-bold leading-[1.1] tracking-tight text-foreground">
          Activate your ambassador account
        </h1>
        <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">
          Submit your details once. After verification your referral link goes live and you start earning commission
          automatically.
        </p>
      </header>
      <PanelRegisterForm />
    </div>
  );
}
