/**
 * Copy that appears inside the paper mock-ups.
 *
 * These are decorative surfaces, but they are set with real prose rather than
 * grey bars: a reader who leans in should find an actual project page, because
 * blank rectangles read as an unfinished wireframe. Everything here is generic
 * academic boilerplate — no real student, supervisor or institution.
 */

export type Block =
  | { kind: "chapter"; label: string; title: string }
  | { kind: "heading"; text: string }
  | { kind: "prose"; text: string }
  | { kind: "figure"; caption: string; bars: number[] }
  | { kind: "reference"; author: string; rest: string }
  | { kind: "rule" };

/** The reviewed chapter — the sheet in the reading plane. */
export const REVIEW_SHEET: Block[] = [
  { kind: "chapter", label: "Chapter One", title: "Introduction" },
  { kind: "heading", text: "1.1 Background of the Study" },
  {
    kind: "prose",
    text: "Access to potable water remains a defining constraint on public health outcomes across much of sub-Saharan Africa. Existing treatment infrastructure is concentrated in urban centres, leaving rural communities dependent on untreated surface sources.",
  },
  { kind: "heading", text: "1.2 Statement of the Problem" },
  {
    kind: "prose",
    text: "Conventional purification systems assume a stable grid connection. Where supply is intermittent, throughput falls below the threshold required to serve a settlement of even moderate size.",
  },
  { kind: "rule" },
  { kind: "chapter", label: "Chapter Three", title: "Research Methodology" },
  { kind: "heading", text: "3.1 Research Design" },
  {
    kind: "prose",
    text: "This study adopts a quasi-experimental design. A prototype unit was fabricated and evaluated against a control across four sampling periods, with turbidity and coliform count recorded at each interval.",
  },
  {
    kind: "figure",
    caption: "Fig. 3.2 — Sample distribution by settlement",
    bars: [42, 66, 53, 87, 71, 94],
  },
  { kind: "heading", text: "3.2 Population and Sampling" },
  {
    kind: "prose",
    text: "A stratified random sample of 240 households was drawn across six settlements. Stratification was applied by distance to the nearest improved source.",
  },
  { kind: "rule" },
  { kind: "heading", text: "References" },
  {
    kind: "reference",
    author: "Adeyemi, K. O. (2023).",
    rest: "Solar desalination in arid regions. Journal of Applied Engineering, 18(2), 44–61.",
  },
  {
    kind: "reference",
    author: "Okonkwo, C. (2021).",
    rest: "Membrane filtration efficiency under variable load. Water Resources Review, 9(4), 210–228.",
  },
  {
    kind: "reference",
    author: "Bello, A. & Ige, T. (2024).",
    rest: "Photovoltaic water systems for rural deployment. Renewable Systems, 12(1), 88–104.",
  },
];

/** The references sheet, upper right. */
export const REFERENCE_SHEET: Block[] = [
  { kind: "heading", text: "References" },
  {
    kind: "reference",
    author: "Adeyemi, K. O. (2023).",
    rest: "Solar desalination in arid regions.",
  },
  {
    kind: "reference",
    author: "Bello, A. & Ige, T. (2024).",
    rest: "Photovoltaic water systems for rural deployment.",
  },
  {
    kind: "reference",
    author: "Chukwu, N. (2022).",
    rest: "Turbidity thresholds in community supply.",
  },
  {
    kind: "reference",
    author: "Danjuma, S. (2020).",
    rest: "Appropriate technology and maintenance burden.",
  },
  {
    kind: "reference",
    author: "Eze, M. & Lawal, R. (2023).",
    rest: "Coliform reduction in low-pressure systems.",
  },
  {
    kind: "reference",
    author: "Okonkwo, C. (2021).",
    rest: "Membrane filtration efficiency under variable load.",
  },
];

/** The analysis sheet, upper left. */
export const ANALYSIS_SHEET: Block[] = [
  { kind: "chapter", label: "Chapter Four", title: "Data Analysis" },
  { kind: "heading", text: "4.1 Data Presentation" },
  {
    kind: "prose",
    text: "Of 240 questionnaires distributed, 228 were returned and validated, representing a 95% response rate.",
  },
  {
    kind: "figure",
    caption: "Fig. 4.1 — Purification yield by cycle",
    bars: [42, 66, 53, 87, 71, 94],
  },
  { kind: "heading", text: "4.2 Discussion of Findings" },
  {
    kind: "prose",
    text: "Mean turbidity fell from 38.4 NTU to 2.1 NTU across the treatment cycle, a reduction significant at p < 0.01.",
  },
];

/* ── Quality-control chapter slider ──────────────────────────
   The five chapters a project report is actually built from.
   Each is a page the reviewer works through in turn. */

export interface ChapterPage {
  id: string;
  /** "Chapter One" — set at display scale on the sheet. */
  label: string;
  /** "Introduction" — the running head beneath it. */
  title: string;
  /** Page number printed in the footer. */
  folio: string;
  blocks: Block[];
}

export const CHAPTERS: ChapterPage[] = [
  {
    id: "ch1",
    label: "Chapter One",
    title: "Introduction",
    folio: "1",
    blocks: [
      { kind: "heading", text: "1.1 Background of the Study" },
      {
        kind: "prose",
        text: "Access to potable water remains a defining constraint on public health outcomes across much of sub-Saharan Africa. Treatment infrastructure is concentrated in urban centres, leaving rural settlements dependent on untreated surface sources.",
      },
      { kind: "heading", text: "1.2 Statement of the Problem" },
      {
        kind: "prose",
        text: "Conventional purification assumes a stable grid connection. Where supply is intermittent, throughput falls below the level required to serve a settlement of even moderate size.",
      },
      { kind: "heading", text: "1.3 Objectives of the Study" },
      {
        kind: "prose",
        text: "To design a solar-powered purification unit suitable for off-grid deployment, fabricate a working prototype, and evaluate its output against established potability thresholds.",
      },
      { kind: "heading", text: "1.4 Scope of the Study" },
      {
        kind: "prose",
        text: "The study is limited to six rural settlements within the state, sampled across a single dry season.",
      },
    ],
  },
  {
    id: "ch2",
    label: "Chapter Two",
    title: "Literature Review",
    folio: "14",
    blocks: [
      { kind: "heading", text: "2.1 Theoretical Framework" },
      {
        kind: "prose",
        text: "The study is anchored on the Appropriate Technology framework, which holds that a technology is viable only where it can be maintained by the community that depends on it.",
      },
      { kind: "heading", text: "2.2 Conceptual Framework" },
      {
        kind: "prose",
        text: "Purification efficiency is treated as the dependent variable, with irradiance, source turbidity and membrane condition as the principal independent variables.",
      },
      { kind: "heading", text: "2.3 Empirical Review" },
      {
        kind: "prose",
        text: "Adeyemi (2023) reported a 92% reduction in coliform count under continuous irradiance. Okonkwo (2021) found efficiency fell sharply once inlet turbidity exceeded 40 NTU.",
      },
      { kind: "heading", text: "2.4 Gap in the Literature" },
      {
        kind: "prose",
        text: "Existing work assumes uninterrupted daylight. No reviewed study evaluates performance across a full harmattan cycle.",
      },
    ],
  },
  {
    id: "ch3",
    label: "Chapter Three",
    title: "Research Methodology",
    folio: "38",
    blocks: [
      { kind: "heading", text: "3.1 Research Design" },
      {
        kind: "prose",
        text: "A quasi-experimental design was adopted. A prototype unit was fabricated and evaluated against a control across four sampling periods.",
      },
      { kind: "heading", text: "3.2 Population and Sampling" },
      {
        kind: "prose",
        text: "A stratified random sample of 240 households was drawn across six settlements, stratified by distance to the nearest improved source.",
      },
      {
        kind: "figure",
        caption: "Fig. 3.2 — Sample distribution by settlement",
        bars: [42, 66, 53, 87, 71, 94],
      },
      { kind: "heading", text: "3.3 Method of Data Collection" },
      {
        kind: "prose",
        text: "Water samples were drawn at inlet and outlet at four-hour intervals. Turbidity was measured on a calibrated nephelometer.",
      },
    ],
  },
  {
    id: "ch4",
    label: "Chapter Four",
    title: "Data Analysis",
    folio: "57",
    blocks: [
      { kind: "heading", text: "4.1 Data Presentation" },
      {
        kind: "prose",
        text: "Of 240 questionnaires distributed, 228 were returned and validated, representing a 95% response rate.",
      },
      {
        kind: "figure",
        caption: "Fig. 4.1 — Purification yield by cycle",
        bars: [38, 61, 72, 80, 88, 96],
      },
      { kind: "heading", text: "4.2 Analysis of Research Questions" },
      {
        kind: "prose",
        text: "Mean turbidity fell from 38.4 NTU at inlet to 2.1 NTU at outlet, a reduction significant at p < 0.01 on a paired-sample t-test.",
      },
      { kind: "heading", text: "4.3 Discussion of Findings" },
      {
        kind: "prose",
        text: "The prototype met potability thresholds in every period except the fourth, where reduced irradiance depressed throughput by an estimated 23%.",
      },
    ],
  },
  {
    id: "ch5",
    label: "Chapter Five",
    title: "Summary & Conclusion",
    folio: "82",
    blocks: [
      { kind: "heading", text: "5.1 Summary of Findings" },
      {
        kind: "prose",
        text: "The unit reduced turbidity and coliform count below national thresholds under normal irradiance, and remained serviceable using locally available parts.",
      },
      { kind: "heading", text: "5.2 Conclusion" },
      {
        kind: "prose",
        text: "Solar-powered purification is technically viable at settlement scale, provided storage is sized against the lowest-irradiance period rather than the mean.",
      },
      { kind: "heading", text: "5.3 Recommendations" },
      {
        kind: "prose",
        text: "Deployments should size storage for harmattan conditions, and a maintenance schedule should be agreed with the community before installation.",
      },
      { kind: "rule" },
      { kind: "heading", text: "References" },
      {
        kind: "reference",
        author: "Adeyemi, K. O. (2023).",
        rest: "Solar desalination in arid regions. Journal of Applied Engineering, 18(2), 44–61.",
      },
      {
        kind: "reference",
        author: "Okonkwo, C. (2021).",
        rest: "Membrane filtration efficiency under variable load. Water Resources Review, 9(4), 210–228.",
      },
    ],
  },
];
