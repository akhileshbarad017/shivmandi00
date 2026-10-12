/** Round to 2 decimals, avoiding floating point noise. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Coerce anything to a finite money number (2 dp), defaulting to 0. */
export function money(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? round2(n) : 0;
}

/** Percentage of a base amount. */
export function percentOf(base: number, percent: number): number {
  return round2((base * percent) / 100);
}

/** Indian-format currency string, e.g. ₹1,23,456.50 */
export function formatINR(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(safe)}`;
}
