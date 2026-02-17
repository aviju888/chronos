/**
 * Shared validation and sanitization functions.
 * Extracted from api/generate.ts for testability.
 */

// Input validation & sanitization
export function sanitizeString(input: unknown, maxLength: number = 200): string | null {
  if (typeof input !== 'string') return null;
  const sanitized = input
    .trim()
    .slice(0, maxLength)
    .replace(/<[^>]*?>/g, '') // Remove HTML tags (non-greedy to avoid ReDoS)
    .replace(/[^\p{L}\p{N}\s\-.,'"()]/gu, ''); // Allow all Unicode letters/numbers
  return sanitized.length > 0 ? sanitized : null;
}

export function validateCoordinates(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null; // Reject NaN, Infinity
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function validateYear(year: unknown): number | null {
  if (typeof year !== 'number') return null;
  if (!Number.isFinite(year)) return null; // Reject NaN, Infinity
  if (!Number.isInteger(year)) return null;
  if (year === 0) return null; // No year 0 in historical calendar
  if (year < -10000 || year > 2100) return null;
  return year;
}

export function validateTimeRange(start: unknown, end: unknown): { start: number; end: number } | null {
  const startYear = validateYear(start);
  const endYear = validateYear(end);
  if (startYear === null || endYear === null) return null;
  if (startYear >= endYear) return null;
  if (endYear - startYear > 5000) return null; // Max 5000 year span
  return { start: startYear, end: endYear };
}

/**
 * Validate that an event object has all required fields with correct types.
 */
export function validateEvent(event: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!event || typeof event !== 'object') {
    return { valid: false, errors: ['Event is not an object'] };
  }

  const e = event as Record<string, unknown>;

  // Required fields
  if (typeof e.title !== 'string' || e.title.trim().length === 0) {
    errors.push('Missing or empty title');
  }

  if (typeof e.year !== 'number' || !Number.isFinite(e.year) || !Number.isInteger(e.year)) {
    errors.push('Invalid year');
  } else if (e.year === 0) {
    errors.push('Year 0 does not exist');
  }

  if (typeof e.summary !== 'string' || e.summary.trim().length === 0) {
    errors.push('Missing or empty summary');
  }

  // Validate category
  const validCategories = ['Politics', 'War', 'Culture', 'Economy', 'Religion', 'Science', 'Other'];
  if (typeof e.category === 'string' && !validCategories.includes(e.category)) {
    errors.push(`Invalid category: ${e.category}`);
  }

  // Validate relevanceType if present
  if (e.relevanceType !== undefined) {
    const validRelevance = ['direct', 'regional', 'contextual'];
    if (typeof e.relevanceType !== 'string' || !validRelevance.includes(e.relevanceType)) {
      errors.push(`Invalid relevanceType: ${e.relevanceType}`);
    }
  }

  // Validate confidenceScore if present
  if (e.confidenceScore !== undefined) {
    const validConfidence = ['High', 'Medium', 'Low'];
    if (!validConfidence.includes(e.confidenceScore as string)) {
      errors.push(`Invalid confidenceScore: ${e.confidenceScore}`);
    }
  }

  // Validate location if present
  if (e.location !== undefined && e.location !== null) {
    const loc = e.location as Record<string, unknown>;
    if (typeof loc !== 'object') {
      errors.push('Location is not an object');
    } else {
      if (typeof loc.lat !== 'number' || !Number.isFinite(loc.lat as number)) {
        errors.push('Invalid location lat');
      }
      if (typeof loc.lng !== 'number' || !Number.isFinite(loc.lng as number)) {
        errors.push('Invalid location lng');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
