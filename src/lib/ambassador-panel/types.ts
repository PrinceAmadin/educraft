/**
 * Data shapes for the ambassador panel — ported unchanged from the original
 * EduCraft Ambassador app (Educraft_Ambassador/). The panel's live data stays
 * in the same Redis store the original deployment uses, under the same keys.
 */

export type SlotStatus = "active" | "vacant";

/** A general ambassador slot, keyed by its zero-padded number ("007"). */
export interface AmbassadorSlot {
  name: string;
  school: string;
  status: SlotStatus;
}

/** Core Ambassador (ECCA-###) — senior partner who recruits Sub-Ambassadors. */
export interface CoreAmbassador {
  id: string;
  name: string;
  school: string;
  percentage: number;
  status?: SlotStatus;
}

/** Sub-Ambassador (ECSA-###-###) — linked to one Core Ambassador. */
export interface SubAmbassador {
  id: string;
  name: string;
  school: string;
  percentage: number;
  coreId: string;
  status?: SlotStatus;
}

export interface Roster {
  educraft_whatsapp: string;
  slots: Record<string, AmbassadorSlot>;
  coreAmbassadors: CoreAmbassador[];
  subAmbassadors: SubAmbassador[];
}

export interface TrackingStat {
  clicks: number;
  orders: number;
  email: string | null;
  registeredName: string | null;
}

export interface PendingRegistration {
  slotId: string;
  name: string;
  school: string;
  email: string;
  registeredAt: string;
  adminCorrected?: boolean;
}

export interface PanelApplication {
  slotId: string;
  fullName: string;
  universityFull: string;
  universityAbbr: string;
  email: string;
  phone: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  submittedAt: string;
  status: string;
}

export interface PaymentRecord {
  slotId: string;
  name: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  email?: string;
  phone?: string;
  universityFull?: string;
  universityAbbr?: string;
  approvedAt?: string;
  updatedAt?: string;
}

export interface PanelStatus {
  /** REDIS_URL is set — tracking, applications and approvals work. */
  redis: boolean;
  /** GMAIL_APP_PASSWORD is set — welcome, commission and broadcast emails send. */
  email: boolean;
}

export interface PanelOverview {
  status: PanelStatus;
  roster: Roster;
  stats: Record<string, TrackingStat>;
  pending: PendingRegistration[];
  applications: PanelApplication[];
  payments: PaymentRecord[];
}

export type AmbassadorKind = "general" | "core" | "sub";
