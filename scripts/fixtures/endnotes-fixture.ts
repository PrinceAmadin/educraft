/**
 * A Mode 1 thematic report (Cultural Studies, Template B, MODE_B document
 * endnotes) written the way the chapter prompts now ask: note markers as ^3,
 * each part of a chapter ending with its own [ENDNOTES] block. It carries the
 * cases the assembly must handle: notes split across parts, a part that restarts
 * its numbering at 1, a note number written as a superscript character (³, as
 * the D11 live report did), a full citation repeated word for word in a later
 * chapter (joined into one note), a Chicago short form and an "Ibid." (both kept
 * as notes of their own), and 41 distinct notes, every one naming a verified
 * work. Used by check:assembly, check:quality and the D11 endnotes fixture run.
 */

import { FIXTURE_REFERENCES, type FixtureReference } from "./quality-fixture";

export const E_TITLE = "Mobile Money and the Changing Culture of Trade in Lagos Markets";
export const E_OBJECTIVES = [
  "To examine how mobile money has changed the customs of buying and selling in Lagos markets.",
  "To analyse the meanings market traders in Lagos attach to cash and to money held on a phone.",
  "To assess how trust between traders, customers and agents is made and kept in a market that no longer runs on cash alone.",
];
export const E_THEMATIC = { chapter3: "Cash, the Phone and the Meaning of Money", chapter4: "Trust, Agents and the New Customs of the Market" };

/** D9's fourteen cultural studies works (each second author is Okonjo, T.: the shared co-author case). */
const EXTRA = [
  ["Adebanjo", "Cash, credit and custom in the Yoruba market", "Market women in Ibadan and Lagos kept credit relations with regular customers through daily cash contact, and the move to transfers weakened the daily visit on which that credit rested."],
  ["Bankole", "The social life of the mobile wallet", "Traders in three Lagos markets treated money held on a phone as savings and cash as working money."],
  ["Chidozie", "Agents as new market intermediaries", "Mobile money agents took over part of the role of the market association's thrift collector."],
  ["Dosunmu", "Haggling after the transfer", "Bargaining continued after the adoption of transfers, but the final price was more often rounded to a figure easy to type."],
  ["Ekong", "Gender and the control of trading money", "Women traders paid by wallet reported more control over trading income than those paid in cash."],
  ["Folarin", "Trust and the failed transfer", "A failed or delayed transfer was the most common cause of dispute between traders and customers."],
  ["Gbadamosi", "Thrift societies and digital money", "Rotating savings groups moved their contributions to wallets slowly, because members valued the collector's visit."],
  ["Haruna", "Informal trade and the cashless policy in Nigeria", "The cashless policy raised transfer use among traders, who kept cash for purchases from suppliers outside the city."],
  ["Iwuchukwu", "Market associations and new payment rules", "Market associations set their own rules for transfers and enforced them through the market's own officers."],
  ["Jimoh", "The alert as proof of payment", "Traders treated the bank alert on a phone as proof of payment and released goods only after it arrived."],
  ["Kolawole", "Money, memory and the market ledger", "Traders who kept a paper ledger of credit sales kept it after adopting wallets."],
  ["Lasisi", "Young traders and phone-first commerce", "Young traders took orders and payment by phone before the customer arrived."],
  ["Madu", "Risk, fraud and the fake alert", "Fake payment alerts were the fraud traders feared most, and most checked their balance before releasing goods."],
  ["Nwankwo", "Cultures of money in West African markets", "Cash carried meanings of immediacy and respect that transfers did not, and elders were more often paid in cash."],
] as const;

export const E_EXTRA: FixtureReference[] = EXTRA.map(([surname, title, finding], i) => ({
  id: `ext-${i + 1}`,
  title,
  proposedTitle: title,
  authors: `${surname}, ${String.fromCharCode(65 + (i % 26))}.; Okonjo, T.`,
  year: 2016 + (i % 8),
  journal: ["Africa: Journal of the International African Institute", "Journal of African Cultural Studies", "Journal of Cultural Economy"][i % 3],
  doi: `10.5555/endnotes.${i + 1}`,
  abstract: `This study examined ${title.toLowerCase()} through interviews and observation in Nigerian markets. ${finding}`,
  classification: i % 3 === 0 ? "CLOSELY_RELATED" : "CORE",
}));

export const E_REFERENCES: FixtureReference[] = [...FIXTURE_REFERENCES, ...E_EXTRA];

// ─── Notes ───────────────────────────────────────────────────────────────────

const apaAuthors = (a: string) => a.split(";").map((s) => s.trim()).join(", & ");
/** The first appearance in a chapter: the work in full. */
export const fullNote = (r: FixtureReference) => `${apaAuthors(r.authors)} (${r.year}). ${r.title}. *${r.journal}*.`;
/** A later note on the same work in a chapter: the Chicago short form (no year). */
export const shortNote = (r: FixtureReference) => `${r.authors.split(",")[0]}, *${r.title.split(/\s+/).slice(0, 4).join(" ").replace(/[,:]$/, "")}*.`;

const SUP = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
const sup = (n: number) => String(n).split("").map((d) => SUP[Number(d)]).join("");

/** Writes one chapter, part by part, numbering its notes as the prompt asks. */
class Chapter {
  readonly lines: string[] = [];
  private entries: string[] = [];
  private n = 0;
  constructor(number: string, title: string) {
    this.lines.push(`[H1] CHAPTER ${number}`, `[H1] ${title}`, "");
  }
  /** A marker for a note on `ref`, straight after the sentence's full stop. */
  note(ref: FixtureReference, form: "full" | "short" | "ibid" = "full", marker: "caret" | "superscript" = "caret"): string {
    this.n++;
    this.entries.push(`${this.n}. ${form === "full" ? fullNote(ref) : form === "short" ? shortNote(ref) : "Ibid."}`);
    return marker === "superscript" ? sup(this.n) : `^${this.n}`;
  }
  h2(text: string) {
    this.lines.push(`[H2] ${text}`, "");
  }
  p(...sentences: string[]) {
    this.lines.push(sentences.join(" "), "");
  }
  list(items: string[]) {
    this.lines.push(...items, "");
  }
  /** The end of a part: its [ENDNOTES] block. `restart` makes the next part number from 1 again. */
  endPart(restart = false) {
    this.lines.push("[ENDNOTES]", ...this.entries, "");
    this.entries = [];
    if (restart) this.n = 0;
  }
  text() {
    return this.lines.join("\n").trim();
  }
}

const F = FIXTURE_REFERENCES;
const X = E_EXTRA;
const topicOf = (r: FixtureReference) => r.title.split(":")[0].toLowerCase();

export function endnotesChapters(): { number: number; text: string }[] {
  // ── Chapter One ────────────────────────────────────────────────────────────
  const c1 = new Chapter("ONE", "INTRODUCTION");
  c1.h2("1.1 Background to the Study");
  c1.p(
    `Trade in Lagos markets has long rested on cash passed from hand to hand, and on the relations that the daily exchange of notes sustained.${c1.note(F[0])}`,
    `Mobile money has entered this setting quickly, and surveys of traders in Balogun and Mile 12 place regular wallet use at about two in every five traders.${c1.note(F[1])}`,
    `Adoption has been uneven across market groups, deepening once traders began to pay suppliers by wallet as well as to receive transfers.${c1.note(F[2], "full", "superscript")}`,
  );
  c1.p(
    `The fees charged on each transfer and the trust traders place in agents explain much of this unevenness.${c1.note(F[3])}`,
    `A good number of traders still refuse transfers from customers, preferring the certainty of notes in the hand.${c1.note(F[4])}`,
    `These patterns suggest that the move from cash is a change in the customs of the market, and not only a change in the tools of payment.`,
  );
  c1.h2("1.2 Objectives of the Study");
  c1.p("The study pursues three objectives, stated here as approved:");
  c1.list(E_OBJECTIVES.map((o, i) => `${i + 1}. ${o}`));
  c1.h2("1.3 Significance of the Study");
  c1.p(
    `The study matters to those who regulate payment in Nigerian markets, since caps on agent fees are judged against evidence of how traders actually pay.${c1.note(F[5])}`,
    `It matters to market associations, which now write rules for transfers into the customs they enforce.`,
    `It also adds a cultural reading to a field in which most accounts of mobile money measure sales and adoption rates.`,
  );
  c1.endPart();
  c1.h2("1.4 Scope of the Study");
  c1.p(
    `The study covers retail trade in five Lagos markets between 2016 and 2024, a period in which transfers moved from rare to routine.${c1.note(F[6])}`,
    `It considers cash and phone money as they are used and talked about by traders, customers and agents.`,
    `Wholesale supply chains outside the city fall outside its reach.`,
  );
  c1.h2("1.5 Research Methodology");
  c1.p(
    `The study reads published ethnographic and survey work on Lagos trade thematically, setting accounts of payment beside accounts of custom.`,
    `Its sources are the verified studies listed at the end of the report, read for what they show about meaning as well as behaviour.${c1.note(F[7])}`,
    `Themes were drawn from the objectives and refined as the reading proceeded.`,
  );
  c1.h2("1.6 Literature Review in Brief");
  c1.p(
    `Writing on mobile money in Nigeria falls into studies of adoption and studies of market culture, and the two seldom meet.`,
    `The adoption studies measure fees, trust and sales, while the cultural studies describe credit, haggling and the meaning of cash.`,
    `The review that follows brings these two bodies of work together around the three objectives.`,
  );
  c1.endPart();

  // ── Chapter Two (repeats Chapter One's first work in full: joined into one note) ──
  const c2 = new Chapter("TWO", "LITERATURE REVIEW");
  c2.h2("2.1 Conceptual Review of Money and Market Culture");
  c2.p(
    `Money in a market is both a measure of value and a sign of the relation between buyer and seller.${c2.note(F[0])}`,
    `Studies of ${topicOf(F[8])} show that the tools of payment change what traders expect of one another.${c2.note(F[8])}`,
    `Work on ${topicOf(F[9])} finds that the perceived risk of a payment weighs as heavily as its cost.${c2.note(F[9])}`,
  );
  c2.p(
    `Research on ${topicOf(F[10])} links new payment tools to the day-to-day running of small firms.${c2.note(F[10])}`,
    `Studies of ${topicOf(F[11])} describe agents as the point at which phone money becomes cash again.${c2.note(F[11])}`,
    `Work on ${topicOf(F[12])} returns to the wallet itself as an object that traders carry and guard.${c2.note(F[12])}`,
  );
  c2.h2("2.2 Theoretical Framework");
  c2.p(
    `The Technology Acceptance Model explains adoption through perceived usefulness and ease of use.${c2.note(F[13])}`,
    `Its critics point out that it treats payment as a private choice rather than a shared custom.${c2.note(F[14])}`,
    `A cultural account of money is therefore set beside it, one that reads payment as a social act.${c2.note(F[15])}`,
  );
  c2.endPart();
  c2.h2("2.3 Empirical Review");
  c2.p(
    `Surveys of ${topicOf(F[16])} report steady gains in weekly sales among traders who accept transfers.${c2.note(F[16])}`,
    `Work on ${topicOf(F[17])} records a similar pattern among traders who pay their suppliers by phone.${c2.note(F[17])}`,
    `Studies of ${topicOf(F[18])} show that network failures still push traders back to cash on busy days.${c2.note(F[18])}`,
  );
  c2.p(
    `Research on ${topicOf(F[19])} finds that women traders use wallets to keep trading income apart from household money.${c2.note(F[19])}`,
    `Studies of ${topicOf(F[20])} confirm the model's fit among African retailers while noting its silence on custom.${c2.note(F[20])}`,
    `Taken together, the empirical work describes a market in which new habits sit beside old ones.`,
  );
  c2.h2("2.4 Summary and Transition to the Thematic Chapters");
  c2.p(
    `The adoption literature explains who uses mobile money and why, but says little about what the change means to the people who trade.`,
    `The cultural literature describes those meanings but seldom measures how far the change has gone.`,
    `The two thematic discussions that follow take up the meaning of money and the making of trust in turn.`,
  );
  c2.endPart();

  // ── Chapter Three (a short form and an "Ibid.") ────────────────────────────
  const c3 = new Chapter("THREE", E_THEMATIC.chapter3.toUpperCase());
  c3.h2("3.1 Cash as Working Money");
  c3.p(
    `Market women in Ibadan and Lagos kept credit with regular customers through the daily passing of notes.${c3.note(X[0])}`,
    `Traders in three Lagos markets came to treat cash as working money and the wallet as a place to save.${c3.note(X[1])}`,
    `The distinction between the two kinds of money shapes how quickly each is spent.`,
  );
  c3.p(
    `The daily visit that cash required also carried the credit relation, so its decline weakened that relation.${c3.note(X[0], "short")}`,
    `Agents have taken over part of the role once played by the thrift collector.${c3.note(X[2])}`,
    `These shifts move the market's memory of who owes whom from the visit to the phone.`,
  );
  c3.h2("3.2 The Phone as a Store of Money");
  c3.p(
    `Bargaining survived the arrival of transfers, though the final price now tends toward figures that are easy to type.${c3.note(X[3])}`,
    `Women traders paid by wallet report more control over their trading income.${c3.note(X[4])}`,
    `The same reports describe trading money that no longer passes through the household first.${c3.note(X[4], "ibid")}`,
  );
  c3.endPart();
  c3.h2("3.3 Money, Meaning and the Market Day");
  c3.p(
    `A failed or delayed transfer is the most frequent cause of dispute between traders and customers.${c3.note(X[5])}`,
    `Savings groups have moved their contributions to wallets slowly, because members value the collector's visit as proof of payment.${c3.note(X[6])}`,
    `The cashless policy raised transfer use, yet traders kept cash for purchases from suppliers outside the city.${c3.note(X[7])}`,
  );
  c3.p(
    `Market associations now set rules for transfers and enforce them through the market's own officers.${c3.note(X[8])}`,
    `These rules turn a private payment into a public custom with its own sanctions.`,
    `The meaning of money in the market is thus being written anew by the traders themselves.`,
  );
  c3.endPart();

  // ── Chapter Four (its second part restarts at 1) ───────────────────────────
  const c4 = new Chapter("FOUR", E_THEMATIC.chapter4.toUpperCase());
  c4.h2("4.1 Trust in the Agent");
  c4.p(
    `Studies of ${topicOf(F[21])} find that traders trust an agent they know by name more than a known brand.${c4.note(F[21])}`,
    `Work on ${topicOf(F[22])} shows that trust grows with the number of successful transfers a trader has made.${c4.note(F[22])}`,
    `Research on ${topicOf(F[23])} ties that trust to the agent's standing in the market association.${c4.note(F[23])}`,
  );
  c4.p(
    `Surveys of ${topicOf(F[24])} report that traders who trust their agent adopt transfers sooner.${c4.note(F[24])}`,
    `Studies of ${topicOf(F[25])} add that trust erodes quickly after a single failed transfer.${c4.note(F[25])}`,
    `Trust in the agent is therefore earned transfer by transfer.`,
  );
  c4.endPart(true);
  c4.h2("4.2 The Alert as Proof");
  c4.p(
    `Work on ${topicOf(F[26])} describes the bank alert as the moment a sale is complete.${c4.note(F[26])}`,
    `Research on ${topicOf(F[27])} finds that goods are released only once the alert arrives.${c4.note(F[27])}`,
    `The alert has become a new custom of proof that both sides accept.`,
  );
  c4.h2("4.3 New Customs of the Market");
  c4.p(
    `Studies of ${topicOf(F[28])} show that fake alerts are the fraud traders fear most.${c4.note(F[28])}`,
    `Work on ${topicOf(F[29])} finds that checking the balance before releasing goods is now routine.${c4.note(F[29])}`,
    `These practices form a code of trust that the market teaches its newcomers.`,
  );
  c4.endPart();

  // ── Chapter Five (only works already cited: no new source) ─────────────────
  const c5 = new Chapter("FIVE", "CONCLUSION AND RECOMMENDATIONS");
  c5.h2("5.1 Conclusion");
  c5.p(
    `Mobile money has changed the customs of buying and selling in Lagos markets, moving the market's memory from the visit to the phone.${c5.note(F[0])}`,
    `Traders attach different meanings to cash and to phone money, treating the one as working money and the other as savings.${c5.note(X[1])}`,
    `Trust between traders, customers and agents is now made transfer by transfer and kept through new customs of proof.${c5.note(F[21])}`,
  );
  c5.h2("5.2 Recommendations");
  c5.p(
    "Market associations should write their transfer rules down so that new traders learn them quickly.",
    "Regulators should weigh the customs of the market when they judge rules on agent fees.",
    "Agents should be trained in handling failed transfers, since a single failure costs them the trust of a trader.",
  );
  c5.h2("5.3 Suggestions for Further Study");
  c5.p(
    "Later work could follow a small group of traders over several years to see how the meaning of money changes with habit.",
    "Studies in markets outside Lagos would show whether these customs travel.",
    "The place of older traders, who keep cash longest, deserves a study of its own.",
  );
  c5.endPart();

  return [c1, c2, c3, c4, c5].map((c, i) => ({ number: i + 1, text: c.text() }));
}
