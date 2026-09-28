/**
 * A structurally complete Business (Mode 2, APA) report for the quality gate's
 * checks (npm run check:quality) and its live test: five chapters written to
 * the chapter prompts' BUSINESS section lists, the three approved objectives,
 * research questions and hypotheses answered in Chapter Four, 36 verified
 * references cited, one table per results chapter, a figure, the Yamane
 * sample-size equation with its symbols defined, and Davis (1989) cited
 * without being on the verified list (the known-citation WARN).
 */

import { countWords } from "../../src/lib/generation/chapter-plan";

export const FIXTURE_TITLE = "Mobile Money Adoption and the Performance of Market Traders in Lagos State";

export const FIXTURE_OBJECTIVES = [
  "To examine the effect of mobile money adoption on the daily sales of market traders in Lagos State.",
  "To assess the influence of transaction fees on the continued use of mobile money among market traders in Lagos State.",
  "To determine the relationship between trust in agents and the adoption of mobile money among market traders in Lagos State.",
];

const SURNAMES = [
  "Okafor", "Adeyemi", "Musa", "Bello", "Eze", "Ibrahim", "Lawal", "Nwosu", "Ogunleye", "Abubakar", "Chukwu", "Danjuma",
  "Etim", "Fashola", "Garba", "Hassan", "Ikenna", "Johnson", "Kalu", "Lawson", "Mohammed", "Nnamdi", "Obi", "Popoola",
  "Quadri", "Raji", "Salami", "Tijani", "Uche", "Vincent", "Williams", "Yusuf", "Zakari", "Akande", "Balogun", "Coker",
];
const TOPICS = [
  "mobile wallet use among urban traders", "transaction fees and payment choice", "agent trust in digital finance", "sales growth after mobile money adoption",
  "financial inclusion in Lagos markets", "cash handling costs in informal trade", "network reliability and payment adoption", "women traders and mobile wallets",
  "the technology acceptance model in African retail", "perceived risk in mobile payments", "micro-enterprise performance and fintech", "agent banking density and usage",
];

export interface FixtureReference {
  id: string;
  title: string;
  proposedTitle: string;
  authors: string;
  year: number;
  journal: string;
  doi: string;
  abstract: string;
  classification: "CORE" | "CLOSELY_RELATED";
}

/** What the first nine references report, so the claims the chapters cite them for are ones their abstracts support. */
const FINDINGS: Record<number, string> = {
  0: "Mobile money changed how traders in Lagos markets receive payment from customers, and the first stage of adoption was receiving transfers from regular customers; the review drew on work from Nigeria and other African markets.",
  1: "About 42% of traders surveyed in Balogun and Mile 12 markets used a phone wallet in 2022, defined as the regular use of a wallet to receive or send payment.",
  2: "Adoption was uneven across market groups, and it deepened once traders began paying suppliers by wallet as well as receiving transfers.",
  3: "Transaction fees and trust in agents explained most of the gap in adoption, and the Technology Acceptance Model fitted mobile payment use in Kenya and Nigeria.",
  4: "Many traders in Lagos still refused transfers from customers; a cross-sectional survey measured adoption, fees, trust and sales at one point in time.",
  5: "Regulators could use market-level evidence to judge whether caps on agent fees would widen adoption.",
  6: "Adoption raised the daily sales of market traders in Kenyan markets.",
  7: "High transaction fees reduced the continued use of mobile money among traders in Ghanaian markets.",
  8: "Trust in agents was positively related to the adoption of mobile money, as the agent-banking literature reports.",
};

export const FIXTURE_REFERENCES: FixtureReference[] = SURNAMES.map((s, i) => {
  const topic = TOPICS[i % TOPICS.length];
  const title = `${topic.charAt(0).toUpperCase()}${topic.slice(1)}: evidence from Nigeria`;
  return {
    id: `ref-${i + 1}`,
    title,
    proposedTitle: title,
    authors: `${s}, A.; ${SURNAMES[(i + 7) % SURNAMES.length]}, B.`,
    year: 2015 + (i % 9),
    journal: ["Journal of African Business", "African Journal of Economic Review", "Journal of Retailing and Consumer Services"][i % 3],
    doi: `10.5555/fixture.${i + 1}`,
    abstract: `This study examined ${topic} among small traders using survey data from ${120 + i * 7} traders. It found that ${topic} was linked to higher weekly sales among the traders surveyed.${FINDINGS[i] ? ` ${FINDINGS[i]}` : ""}`,
    classification: i % 4 === 0 ? "CLOSELY_RELATED" : "CORE",
  };
});

/** "(Okafor & Johnson, 2015)" for reference i. */
export function cite(i: number): string {
  const r = FIXTURE_REFERENCES[i];
  return `(${r.authors.split(";")[0].split(",")[0]} & ${r.authors.split(";")[1].trim().split(",")[0]}, ${r.year})`;
}

const P = (...sentences: string[]) => sentences.join(" ");

function chapter1(): string {
  return [
    "[H1] CHAPTER ONE",
    "[H1] INTRODUCTION",
    "[H2] 1.1 Background to the Study",
    P(
      `Mobile money has changed how market traders in Lagos State receive payment from customers ${cite(0)}.`,
      "Traders who once handled only cash now accept transfers through agents and phone wallets.",
      `Survey evidence from Balogun and Mile 12 markets shows that about 42% of traders used a wallet in 2022 ${cite(1)}.`,
      "The shift matters because cash handling exposes small traders to theft and counting errors.",
      "It also changes how traders keep records of their daily sales.",
    ),
    "",
    P(
      `Adoption has not been even across market groups ${cite(2)}.`,
      "Traders in food markets adopted wallets faster than traders in textile markets.",
      `Transaction fees and trust in agents appear in most accounts of this gap ${cite(3)}.`,
      "This study examines those factors for traders in Lagos State.",
    ),
    "",
    "[H2] 1.2 Statement of the Problem",
    P(
      `Although wallet use has grown, many traders in Lagos State still refuse transfers from customers ${cite(4)}.`,
      "Refusal costs sales when customers carry little cash.",
      "Earlier studies measured adoption in banks rather than in open markets.",
      "Little is known about how fees and trust in agents shape continued use among market traders.",
      "This study addresses that gap for three markets in Lagos State.",
    ),
    "",
    "[H2] 1.3 Research Questions",
    "The study answers the following questions:",
    "i. What is the effect of mobile money adoption on the daily sales of market traders in Lagos State?",
    "ii. How do transaction fees influence the continued use of mobile money among market traders in Lagos State?",
    "iii. What is the relationship between trust in agents and the adoption of mobile money among market traders in Lagos State?",
    "",
    "[H2] 1.4 Objectives of the Study",
    "The specific objectives of the study are:",
    ...FIXTURE_OBJECTIVES.map((o, i) => `${["i", "ii", "iii"][i]}. ${o}`),
    "",
    "[H2] 1.5 Research Hypotheses",
    "H01: Mobile money adoption has no significant effect on the daily sales of market traders in Lagos State.",
    "",
    "H02: Transaction fees have no significant influence on the continued use of mobile money among market traders in Lagos State.",
    "",
    "[H2] 1.6 Significance of the Study",
    P(
      "The findings give market associations evidence for negotiating agent fees.",
      `Regulators can use the results to judge whether fee caps would widen adoption ${cite(5)}.`,
      "Traders gain a clearer picture of the sales effect of accepting transfers.",
      "Future researchers gain a market-level baseline for Lagos State.",
    ),
    "",
    "[H2] 1.7 Scope of the Study",
    P(
      "The study covers traders in Balogun, Mile 12 and Oyingbo markets in Lagos State.",
      "It examines adoption, transaction fees, trust in agents and daily sales.",
      "Data were collected from 200 traders between March and May 2026.",
      "Traders outside these three markets are not covered.",
    ),
    "",
    "[H2] 1.8 Operational Definition of Terms",
    P(
      "Mobile money adoption means receiving customer payments through a phone wallet at least once a week.",
      "Daily sales means the naira value of goods sold in one trading day.",
      "Transaction fees means the charges agents and wallet providers deduct from each transfer.",
      "Trust in agents means a trader's confidence that an agent will complete a cash-out correctly.",
    ),
  ].join("\n");
}

function chapter2(): string {
  const empirical: string[] = [];
  for (let i = 6; i < 36; i += 5) {
    const refs = [i, i + 1, i + 2, i + 3, i + 4].filter((k) => k < 36);
    empirical.push(
      P(
        ...refs.map(
          (k, j) =>
            `${["A survey of", "A study of", "Panel data on", "Interviews with", "A census of"][j]} ${120 + k * 7} traders linked ${TOPICS[k % TOPICS.length]} to higher weekly sales ${cite(k)}.`,
        ),
        "These studies agree that fees and trust shape continued use, but none measured daily sales in open markets.",
      ),
      "",
    );
  }
  return [
    "[H1] CHAPTER TWO",
    "[H1] LITERATURE REVIEW",
    "[H2] 2.1 Introduction",
    P(
      "This review sets out the concepts, theory and earlier studies behind the study.",
      `It draws on work from Nigeria and other African markets ${cite(0)}.`,
      "Each study is reviewed for what it did, how it did it and what it found.",
      "The gap the study fills closes the review.",
    ),
    "",
    "[H2] 2.2 Conceptual Review",
    "[H3] 2.2.1 Mobile money adoption",
    P(
      `Mobile money adoption is the regular use of a phone wallet to receive or send payment ${cite(1)}.`,
      "Among traders it usually starts with receiving transfers from customers.",
      `Adoption deepens when traders begin paying suppliers the same way ${cite(2)}.`,
      `Okafor et al. (${FIXTURE_REFERENCES[0].year}) describe the first stage as receiving transfers from regular customers.`,
      "Figure 2.1 presents the relationship between the study variables.",
    ),
    "",
    "[FIGURE PLACEHOLDER: conceptual framework linking fees, trust, adoption and sales]",
    "Figure 2.1: Conceptual framework of the study (Researcher, 2026)",
    "",
    "[H2] 2.3 Theoretical Framework",
    P(
      "The Technology Acceptance Model explains adoption through perceived usefulness and perceived ease of use (Davis, 1989).",
      "Traders adopt a wallet when it saves time and is easy to operate.",
      `The model has been applied to mobile payments in Kenya and Nigeria ${cite(3)}.`,
      "It suits this study because fees and trust shape perceived usefulness.",
    ),
    "",
    "[H2] 2.4 Empirical Review",
    ...empirical,
    "Table 2.1 summarises the studies reviewed by their focus.",
    "",
    "Table 2.1: Summary of Reviewed Studies",
    "| Author | Focus | Finding |",
    "|---|---|---|",
    `| ${FIXTURE_REFERENCES[6].authors.split(",")[0]} and ${FIXTURE_REFERENCES[6].authors.split(";")[1].trim().split(",")[0]} (${FIXTURE_REFERENCES[6].year}) | Wallet use | Sales rose |`,
    `| ${FIXTURE_REFERENCES[7].authors.split(",")[0]} and ${FIXTURE_REFERENCES[7].authors.split(";")[1].trim().split(",")[0]} (${FIXTURE_REFERENCES[7].year}) | Fees | Use fell with fees |`,
    "",
    "[H2] 2.5 Research Gap and Summary",
    P(
      "The studies reviewed measured adoption but rarely daily sales in open markets.",
      "None examined fees and trust together for traders in Lagos State.",
      "This study fills that gap with a survey of three markets.",
      "Chapter Three describes how the data were collected.",
    ),
  ].join("\n");
}

function chapter3(): string {
  return [
    "[H1] CHAPTER THREE",
    "[H1] RESEARCH METHODOLOGY",
    "[H2] 3.1 Research Design",
    P(
      "The study used a cross-sectional survey design.",
      `A survey suits the objectives because it measures adoption, fees, trust and sales at one point in time ${cite(4)}.`,
      "Questionnaires were administered in person in each market.",
      "The design allows the relationships in the hypotheses to be tested.",
    ),
    "",
    "[H2] 3.2 Population of the Study",
    P(
      "The population is the 400 registered traders in Balogun, Mile 12 and Oyingbo markets.",
      "The market associations supplied the registers used.",
      "Traders without a fixed stall were excluded.",
      "Table 3.1 shows the population by market.",
    ),
    "",
    "Table 3.1: Population and Sample by Market",
    "| Market | Population | Sample |",
    "|---|---|---|",
    "| Balogun | 180 | 90 |",
    "| Mile 12 | 120 | 60 |",
    "| Oyingbo | 100 | 50 |",
    "Source: Field Survey, 2026",
    "",
    "[H2] 3.3 Sample and Sampling Technique",
    P(
      "The sample size was computed with the Yamane (1967) formula, given as Equation 3.1.",
      "The formula suits a known finite population.",
      "Stratified random sampling then allocated the sample to each market in proportion to its population.",
    ),
    "",
    "[EQ] n = N / (1 + N(e²)) | 3.1 [/EQ]",
    "",
    "where n is the sample size, N is the population of 400 traders and e is the margin of error of 0.05, which gives a sample of 200 traders.",
    "",
    "[H2] 3.4 Data Collection Instrument",
    P(
      "A structured questionnaire of 24 items on a five-point Likert scale was used.",
      "Section A covered demographics and Section B the study variables.",
      "Items on trust were adapted from earlier Nigerian studies.",
      "The questionnaire took about fifteen minutes to complete.",
    ),
    "",
    "[H2] 3.5 Validity and Reliability of the Instrument",
    P(
      "Two lecturers in Business Administration checked the face and content validity of the instrument.",
      "A pilot test with 20 traders in Ikeja gave a Cronbach's alpha of 0.81.",
      "Items with low item-total correlation were revised.",
      "The final instrument met the 0.70 threshold on every scale.",
    ),
    "",
    "[H2] 3.6 Administration of Instrument",
    P(
      "Three trained assistants administered the questionnaire in the markets.",
      "Copies were collected on the spot to raise the return rate.",
      "All 200 copies were returned and usable.",
      "Participation was voluntary and anonymous.",
    ),
    "",
    "[H2] 3.7 Method of Data Analysis",
    P(
      "Data were analysed with SPSS version 26.",
      "Frequencies and percentages described the respondents.",
      "Means and standard deviations answered the research questions.",
      "Simple linear regression tested the hypotheses at the 0.05 level of significance.",
    ),
  ].join("\n");
}

function chapter4(): string {
  return [
    "[H1] CHAPTER FOUR",
    "[H1] DATA PRESENTATION, ANALYSIS AND DISCUSSION",
    "[H2] 4.1 Introduction",
    P(
      "This chapter presents the results of the survey of 200 traders.",
      "The demographic profile comes first, then the answers to the research questions.",
      "The hypotheses are tested next, and the findings are discussed last.",
    ),
    "",
    "[H2] 4.2 Socio-Demographic Profile of Respondents",
    P(
      "Table 4.1 shows that 58% of the respondents were women.",
      "Most respondents (64%) had traded for more than five years.",
      "Food traders made up 45% of the sample.",
      "The profile matches the population registers.",
    ),
    "",
    "Table 4.1: Socio-Demographic Profile of Respondents",
    "| Variable | Frequency | Percentage |",
    "|---|---|---|",
    "| Female | 116 | 58.0 |",
    "| Male | 84 | 42.0 |",
    "Source: Field Survey, 2026",
    "",
    "[H2] 4.3 Descriptive Statistics of Study Variables",
    P(
      "Adoption had a mean of 3.62 on the five-point scale.",
      "Transaction fees had a mean of 3.91, showing that traders found fees high.",
      "Trust in agents had a mean of 3.18.",
      "Daily sales had a mean of 3.47.",
    ),
    "",
    "[H2] 4.4 Reliability Test Results",
    P(
      "Cronbach's alpha was 0.84 for adoption, 0.79 for fees and 0.81 for trust.",
      "Every scale passed the 0.70 threshold.",
      "The instrument was therefore reliable for the main survey.",
    ),
    "",
    "[H2] 4.5 Analysis of Research Questions",
    "[H3] 4.5.1 Research question one",
    P(
      "Research Question One asked about the effect of mobile money adoption on daily sales.",
      "Traders who adopted wallets reported a mean sales score of 3.81 against 2.94 for non-adopters.",
      "Adoption is therefore linked with higher daily sales.",
    ),
    "",
    "[H3] 4.5.2 Research question two",
    P(
      "Research Question Two asked how transaction fees influence continued use.",
      "Traders who rated fees as high were less likely to keep using wallets, with a mean of 2.71.",
      "Fees therefore reduce continued use.",
    ),
    "",
    "[H3] 4.5.3 Research question three",
    P(
      "Research Question Three asked about the relationship between trust in agents and adoption.",
      "Trust correlated with adoption at r = 0.46.",
      "Traders who trust agents adopt wallets more often.",
    ),
    "",
    "[H2] 4.6 Hypotheses Testing",
    P(
      "Hypothesis One (H01) was rejected because adoption had a significant effect on daily sales (β = 0.41, p = 0.001).",
      "Hypothesis Two (H02) was rejected because fees had a significant negative influence on continued use (β = -0.33, p = 0.004).",
      "Both relationships held after controlling for years in trade.",
    ),
    "",
    "[H2] 4.7 Discussion of Findings",
    P(
      `The effect of mobile money adoption on daily sales agrees with evidence from Kenyan markets ${cite(6)}.`,
      `The influence of transaction fees on continued use matches the Ghanaian findings ${cite(7)}.`,
      `The relationship between trust in agents and adoption supports the agent-banking literature ${cite(8)}.`,
      "Together the findings answer all three objectives.",
    ),
    "",
    "[H2] 4.8 Summary",
    "The results show that adoption raises sales, fees reduce continued use and trust raises adoption.",
  ].join("\n");
}

function chapter5(): string {
  return [
    "[H1] CHAPTER FIVE",
    "[H1] SUMMARY, CONCLUSION AND RECOMMENDATIONS",
    "[H2] 5.1 Introduction",
    "This chapter summarises the findings, draws conclusions and makes recommendations.",
    "",
    "[H2] 5.2 Summary of Findings",
    P(
      "Objective one was achieved: adoption raised daily sales.",
      "Objective two was achieved: high transaction fees reduced continued use.",
      "Objective three was achieved: trust in agents was positively related to adoption.",
      `These findings agree with the reviewed studies ${cite(6)}.`,
    ),
    "",
    "[H2] 5.3 Conclusion",
    P(
      "Mobile money adoption improves the daily sales of market traders in Lagos State.",
      "Its spread is held back by fees and by weak trust in agents.",
      "Lower fees and more reliable agents would widen adoption in the three markets.",
    ),
    "",
    "[H2] 5.4 Recommendations",
    P(
      "Market associations should negotiate a flat agent fee below ₦50 per transfer.",
      "Wallet providers should publish agent ratings in each market.",
      "Traders should keep wallet records alongside their sales books.",
    ),
    "",
    "[H2] 5.5 Limitations of the Study",
    P(
      "The study covered three markets, so its results may not hold for smaller markets.",
      "Sales were self-reported and may carry recall error.",
      "The cross-sectional design cannot show change over time.",
    ),
    "",
    "[H2] 5.6 Suggestions for Further Study",
    P(
      "Further studies should follow the same traders over a year.",
      "Studies in Abuja and Kano markets would test whether the findings travel.",
      "Recorded sales data would remove the recall error in self-reports.",
    ),
  ].join("\n");
}

export interface FixtureChapter {
  number: number;
  text: string;
  plan: { targetWords: number; sections: { number: string; heading: string }[] };
}

/** The five chapters, each with a plan whose target is its own length (so ST11 balances). */
export function fixtureChapters(): FixtureChapter[] {
  return [chapter1(), chapter2(), chapter3(), chapter4(), chapter5()].map((text, i) => ({
    number: i + 1,
    text,
    plan: {
      targetWords: countWords(text),
      sections: [...text.matchAll(/^\[H2\] (\d+\.\d+) (.+)$/gm)].map((m) => ({ number: m[1], heading: m[2] })),
    },
  }));
}
