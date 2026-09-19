/**
 * The live Ambassador Panel roster, as it stood on 2026-09-19 (transcribed
 * from the panel's own Ambassadors / Core / Sub screens — the copy in the old
 * repo's `src/ambassadors.ts` is stale: it has slots 017–021 vacant that are
 * filled in the live panel). Seeded once by `npm run roster:seed`, which never
 * overwrites an existing row, so edits made in HQ's Manage tab survive a re-run.
 */
export interface SeedSlot {
  code: string;
  name: string;
  school: string;
}

/** [slot, name, school] — "" name = vacant. Slots 001–066. */
const GENERAL: [string, string, string][] = [
  ["001", "Admins", "Co-founders"],
  ["002", "Noruwosa Zoe", "UNIBEN"],
  ["003", "Cassandra", "DELSU"],
  ["004", "Marong", "EUI"],
  ["005", "Chidinma", "EUI"],
  ["006", "Debby", "EUI"],
  ["007", "Osheho", "EUI"],
  ["008", "Ayomidele", "UNIBEN"],
  ["009", "Goodness", "EUI"],
  ["010", "Ib Nation", "EUI"],
  ["011", "Fortune", "EUI"],
  ["012", "Obehi", "EUI"],
  ["013", "Princewill", "EUI"],
  ["014", "Sultan", "EUI"],
  ["015", "Taiwo", "EUI"],
  ["016", "Aisosa (MLS)", "EUI"],
  ["017", "Okoyo Emmanuel", "ESUI"],
  ["018", "Dr Abel", "EUI"],
  ["019", "Oviosun Isaac kunle", "ESUI"],
  ["020", "Onaivi Oizamisi Vincent", "ESUI"],
  ["021", "Panugo Otosede Edith", "UNILAG"],
  ["022", "Blue Chief", "EUI"],
  ["023", "Promzex", "EUI"],
  ["024", "Confidence", "EUI"],
  ["025", "Fredrick", "EUI"],
  ["026", "Esosa", "PG"],
  ["027", "David English", "EUI"],
  ["028", "Chibuzor", "EUI"],
  ["029", "Queen Precious", "EUI"],
  ["030", "Cynthia", "EUI"],
  ["031", "Miracle", "EUI"],
  ["032", "Abdullahi", "EUI"],
  ["033", "Gift", "EUI"],
  ["034", "Doreen", "EUI"],
  ["035", "David Salam", "EUI"],
  ["036", "Ayomide Bridget", "EUI"],
  ["037", "Ifekristi", "UNILAG"],
  ["038", "Victory Teshua", "EUI"],
  ["039", "Collins", "EUI"],
  ["040", "Favy", "EUI"],
  ["041", "Deborah", "EUI"],
  ["042", "Aisosa", "EUI"],
  ["043", "Engine Boy", "UNIBEN"],
  ["044", "Adenike", "UNIBEN"],
  ["045", "Precious", ""],
  ["046", "Ayo (Bridget)", "EUI"],
  ["047", "Raqeeb", "EUI"],
  ["048", "Michael", "EUI"],
  ["049", "JESSE OSHIONEBO ONEKPE", "EDSU"],
  ["050", "Joshua (COE)", "EUI"],
  ["051", "Guih", "VNKJ"],
  ["052", "Odiase Isaiah", "ESUI"],
  ["053", "Agbaraolorunkiibati James-ugbodagah", "ESUI"],
  ["054", "Emmanuel Mebawondu", "ESUI"],
  ["055", "Adumeta Favour Ufouma", "IUO"],
  ["056", "Collins Anoyafe", "ESUI"],
  ["057", "Enofe promise", "UNIDEL"],
  ["058", "Akanmu Itunuoluwa Esther", "ESUI"],
  ["059", "", "EUI"],
  ["060", "", "EUI"],
  ["061", "", "EUI"],
  ["062", "", "EUI"],
  ["063", "", "EUI"],
  ["064", "", "EUI"],
  ["065", "", "EUI"],
  ["066", "", "EUI"],
];

export const GENERAL_SLOTS = GENERAL.map(([code, name, school]) => ({
  kind: "GENERAL" as const,
  code,
  name,
  school,
  vacant: name === "",
}));

/** [code, name, school, base %] */
export const CORE_SLOTS = (
  [
    ["ECCA-001", "Chidinma Victory", "EUI", 25],
    ["ECCA-002", "Debby", "EUI", 10],
    ["ECCA-003", "Yole", "EUI", 10],
    ["ECCA-004", "Zoe Grace", "EUI", 10],
    ["ECCA-005", "General", "Admin", 10],
    ["ECCA-006", "Marong", "EUI", 10],
  ] as [string, string, string, number][]
).map(([code, name, school, percentage]) => ({
  kind: "CORE" as const,
  code,
  name,
  school,
  vacant: false,
  percentage,
}));

/** [code, name, school, %, core code, vacant] */
export const SUB_SLOTS = (
  [
    ["ECSA-001-001", "Rita", "Edwin Clark", 5, "ECCA-001", false],
    ["ECSA-001-002", "Praise", "SDU", 5, "ECCA-001", true],
    ["ECSA-001-003", "Queensly", "EUI", 5, "ECCA-001", false],
    ["ECSA-001-004", "NIL", "-", 7, "ECCA-001", true],
    ["ECSA-001-005", "Alfred Chioma", "SDU", 7, "ECCA-001", false],
  ] as [string, string, string, number, string, boolean][]
).map(([code, name, school, percentage, parentCode, vacant]) => ({
  kind: "SUB" as const,
  code,
  name,
  school,
  vacant,
  percentage,
  parentCode,
}));
