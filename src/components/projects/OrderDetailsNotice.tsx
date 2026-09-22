import { LuInfo } from "react-icons/lu";
import { db } from "@/lib/db";
import { contactDifferences, readSubmittedContact } from "@/lib/submitted-contact";

interface ClientOnRecord {
  fullName: string;
  phone: string;
  email: string | null;
  universityId: string;
  faculty: string;
  department: string;
  level: string;
}

/**
 * Shown when an order was placed with a returning client's email but the
 * details typed on it differ from the client record (they moved up a level,
 * or ordered for a friend). The record is never changed by the public form,
 * so this is how admins and the worker see what the order is really for.
 * Server component: looks up the order's university name when it differs.
 */
export async function OrderDetailsNotice({
  additionalData,
  client,
  universityName,
  audience,
}: {
  additionalData: unknown;
  client: ClientOnRecord;
  universityName: string;
  /** Workers never see the client's phone or email. */
  audience: "admin" | "worker";
}) {
  const typed = readSubmittedContact(additionalData);
  if (!typed) return null;

  const orderUniversity =
    typed.universityId && typed.universityId !== client.universityId
      ? (await db.university.findUnique({ where: { id: typed.universityId }, select: { name: true } }))?.name ?? "Another university"
      : universityName;

  const diffs = contactDifferences(typed, client, { onOrder: orderUniversity, onRecord: universityName }).filter(
    (d) => audience === "admin" || (d.field !== "phone" && d.field !== "email")
  );
  if (diffs.length === 0) return null;

  return (
    <section className="rounded-xl bg-zone p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
        <LuInfo className="size-4 shrink-0 text-gold" aria-hidden />
        Details on this order
      </h3>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        {audience === "admin"
          ? "Ordered by a returning client. What they typed this time differs from their client record, which the form never changes. Update the record by hand if it is out of date."
          : "What the client typed for this order. Work to these details."}
      </p>
      <dl className="mt-4 grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
        {diffs.map((d) => (
          <div key={d.field}>
            <dt className="meta-label">{d.label}</dt>
            <dd className="mt-1 break-words text-[15px] text-foreground">{d.onOrder}</dd>
            {audience === "admin" ? (
              <dd className="mt-0.5 break-words text-xs text-muted-foreground">On record: {d.onRecord || "not set"}</dd>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
