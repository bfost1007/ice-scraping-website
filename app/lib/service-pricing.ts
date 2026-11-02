// Public advertised prices. Stored bookings may have different agreed prices;
// these are not a historical transaction ledger.
export const PLAN_RATES = {
  Basic: { Daily: 5, Weekly: 15, Monthly: 45, Semester: 40 },
  Premium: { Daily: 7, Weekly: 18, Monthly: 55, Semester: 55 },
} as const;
export const PERIOD_DAYS = { Daily: 1, Weekly: 5, Monthly: 21, Semester: 24 } as const;
export type ServiceTier = keyof typeof PLAN_RATES;
export type ServiceFrequency = keyof typeof PERIOD_DAYS;
export function savingsPercent(tier: ServiceTier, frequency: string) {
  const period = frequency as ServiceFrequency;
  return Math.round((1 - PLAN_RATES[tier][period] / (PLAN_RATES[tier].Daily * PERIOD_DAYS[period])) * 100);
}
