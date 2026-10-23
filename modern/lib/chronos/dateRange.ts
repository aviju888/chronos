import type { YearRange } from './types.js';

/** Shared validation with no browser or catalog dependencies. */
export function rangeError(value: unknown, now = new Date().getFullYear()): string | null {
  if (!value || typeof value !== 'object') return 'Enter both a start and end year.';
  const { start, end } = value as YearRange;
  if (![start, end].every(y => Number.isInteger(y) && y !== 0 && y >= -10000 && y <= now)) {
    return `Use whole years from 10000 BCE to ${now} CE. There is no year 0.`;
  }
  return start > end ? 'The start year must come before the end year.' : null;
}
