export interface CostSplit {
  /** What each person pays, rounded up to the cent so the cost is always covered. */
  perPersonCents: number;
  /** What that adds up to across everyone. */
  collectedCents: number;
  /** How far over the cost that is. Never negative. */
  surplusCents: number;
}

/**
 * Splits a cost evenly. €60 across 26 people is €2.3077 each, which cannot be
 * paid, so it rounds up to €2.31 and the few cents over are shown rather than
 * hidden. Null when there is nothing to split.
 */
export function splitCost(totalCents: number, people: number): CostSplit | null {
  if (!Number.isInteger(totalCents) || !Number.isInteger(people)) return null;
  if (totalCents <= 0 || people <= 0) return null;

  const perPersonCents = Math.ceil(totalCents / people);
  const collectedCents = perPersonCents * people;
  return { perPersonCents, collectedCents, surplusCents: collectedCents - totalCents };
}
