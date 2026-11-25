/**
 * Seeds the Stage-1 screening question bank from `scripts/data/screening-bank.ts`
 * — the Eye test paragraphs, the reference-relevance sets and the rewrite
 * paragraphs. Without them `sendScreening` refuses with "Add Eye-test and
 * reference-relevance questions to the bank first", so nothing can be sent.
 *
 *   npm run screening:seed-bank            # dry run
 *   npm run screening:seed-bank -- --apply # writes
 *
 * Idempotent by the `seed:<key>` tag each row carries in `notes`: a second run
 * creates nothing, and anything the founder has since edited, deactivated or
 * written himself on Settings > Screening is left alone. Every item is put
 * through the same validator the founder's own bank form uses, so a run can
 * never leave a row the app would refuse.
 */
import { PrismaClient } from "@prisma/client";
import { validateEyeItem, validateRelevanceItem } from "../src/lib/screening/rules";
import { validateRewriteItem, bannedConstructions } from "../src/lib/screening/rewrite";
import { EYE_ITEMS, RELEVANCE_ITEMS, REWRITE_ITEMS } from "./data/screening-bank";

const TAG = (key: string) => `seed:${key}`;

type Row = { kind: string; key: string; label: string; payload: object; answerKey: object; notes: string };

function buildRows(): Row[] {
  const rows: Row[] = [];
  for (const e of EYE_ITEMS) {
    const { payload, answerKey } = validateEyeItem({ text: e.text, source: e.source }, { isAI: e.isAI });
    rows.push({
      kind: "EYE",
      key: e.key,
      label: `${e.isAI ? "AI" : "person"} · ${e.difficulty} · ${e.source}`,
      payload,
      answerKey,
      notes: `${TAG(e.key)} · written by ${e.isAI ? "AI" : "a person"} · ${e.difficulty}`,
    });
  }
  for (const r of RELEVANCE_ITEMS) {
    const { payload, answerKey } = validateRelevanceItem({ topic: r.topic, sources: r.sources }, { labels: r.labels });
    rows.push({
      kind: "REL",
      key: r.key,
      label: r.topic,
      payload,
      answerKey,
      notes: `${TAG(r.key)} · ten constructed sources, 3 core / 3 closely related / 2 tangential / 2 irrelevant`,
    });
  }
  for (const w of REWRITE_ITEMS) {
    const { payload, answerKey } = validateRewriteItem({ text: w.text, note: w.note }, {});
    rows.push({
      kind: "REWRITE",
      key: w.key,
      label: `${bannedConstructions(w.text).length} tells planted`,
      payload,
      answerKey,
      notes: `${TAG(w.key)} · ${w.note}`,
    });
  }
  return rows;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = new PrismaClient();
  try {
    const rows = buildRows();
    const existing = await db.screeningItem.findMany({ select: { notes: true, kind: true, isActive: true } });
    const seeded = new Set(
      existing.flatMap((e) => {
        const tag = (e.notes ?? "").split(" ")[0];
        return tag.startsWith("seed:") ? [tag] : [];
      })
    );

    const byKind = existing.reduce<Record<string, number>>((acc, e) => {
      acc[e.kind] = (acc[e.kind] ?? 0) + 1;
      return acc;
    }, {});
    console.log(
      existing.length
        ? `Bank already holds ${existing.length} item(s): ${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(" · ")}`
        : "Bank is empty."
    );

    const missing = rows.filter((r) => !seeded.has(TAG(r.key)));
    if (missing.length === 0) {
      console.log("Nothing to create — every seeded item is already in the bank.");
      return;
    }

    for (const r of missing) {
      console.log(`${apply ? "create" : "would create"} ${r.kind.padEnd(7)} ${r.key.padEnd(22)} ${r.label}`);
      if (apply) {
        await db.screeningItem.create({
          data: { kind: r.kind, payload: r.payload, answerKey: r.answerKey, notes: r.notes, isActive: true },
        });
      }
    }

    const count = (k: string) => missing.filter((r) => r.kind === k).length;
    console.log(
      apply
        ? `\nCreated ${missing.length} item(s): ${count("EYE")} Eye · ${count("REL")} relevance · ${count("REWRITE")} rewrite.`
        : `\nDry run — ${missing.length} item(s) would be created. Re-run with -- --apply to write.`
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
