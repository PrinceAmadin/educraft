/**
 * The Stage-1 screening question bank, as content for the founder to read and
 * edit in one place — the same principle as `SCREENING_TEXT` in
 * `src/lib/screening/rules.ts`, which holds every sentence a candidate reads.
 *
 * Seeded by `npm run screening:seed-bank` (dry run) / `-- --apply`. Once a row
 * exists, Settings > Screening is the place to change it; editing this file
 * afterwards changes nothing already seeded.
 *
 * The sources in the relevance items are CONSTRUCTED for the test, not real
 * publications. A candidate is never told they are real, nothing is published
 * anywhere, and the task is a judgement exercise rather than a lookup — but
 * that is why every item carries the note below.
 *
 * `source` on an Eye item is an internal label (department and chapter); it is
 * not shown to the candidate. Keep it that way: a label naming who wrote the
 * paragraph would hand over the answer.
 */

import type { RelevanceLabel } from "@/lib/screening/rules";

export interface EyeSeed {
  /** Stable key for idempotence; stored in `notes`. */
  key: string;
  text: string;
  /** Internal context label — never rendered to the candidate. */
  source: string;
  isAI: boolean;
  difficulty: "easy" | "medium" | "hard";
}

export interface RelevanceSeed {
  key: string;
  topic: string;
  sources: { title: string; authors: string; year: number; journal: string; abstract: string }[];
  labels: RelevanceLabel[];
}

export interface RewriteSeed {
  key: string;
  text: string;
  note: string;
}

// ── Part 1 — Spot the AI ─────────────────────────────────────────────────────
// Ten written by AI, ten by a person, across departments and difficulties. A
// sitting draws twelve, so the mix a candidate sees differs each time. The hard
// human ones (flat method prose, eloquent prose) are there on purpose: a
// candidate who calls everything polished "AI" should lose marks for it.

export const EYE_ITEMS: EyeSeed[] = [
  {
    key: "eye-ai-01",
    source: "Chapter One — Business Administration",
    isAI: true,
    difficulty: "easy",
    text:
      "In today's rapidly evolving digital landscape, mobile money has emerged as a transformative force within the Nigerian economy. It plays a crucial role in bridging the gap between the banked and the unbanked, offering unprecedented convenience to millions of users across the country. Moreover, these cutting-edge platforms have fundamentally reshaped the way small businesses handle their daily transactions. The adoption of this technology is not merely a passing trend but a profound shift in financial behaviour. This underscores the importance of understanding its impact on enterprise performance.",
  },
  {
    key: "eye-ai-02",
    source: "Chapter Two — Management",
    isAI: true,
    difficulty: "medium",
    text:
      "Several studies have examined the relationship between employee motivation and organisational productivity in developing economies. Researchers have generally agreed that motivated employees contribute significantly to the overall performance of their organisations. The literature further suggests that both financial and non-financial incentives have important roles to play in this regard. However, a notable gap remains in the literature concerning the Nigerian manufacturing sector in particular.",
  },
  {
    key: "eye-ai-03",
    source: "Chapter Two — Education",
    isAI: true,
    difficulty: "easy",
    text:
      "This section will discuss the theoretical framework upon which the present study is anchored. It will begin by examining the Technology Acceptance Model before proceeding to consider the Diffusion of Innovation Theory. Thereafter, the section will explain how these two theories relate to the variables under investigation, and a justification for the choice of framework will be provided. The discussion is organised in this manner to ensure clarity and coherence throughout.",
  },
  {
    key: "eye-ai-04",
    source: "Chapter Two — Urban and Regional Planning",
    isAI: true,
    difficulty: "hard",
    text:
      "Effective waste management in urban centres requires the coordinated involvement of government agencies, private operators and residents themselves. Each of these stakeholders brings distinct resources, incentives and constraints to the process. Where coordination is weak, the result is inefficiency, duplication of effort and a loss of public confidence. Conversely, where responsibilities are clearly assigned and monitored, collection rates improve and costs fall. Achieving this balance remains one of the central challenges facing municipal authorities today.",
  },
  {
    key: "eye-ai-05",
    source: "Chapter Three — Social Sciences",
    isAI: true,
    difficulty: "easy",
    text:
      "It is important to note that the sample size employed in a study has a direct bearing on the reliability of its findings. A larger sample generally reduces sampling error and increases the confidence with which the results may be generalised to the wider population. Furthermore, the sampling technique adopted determines whether every member of that population has an equal chance of being selected. Additionally, researchers must weigh the benefits of a large sample against the practical constraints of time and cost.",
  },
  {
    key: "eye-ai-06",
    source: "Chapter Five — Economics",
    isAI: true,
    difficulty: "hard",
    text:
      "The findings of this study are broadly consistent with those reported in earlier research on the subject. The positive relationship observed between the variables aligns with theoretical expectations and with the bulk of the empirical evidence. Where differences emerged, they may be attributable to contextual factors peculiar to the study area, and such variation is not uncommon in work of this nature. Further research would be required to establish the precise mechanisms involved.",
  },
  {
    key: "eye-ai-07",
    source: "Chapter One — Electrical Engineering",
    isAI: true,
    difficulty: "medium",
    text:
      "The introduction of solar mini-grids represents a game-changing development for rural electrification across sub-Saharan Africa. These systems not only reduce dependence on fossil fuels but also provide a reliable source of power to communities long neglected by the national grid. State-of-the-art battery technology has made such installations increasingly viable, even in the most remote locations. The potential benefits span economic, social and environmental dimensions alike.",
  },
  {
    key: "eye-ai-08",
    source: "Chapter Two — Human Resource Management",
    isAI: true,
    difficulty: "hard",
    text:
      "Job satisfaction has been defined in various ways by different scholars over the years. In general terms it refers to the degree to which an employee feels contented with his or her work and work environment. It encompasses a range of dimensions, including pay, supervision, promotion opportunities, co-worker relations and the nature of the work itself. A satisfied employee is more likely to remain with the organisation and to perform at a high level. Consequently, job satisfaction has attracted considerable attention in the management literature.",
  },
  {
    key: "eye-ai-09",
    source: "Chapter Five — Accounting",
    isAI: true,
    difficulty: "medium",
    text:
      "In conclusion, the study has demonstrated that the variables examined are significantly related to one another. The results provide valuable insights for policymakers, practitioners and academics alike. It is hoped that the recommendations offered will contribute meaningfully to improved practice within the sector. Nevertheless, the study makes a worthwhile contribution to the existing body of knowledge.",
  },
  {
    key: "eye-ai-10",
    source: "Chapter Three — Mass Communication",
    isAI: true,
    difficulty: "hard",
    text:
      "A descriptive survey design was adopted for this study because it permits the collection of data from a large population at a single point in time. The design is widely used in social science research and is considered appropriate where the researcher seeks to describe existing conditions without manipulating any variable. It allows for the use of questionnaires, which are cost-effective and relatively easy to administer, and it facilitates the statistical analysis of responses. For these reasons the design was deemed most suitable for the present study.",
  },

  {
    key: "eye-human-01",
    source: "Chapter Four — Business Administration",
    isAI: false,
    difficulty: "easy",
    text:
      "Of the 362 questionnaires distributed across the five markets, 329 were returned and 311 were usable; eighteen were discarded because more than three items had been left blank. The response rate of 85.9 per cent is higher than Okoro (2019) obtained in a comparable study in Onitsha, most likely because the research assistants waited while traders filled the forms rather than collecting them the following day. Traders at Oyingbo were the hardest to reach. Several declined outright, saying they had already been interviewed twice that year.",
  },
  {
    key: "eye-human-02",
    source: "Chapter Four — Mechanical Engineering",
    isAI: false,
    difficulty: "easy",
    text:
      "The pump failed twice during the second week of testing. On both occasions the impeller had seized, and on stripping it down we found fine sand in the housing. The intake filter supplied with the unit is rated at 200 microns, which is plainly too coarse for the borehole water at this site, so a 50-micron filter was fitted before the remaining runs. The readings from the first week have been excluded for that reason, and the sample is therefore eleven days rather than eighteen.",
  },
  {
    key: "eye-human-03",
    source: "Chapter Four — Nursing Science",
    isAI: false,
    difficulty: "medium",
    text:
      "Compliance was highest immediately after contact with body fluids and lowest before touching a patient. This pattern, which Olaniyi and Abdullahi (2021) also reported at Ibadan, suggests that nurses on the ward treat hand washing as protection for themselves rather than for the patient. Two of the four hand-rub dispensers on the male medical ward were empty throughout the observation period, which has to be weighed in the interpretation.",
  },
  {
    key: "eye-human-04",
    source: "Chapter Two — Law",
    isAI: false,
    difficulty: "medium",
    text:
      "Section 36(6)(c) of the 1999 Constitution guarantees a defendant the right to defend himself in person or by a legal practitioner of his own choice. The Court of Appeal read this as an entitlement that crystallises at arraignment, and not before. That reading is difficult to reconcile with the practical reality that most confessional statements are taken within the first forty-eight hours of arrest, long before a defendant sees a courtroom. If the right begins only at arraignment, the protection arrives after the damage is done.",
  },
  {
    key: "eye-human-05",
    source: "Chapter Three — Education",
    isAI: false,
    difficulty: "hard",
    text:
      "The questionnaire was divided into three sections. Section A collected demographic information such as age, gender and years of teaching experience. Section B contained fifteen items measuring the independent variable on a five-point Likert scale, and Section C contained twelve items measuring the dependent variable on the same scale. The instrument was adapted from Bello (2018), with the wording of four items changed to suit the Nigerian school setting.",
  },
  {
    key: "eye-human-06",
    source: "Chapter One — Agricultural Science",
    isAI: false,
    difficulty: "easy",
    text:
      "Cassava is not a glamorous crop. It does not attract the research funding that rice and maize do, and extension officers rarely treat it as a priority. Yet it feeds more households in this part of the country than either, and it tolerates the poor soils around Ikole-Ekiti where little else will grow. That mismatch, between what the crop does for households and what the system does for the crop, is where this study begins.",
  },
  {
    key: "eye-human-07",
    source: "Chapter Four — Civil Engineering",
    isAI: false,
    difficulty: "medium",
    text:
      "Compressive strength at 28 days averaged 21.4 N/mm² for the control mix and 24.9 N/mm² for the mix containing 10 per cent rice husk ash. At 20 per cent replacement the strength fell to 18.2 N/mm², below the 20 N/mm² required for the grade. The optimum therefore lies somewhere between 10 and 15 per cent, although the present work did not test that interval. Curing was by full immersion, and three cubes were crushed at each age with the mean reported.",
  },
  {
    key: "eye-human-08",
    source: "Chapter Three — History",
    isAI: false,
    difficulty: "medium",
    text:
      "The tax registers for Benin Province survive only in part. The 1928 volume is missing entirely from the Ibadan holdings, and the 1931 volume has water damage across roughly forty pages, most of them in the Orhionmwon section. What survives is enough to show that assessments rose sharply between 1927 and 1930, but not enough to say whether the rise was uniform across the districts. Oral accounts collected in the 1960s fill some of this gap, though they were recorded three decades after the events they describe.",
  },
  {
    key: "eye-human-09",
    source: "Chapter One — Sociology",
    isAI: false,
    difficulty: "hard",
    text:
      "Education remains, for many families in rural Kwara, the single most reliable route out of poverty. Parents who themselves left school early will sell livestock to keep a child in secondary school, and the expectation carried by that child is enormous. It is against this background that dropout has to be understood. A dropout is not simply a line in a state report; it is a family's investment written off.",
  },
  {
    key: "eye-human-10",
    source: "Chapter Four — Computer Science",
    isAI: false,
    difficulty: "easy",
    text:
      "The model was trained on 4,812 student records drawn from three universities. Accuracy was 81 per cent, but that figure is misleading: only 9 per cent of the students in the data actually dropped out, so a model that predicted \"no dropout\" every single time would score 91 per cent. Recall on the dropout class was 46 per cent. That is the number that matters, and it is not yet good enough to act on.",
  },
];

// ── Part 2 — Judge the sources ───────────────────────────────────────────────
// A sitting draws ONE set. Each is ten constructed sources: three Core, three
// Closely related, two Tangential, two Irrelevant. The two irrelevant ones in
// every set share a keyword with the topic and nothing else — the exact
// contamination the research pipeline's Tier 2 exists to catch.

export const RELEVANCE_ITEMS: RelevanceSeed[] = [
  {
    key: "rel-01-mobile-money",
    topic:
      "The effect of mobile money adoption on the sales performance of small-scale traders in Lagos State",
    sources: [
      {
        title: "Mobile money adoption and the sales turnover of market traders in Lagos State",
        authors: "Adeyemi, T. and Okonkwo, C.",
        year: 2023,
        journal: "Journal of African Business",
        abstract:
          "Surveys 410 traders across six Lagos markets and estimates the change in weekly sales turnover associated with adopting a mobile money wallet.",
      },
      {
        title: "Determinants of mobile money use among informal traders in Nigeria",
        authors: "Ibrahim, S.",
        year: 2022,
        journal: "Nigerian Journal of Economic Policy",
        abstract:
          "Identifies the factors that drive and discourage wallet adoption among informal traders in four Nigerian states, including trust, agent density and transaction cost.",
      },
      {
        title: "Digital payments and micro-enterprise performance: evidence from Lagos markets",
        authors: "Eze, N., Bassey, I. and Daniel, O.",
        year: 2024,
        journal: "African Review of Economics and Finance",
        abstract:
          "A panel of 230 micro-enterprises in Lagos, linking the share of sales received digitally to turnover, stock levels and record-keeping quality.",
      },
      {
        title: "Mobile money and small business growth in Kenya: a panel study",
        authors: "Mwangi, P. and Otieno, J.",
        year: 2021,
        journal: "Journal of Development Studies",
        abstract:
          "Follows 1,100 Kenyan micro-businesses over four years and reports the effect of M-Pesa use on revenue growth and business survival.",
      },
      {
        title: "Financial inclusion and household welfare in Nigeria",
        authors: "Afolabi, M.",
        year: 2020,
        journal: "CBN Journal of Applied Statistics",
        abstract:
          "Uses national survey data to relate access to formal and informal financial services to household consumption and savings.",
      },
      {
        title: "Barriers to the adoption of cashless payment among SMEs in Ghana",
        authors: "Mensah, K.",
        year: 2022,
        journal: "African Journal of Business Management",
        abstract:
          "Qualitative study of why Ghanaian small firms continue to prefer cash, drawing on interviews with 38 owner-managers.",
      },
      {
        title: "A review of financial technology regulation in emerging markets",
        authors: "Sharma, R.",
        year: 2021,
        journal: "International Journal of Law and Finance",
        abstract:
          "Compares licensing, consumer protection and anti-money-laundering rules for fintech providers across twelve emerging-market jurisdictions.",
      },
      {
        title: "Determinants of profitability among manufacturing firms listed on the Nigerian Exchange",
        authors: "Okafor, B.",
        year: 2019,
        journal: "Nigerian Journal of Management Sciences",
        abstract:
          "Panel regression of leverage, firm size and asset turnover on the return on assets of 42 listed manufacturing companies.",
      },
      {
        title: "Machine learning approaches to fraud detection in mobile payment systems",
        authors: "Zhang, W. and Li, H.",
        year: 2023,
        journal: "IEEE Transactions on Information Forensics and Security",
        abstract:
          "Benchmarks gradient boosting and neural network classifiers for detecting fraudulent mobile payment transactions in a telecom dataset.",
      },
      {
        title: "Consumer trust in internet banking in the United Kingdom",
        authors: "Hughes, A.",
        year: 2016,
        journal: "Journal of Financial Services Marketing",
        abstract:
          "Measures the antecedents of trust in online banking among 600 retail customers of four British high-street banks.",
      },
    ],
    labels: [
      "CORE",
      "CORE",
      "CORE",
      "CLOSELY_RELATED",
      "CLOSELY_RELATED",
      "CLOSELY_RELATED",
      "TANGENTIAL",
      "TANGENTIAL",
      "IRRELEVANT",
      "IRRELEVANT",
    ],
  },

  {
    key: "rel-02-hand-hygiene",
    topic:
      "Knowledge and practice of hand hygiene among nurses in a tertiary hospital in Benin City",
    sources: [
      {
        title: "Hand hygiene knowledge and compliance among nurses in a Nigerian teaching hospital",
        authors: "Olaniyi, F. and Abdullahi, R.",
        year: 2021,
        journal: "Nigerian Journal of Clinical Practice",
        abstract:
          "Questionnaire and direct observation of 180 nurses, comparing self-reported knowledge with observed compliance on medical and surgical wards.",
      },
      {
        title:
          "Compliance with the WHO five moments for hand hygiene in a tertiary hospital in southern Nigeria",
        authors: "Eghosa, V.",
        year: 2022,
        journal: "African Journal of Infection Control",
        abstract:
          "Observational audit of 1,400 hand hygiene opportunities, reporting compliance separately for each of the five moments.",
      },
      {
        title: "Knowledge, attitude and practice of infection prevention among nurses in Edo State",
        authors: "Osaro, E.",
        year: 2020,
        journal: "Journal of Public Health in Africa",
        abstract:
          "Cross-sectional survey of 240 nurses across three Edo State hospitals covering hand hygiene, sharps handling and protective equipment.",
      },
      {
        title:
          "Hand hygiene compliance among healthcare workers in sub-Saharan Africa: a systematic review",
        authors: "Banda, L.",
        year: 2019,
        journal: "Journal of Hospital Infection",
        abstract:
          "Reviews 46 studies and pools compliance rates by cadre, ward type and whether an intervention was in place.",
      },
      {
        title: "Barriers to hand hygiene among doctors in a Ghanaian hospital",
        authors: "Asante, D.",
        year: 2021,
        journal: "Ghana Medical Journal",
        abstract:
          "Interviews 32 doctors on why hand hygiene is skipped, identifying workload, dispenser placement and skin irritation.",
      },
      {
        title: "Hospital-acquired infection rates in a Nigerian intensive care unit",
        authors: "Chukwu, A.",
        year: 2023,
        journal: "West African Journal of Medicine",
        abstract:
          "Reports device-associated infection rates over 18 months and their relationship with recorded infection-control practice.",
      },
      {
        title: "Nurse staffing levels and patient mortality in English hospitals",
        authors: "Griffiths, P.",
        year: 2018,
        journal: "BMJ Quality and Safety",
        abstract:
          "Links registered-nurse hours per patient day to 30-day mortality across 137 English acute hospitals.",
      },
      {
        title: "The chemistry of alcohol-based hand rub formulations",
        authors: "Novak, J.",
        year: 2017,
        journal: "Journal of Applied Microbiology",
        abstract:
          "Compares the antimicrobial efficacy and skin tolerance of ethanol, isopropanol and n-propanol formulations at varying concentrations.",
      },
      {
        title: "Hand, foot and mouth disease outbreaks in childcare centres",
        authors: "Lim, S.",
        year: 2015,
        journal: "Epidemiology and Infection",
        abstract:
          "Describes the transmission dynamics of enterovirus outbreaks in 60 childcare centres and the control measures applied.",
      },
      {
        title: "Burnout among nurses during the COVID-19 pandemic in Italy",
        authors: "Rossi, G.",
        year: 2021,
        journal: "Journal of Nursing Management",
        abstract:
          "Measures emotional exhaustion and depersonalisation among 900 Italian nurses at the height of the pandemic.",
      },
    ],
    labels: [
      "CORE",
      "CORE",
      "CORE",
      "CLOSELY_RELATED",
      "CLOSELY_RELATED",
      "CLOSELY_RELATED",
      "TANGENTIAL",
      "TANGENTIAL",
      "IRRELEVANT",
      "IRRELEVANT",
    ],
  },

  {
    key: "rel-03-dropout-model",
    topic:
      "Development of a machine learning model for predicting student dropout in Nigerian universities",
    sources: [
      {
        title: "Predicting student attrition in a Nigerian university using decision trees",
        authors: "Adewale, O.",
        year: 2022,
        journal: "Nigerian Journal of Computing",
        abstract:
          "Trains decision tree and random forest classifiers on six years of student records from one federal university and reports precision and recall for the dropout class.",
      },
      {
        title: "Machine learning for the early identification of at-risk undergraduates",
        authors: "Fernandes, L.",
        year: 2021,
        journal: "Computers and Education",
        abstract:
          "Compares logistic regression, gradient boosting and neural networks for flagging students at risk of withdrawal within the first two semesters.",
      },
      {
        title: "Factors influencing student dropout in Nigerian tertiary institutions",
        authors: "Yakubu, M. and Musa, H.",
        year: 2020,
        journal: "Journal of Education and Practice",
        abstract:
          "Survey of 1,200 students and former students identifying financial hardship, academic difficulty and family pressure as the leading causes of withdrawal.",
      },
      {
        title: "Educational data mining: a systematic review of dropout prediction",
        authors: "Silva, R.",
        year: 2023,
        journal: "IEEE Access",
        abstract:
          "Reviews 112 dropout prediction studies, summarising the features, algorithms and evaluation metrics most commonly used.",
      },
      {
        title: "Handling class imbalance in educational prediction tasks",
        authors: "Kumar, A.",
        year: 2022,
        journal: "Expert Systems with Applications",
        abstract:
          "Evaluates resampling and cost-sensitive learning on educational datasets where the minority class is under ten per cent.",
      },
      {
        title: "Student retention strategies in South African universities",
        authors: "Nkosi, T.",
        year: 2019,
        journal: "South African Journal of Higher Education",
        abstract:
          "Case studies of four institutions and the interventions they used to raise completion rates among first-generation students.",
      },
      {
        title: "A comparative study of classification algorithms for credit scoring",
        authors: "Oyelami, B.",
        year: 2021,
        journal: "Journal of Applied Computing",
        abstract:
          "Benchmarks seven classifiers on a loan default dataset and discusses the trade-off between interpretability and accuracy.",
      },
      {
        title: "Funding and access in Nigerian higher education policy",
        authors: "Bello, A.",
        year: 2018,
        journal: "Higher Education Policy",
        abstract:
          "Traces federal funding allocations to universities since 1999 and their consequences for enrolment and staffing.",
      },
      {
        title: "Deep learning for image classification in medical diagnosis",
        authors: "Hassan, K.",
        year: 2023,
        journal: "Medical Image Analysis",
        abstract:
          "Applies convolutional neural networks to chest radiographs and reports diagnostic performance against radiologist labels.",
      },
      {
        title: "Energy consumption patterns in Malaysian university student dormitories",
        authors: "Lim, C.",
        year: 2019,
        journal: "Energy and Buildings",
        abstract:
          "Monitors electricity use across eight dormitory blocks and models the effect of occupancy and appliance ownership.",
      },
    ],
    labels: [
      "CORE",
      "CORE",
      "CORE",
      "CLOSELY_RELATED",
      "CLOSELY_RELATED",
      "CLOSELY_RELATED",
      "TANGENTIAL",
      "TANGENTIAL",
      "IRRELEVANT",
      "IRRELEVANT",
    ],
  },
];

// ── Part 3 — Rewrite it in your own voice ────────────────────────────────────
// A sitting draws ONE paragraph. Each carries several of the banned
// constructions the free voice scan catches, so the score is "how many did you
// clear" rather than an opinion. The scan is the grader — never hand-count.

export const REWRITE_ITEMS: RewriteSeed[] = [
  {
    key: "rewrite-01-payments",
    note: "Obvious tells: stock opener, filler transitions, promotional words, first person.",
    text:
      "In today's rapidly evolving digital landscape, the adoption of electronic payment platforms has become increasingly important for small businesses. Moreover, these cutting-edge systems play a crucial role in improving efficiency and reducing the risks associated with handling cash. It is important to note that many researchers have highlighted the transformative potential of such technologies. Furthermore, the benefits are not limited to convenience alone, as they extend to record-keeping and access to credit. We believe this underscores the need for further study in the Nigerian context.",
  },
  {
    key: "rewrite-02-social-media",
    note: "Quieter tells: an advent opener, enumerating transitions, a noted-that opener, first person.",
    text:
      "With the advent of social media, the way organisations communicate with their customers has changed considerably. Firstly, it has reduced the cost of reaching a wide audience. Secondly, it has given customers a platform on which to voice complaints publicly. It should be noted that this shift has not been uniform across sectors. In addition, the smaller firms in our sample appeared to adapt more quickly than the larger ones.",
  },
];
