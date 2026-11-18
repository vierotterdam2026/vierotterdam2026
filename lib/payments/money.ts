/**
 * Money is whole cents everywhere. Floating point never touches an amount, so
 * 2.50 can never turn into 2.4999999.
 */

/**
 * Reads what a person types — "2,50", "2.50", "€ 2,50", "2" — as cents, or null
 * when it is not a plain amount. Dutch keyboards use a comma, so both separators
 * are accepted. Thousands separators are deliberately not: "1.000" is ambiguous.
 */
export function parseEuroToCents(input: string): number | null {
  const match = input.trim().match(/^€?\s*(\d{1,5})(?:[.,](\d{1,2}))?$/);
  if (!match) return null;

  const euros = Number(match[1]);
  const cents = match[2] === undefined ? 0 : Number(match[2].padEnd(2, "0"));
  return euros * 100 + cents;
}

const euro = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" });

/** 250 → "€2.50". */
export function formatEuro(cents: number): string {
  return euro.format(cents / 100);
}
