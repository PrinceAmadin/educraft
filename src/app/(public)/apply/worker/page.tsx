import type { Metadata } from "next";
import { WorkerApplyForm } from "@/components/worker-apply/WorkerApplyForm";

export const metadata: Metadata = {
  title: "Join as a worker",
  description: "Deliver academic work for EduCraft students and earn per project.",
};
export const dynamic = "force-dynamic";

export default function WorkerApplyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Join EduCraft as a worker
        </h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          Deliver final year projects, reports, and other academic work for EduCraft clients. Set up
          your account below — an admin reviews every application before it&apos;s approved.
        </p>
      </div>
      <WorkerApplyForm />
    </div>
  );
}
