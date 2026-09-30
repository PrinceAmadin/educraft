/**
 * Two small fixture reports (a Business survey and an Engineering lab report),
 * shared by `npm run check:assembly` and `npm run check:chapterdocx`.
 */
import type { AssemblyInput } from "../../src/lib/assembly/assemble";

export const ASSEMBLY_REFS = [
  { title: "Mobile money adoption among Lagos traders", proposedTitle: "", authors: "Okafor, C.; Musa, A.; Eze, B.", year: 2020, journal: "Journal of African Business", doi: "10.1/okafor" },
  { title: "Mobile money adoption among Lagos traders", proposedTitle: "", authors: "Okafor, C.; Musa, A.; Eze, B.", year: 2020, journal: "Journal of African Business", doi: "10.1/okafor" },
  { title: "Fees and trust in digital payments", proposedTitle: "", authors: "Adeyemi, T.; Bello, K.", year: 2019, journal: "African Journal of Economic Review", doi: "10.1/adeyemi" },
  { title: "Statistics: An introductory analysis", proposedTitle: "", authors: "Yamane, T.", year: 1967, journal: null, doi: null },
  { title: "Women traders and mobile wallets", proposedTitle: "", authors: "Musa, A.; Ibrahim, S.; Lawal, K.", year: 2021, journal: "Gender and Development", doi: "10.1/musa" },
  { title: "Never cited in the chapters", proposedTitle: "", authors: "Zubair, Z.", year: 2018, journal: "Nowhere Review", doi: "10.1/zubair" },
];

export function assemblyChapters(engineering: boolean): AssemblyInput["chapters"] {
  const ch = (n: number, body: string) => ({ number: n, text: body });
  return [
    ch(1, `[H1] CHAPTER ONE\n[H1] INTRODUCTION\n[H2] 1.1 background of the study\nMobile money has changed how traders in Lagos pay suppliers (Okafor et al., 2020). Adoption rose — especially among women (Musa *et al.*, 2021). Traders in Nigeria face high fees.\n\n[H3] 1.1.1 Challenges Facing Traders In Nigeria\nAdeyemi and Bello (2019) found fees fell.\n\n[H2] 1.2 objectives of the study\nThe objectives are to:\ni. examine adoption;\nii. assess trust.`),
    ch(2, `[H1] CHAPTER TWO\n[H1] LITERATURE REVIEW\n[H2] 2.1 Introduction\nThis review follows Okafor et. al. (2020).\n\n[TABLE] Table 2.1: Summary of Reviewed Studies\n| Author | Finding |\n|---|---|\n| Okafor et al. (2020) | Fees fell |\n| Musa et al. (2021) | Women led adoption |\n[/TABLE]\n\n[FIG] [FIGURE PLACEHOLDER: technology acceptance model] | Figure 2.1: Technology Acceptance Model (Davis, 1989) [/FIG]`),
    ch(
      3,
      engineering
        ? `[H1] CHAPTER THREE\n[H1] MATERIALS AND METHODS\n[H2] 3.1 Introduction\nThe stress follows Equation (3.1).\n\n[EQ] σ = P / A | 3.1 [/EQ]\n\n[EQ] P_panel = (P_load × t × SF) / η_charge | 3.2 [/EQ]\n\nTable 3.1: Mix Proportions\n| Mix | Cement (kg/m³) | RHA (%) |\n|---|---|---|\n| M0 | 350 | 0 |\n| M10 | 315 | 10 |\nSource: Laboratory Work, 2026`
        : `[H1] CHAPTER THREE\n[H1] RESEARCH METHODOLOGY\n[H2] 3.1 Introduction\nThe sample size follows Yamane (1967) in Equation (3.1).\n\nn = N / (1 + N(e²))    (3.1)\n\nTable 3.1: Distribution of the Sample\n| Market | Population | Sample |\n|---|---|---|\n| Balogun | 400 | 120 |\nSource: Field Survey, 2026`,
    ),
    ch(4, `[H1] CHAPTER FOUR\n[H1] DATA PRESENTATION AND ANALYSIS\n[H2] 4.1 Introduction\nResults follow.\n\nTable 4.1: Regression Results\n| Variable | Coefficient | p-value |\n|---|---|---|\n| Fees | -0.21 | 0.032* |\n| Trust | [DATA NOT PROVIDED — COO TO REVIEW] | 0.001** |\nSource: Field Survey, 2026`),
    ch(5, `[H1] CHAPTER FIVE\n[H1] SUMMARY, CONCLUSION AND RECOMMENDATIONS\n[H2] 5.1 Summary\nThe study found fees fell (Adeyemi & Bello, 2019, p. [page]).\n\n- Banks should cut fees.\n- Agents should be trained.`),
  ];
}

export function assemblyInput(engineering: boolean): AssemblyInput {
  return {
    projectCode: "EC-CHECK",
    title: engineering ? "Compressive Strength of Concrete with Rice Husk Ash" : "Mobile Money Adoption Among Market Traders in Lagos",
    student: { name: "Ada Obi", matric: "190404001" },
    university: "University of Lagos",
    faculty: engineering ? "Engineering" : "Management Sciences",
    department: engineering ? "Civil Engineering" : "Business Administration",
    supervisor: "Dr. K. Bello",
    hod: null,
    submission: new Date("2026-10-15T12:00:00Z"),
    dedication: { type: "God", details: null },
    acknowledgementNote: "Thank Dr. Bello and my parents",
    mode: engineering ? 4 : 2,
    section: engineering ? "ENGINEERING" : "BUSINESS",
    referencingStyle: "APA_7TH",
    citationPlacement: "NOT_APPLICABLE",
    thematicTitles: { chapter3: null, chapter4: null },
    chapters: assemblyChapters(engineering),
    references: ASSEMBLY_REFS,
    includePrelims: true,
  };
}
