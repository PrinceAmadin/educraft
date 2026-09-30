export interface PriceInputs {
  basePrice: number;
  variantAddon?: number;
  expressSurcharge?: number;
  isExpressDelivery?: boolean;
  /** When set, replaces the computed total (VARIABLE / QUOTE pricing). */
  override?: number | null;
  /** The service's downpayment split (Service.downpaymentPercentage). */
  downpaymentPercentage: number;
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

  const downpaymentAmount = naira((total * inputs.downpaymentPercentage) / 100);
  const balanceAmount = total - downpaymentAmount;

  return { base, variantAddon, expressSurcharge, total, downpaymentAmount, balanceAmount, overridden };
}

/**
 * Split a project total into the worker / ambassador / EduCraft legs.
 * `workersPercent` is the Workers row of the cashflow structure in force
 * (40 in v1); it is frozen on the project as `workerPayoutRate`.
 */
export function computeSplit(total: number, ambassadorRate: number | null, workersPercent: number) {
  const workerPayout = naira((total * workersPercent) / 100);
  const ambassadorCommission =
    ambassadorRate != null ? naira((total * ambassadorRate) / 100) : null;
  const educraftRevenue = total - workerPayout - (ambassadorCommission ?? 0);
  return { workerPayout, ambassadorCommission, educraftRevenue };
}
