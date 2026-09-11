import { DOWNPAYMENT_PERCENTAGE, WORKER_PAYOUT_RATE } from "@/lib/constants";

export interface PriceInputs {
  basePrice: number;
  variantAddon?: number;
  expressSurcharge?: number;
  isExpressDelivery?: boolean;
  /** When set, replaces the computed total (VARIABLE / QUOTE pricing). */
  override?: number | null;
  /** Per-service override of the downpayment split. Defaults to the global 45%. */
  downpaymentPercentage?: number;
}

export interface PriceBreakdown {
  base: number;
  variantAddon: number;
  expressSurcharge: number;
  total: number;
  downpaymentAmount: number;
  balanceAmount: number;
  /** True when `override` diverged from the auto-computed figure. */
  overridden: boolean;
}

/** Round to the nearest naira — the business never bills kobo. */
function naira(value: number): number {
  return Math.round(value);
}

export function computePrice(inputs: PriceInputs): PriceBreakdown {
  const base = naira(inputs.basePrice);
  const variantAddon = naira(inputs.variantAddon ?? 0);
  const expressSurcharge = inputs.isExpressDelivery ? naira(inputs.expressSurcharge ?? 0) : 0;

  const computed = base + variantAddon + expressSurcharge;
  const overridden =
    inputs.override != null && Number.isFinite(inputs.override) && naira(inputs.override) !== computed;
  const total = overridden ? naira(inputs.override as number) : computed;

  const downpaymentPct = inputs.downpaymentPercentage ?? DOWNPAYMENT_PERCENTAGE;
  const downpaymentAmount = naira((total * downpaymentPct) / 100);
  const balanceAmount = total - downpaymentAmount;

  return { base, variantAddon, expressSurcharge, total, downpaymentAmount, balanceAmount, overridden };
}

/** Split a project total into the worker / ambassador / EduCraft legs. */
export function computeSplit(total: number, ambassadorRate: number | null) {
  const workerPayout = naira((total * WORKER_PAYOUT_RATE) / 100);
  const ambassadorCommission =
    ambassadorRate != null ? naira((total * ambassadorRate) / 100) : null;
  const educraftRevenue = total - workerPayout - (ambassadorCommission ?? 0);
  return { workerPayout, ambassadorCommission, educraftRevenue };
}
