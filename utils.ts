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

/**
 * Parse the URL hash for deep linking
 * Format: #/timeline/{id}/{view} or #/timeline/{id}/{view}/event/{eventId}
 */
export function parseHash(): { timelineId?: string; view?: string; eventId?: string } {
  const hash = window.location.hash.slice(1);
  if (!hash) return {};

  const parts = hash.split('/').filter(Boolean);
  const result: { timelineId?: string; view?: string; eventId?: string } = {};

  if (parts[0] === 'timeline' && parts[1]) {
    result.timelineId = parts[1];
    if (parts[2] && ['map', 'timeline', 'list', 'narrative'].includes(parts[2])) {
      result.view = parts[2];
    }
    if (parts[3] === 'event' && parts[4]) {
      result.eventId = parts[4];
    }
  }

  return result;
}

/**
 * Update the URL hash for deep linking
 */
export function updateHash(timelineId: string | null, view: string, eventId: string | null = null): void {
  if (!timelineId) {
    if (window.location.hash) {
      history.pushState(null, '', window.location.pathname);
    }
    return;
  }

  let hash = `#/timeline/${timelineId}/${view}`;
  if (eventId) {
    hash += `/event/${eventId}`;
  }

  if (window.location.hash !== hash) {
    history.pushState(null, '', hash);
  }
}
