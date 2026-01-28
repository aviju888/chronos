// Utility functions for Chronos

/**
 * Format a year number for display, handling BC dates
 * @param year - Year as number (negative for BC)
 * @returns Formatted string like "753 BC" or "476 AD"
 */
export function formatYear(year: number): string {
  if (year < 0) {
    return `${Math.abs(year)} BC`;
  } else if (year < 500) {
    // Show AD for early common era years to avoid ambiguity
    return `${year} AD`;
  }
  return year.toString();
}

/**
 * Format a year range for display
 * @param start - Start year (negative for BC)
 * @param end - End year (negative for BC)
 * @returns Formatted string like "753 BC — 476 AD"
 */
export function formatYearRange(start: number, end: number): string {
  return `${formatYear(start)} — ${formatYear(end)}`;
}
