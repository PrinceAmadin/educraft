/**
 * The Layer 4 delivery checklist from the EduCraft Quality Standard: the
 * sixteen things a human reviewer confirms before a project is approved.
 * Fixed in code on purpose — it is a quality standard, not a preference, so
 * a change to the standard is a code change, never a setting.
 */

export type DeliveryCheckId =
  | "d1" | "d2" | "d3" | "d4" | "d5"
  | "d6" | "d7" | "d8" | "d9" | "d10" | "d11" | "d12"
  | "d13" | "d14" | "d15" | "d16";

export type DeliveryCheckGroup = "Document navigation" | "Client information" | "File quality";

export interface DeliveryCheckItem {
  id: DeliveryCheckId;
  code: string;
  label: string;
  group: DeliveryCheckGroup;
}

export const DELIVERY_CHECKLIST: readonly DeliveryCheckItem[] = [
  { id: "d1", code: "D1", group: "Document navigation", label: "Table of contents page numbers are correct (update fields, verify)" },
  { id: "d2", code: "D2", group: "Document navigation", label: "List of figures entries match actual figures with correct page numbers" },
  { id: "d3", code: "D3", group: "Document navigation", label: "List of tables entries match actual tables with correct page numbers" },
  { id: "d4", code: "D4", group: "Document navigation", label: "List of appendices entries match actual appendices" },
  { id: "d5", code: "D5", group: "Document navigation", label: "Page numbering correct throughout (Roman prelims, Arabic body, no gaps)" },
  { id: "d6", code: "D6", group: "Client information", label: "Client's name spelled correctly everywhere (title page, certification, declaration)" },
  { id: "d7", code: "D7", group: "Client information", label: "Matric number correct on all pages" },
  { id: "d8", code: "D8", group: "Client information", label: "Supervisor's name spelled correctly" },
  { id: "d9", code: "D9", group: "Client information", label: "HOD's name spelled correctly" },
  { id: "d10", code: "D10", group: "Client information", label: "Dedication names correct and match the client's instructions" },
  { id: "d11", code: "D11", group: "Client information", label: "Acknowledgment names correct" },
  { id: "d12", code: "D12", group: "Client information", label: "University name and department correct throughout" },
  { id: "d13", code: "D13", group: "File quality", label: "File saved as .docx" },
  { id: "d14", code: "D14", group: "File quality", label: "PDF version also available" },
  { id: "d15", code: "D15", group: "File quality", label: "No tracked changes, comments, or hidden revision marks" },
  { id: "d16", code: "D16", group: "File quality", label: "No placeholder text (\"insert figure here\", \"TODO\", \"[reference needed]\")" },
];

export const DELIVERY_CHECK_GROUPS: readonly DeliveryCheckGroup[] = ["Document navigation", "Client information", "File quality"];

export type DeliveryChecklistState = Record<DeliveryCheckId, boolean>;

/** The saved JSON as a full map (unknown keys dropped, missing keys false). */
export function deliveryChecklistState(raw: unknown): DeliveryChecklistState {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as DeliveryChecklistState;
  for (const item of DELIVERY_CHECKLIST) out[item.id] = source[item.id] === true;
  return out;
}

export function deliveryChecksDone(state: DeliveryChecklistState): number {
  return DELIVERY_CHECKLIST.filter((i) => state[i.id]).length;
}

export function allDeliveryChecksPassed(state: DeliveryChecklistState): boolean {
  return deliveryChecksDone(state) === DELIVERY_CHECKLIST.length;
}

export function isDeliveryCheckId(value: string): value is DeliveryCheckId {
  return DELIVERY_CHECKLIST.some((i) => i.id === value);
}
