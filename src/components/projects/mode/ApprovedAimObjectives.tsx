/**
 * The approved aim and objectives, read-only, for the specialist's Report tab:
 * Chapter One states them word for word (the chapter check's ST8 holds an
 * upload to them), so the specialist can copy them exactly when correcting a
 * chapter in Word. No costs, no buttons.
 */
export function ApprovedAimObjectives({ aim, objectives }: { aim: string | null; objectives: string[] }) {
  return (
    <section className="space-y-3" aria-labelledby="approved-aim-heading">
      <div className="space-y-0.5">
        <h2 id="approved-aim-heading" className="text-base font-semibold text-foreground">
          Aim and objectives
        </h2>
        <p className="text-sm text-muted-foreground">Approved. Chapter One states them word for word, in this order.</p>
      </div>
      <div className="space-y-3 rounded-2xl bg-zone p-4">
        <div className="space-y-1">
          <p className="meta-label">Aim</p>
          <p className="text-sm text-foreground">{aim ?? "No aim has been approved yet: the COO adds it on the Report tab."}</p>
        </div>
        <div className="space-y-1">
          <p className="meta-label">Objectives</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
            {objectives.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
