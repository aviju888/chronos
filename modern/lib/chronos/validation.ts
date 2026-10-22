/* ─────────────────────────────────────────────────────────
 * VALIDATION — ported from aviju888/chronos lib/validation.ts.
 * Guards model output before it becomes a SourceRecord.
 * ───────────────────────────────────────────────────────── */

export function validateCoordinates(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function validateYear(year: unknown): number | null {
  if (typeof year !== "number" || !Number.isFinite(year) || !Number.isInteger(year)) return null;
  if (year === 0) return null; // there is no year 0
  if (year < -10000 || year > 2100) return null;
  return year;
}

export function validateTimeRange(start: unknown, end: unknown): { start: number; end: number } | null {
  const s = validateYear(start);
  const e = validateYear(end);
  if (s === null || e === null || s >= e) return null;
  if (e - s > 5000) return null;
  return { start: s, end: e };
}

const CATEGORIES = ["Politics", "War", "Culture", "Economy", "Religion", "Science", "Disaster", "Other"];

/** Required fields with the right types (ported, Disaster added) */
export function validateEvent(event: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!event || typeof event !== "object") return { valid: false, errors: ["Event is not an object"] };
  const e = event as Record<string, unknown>;
  if (typeof e.title !== "string" || e.title.trim().length === 0) errors.push("Missing or empty title");
  if (typeof e.year !== "number" || !Number.isFinite(e.year) || !Number.isInteger(e.year)) errors.push("Invalid year");
  else if (e.year === 0) errors.push("Year 0 does not exist");
  if (typeof e.summary !== "string" || e.summary.trim().length === 0) errors.push("Missing or empty summary");
  if (typeof e.category === "string" && !CATEGORIES.includes(e.category)) errors.push(`Invalid category: ${e.category}`);
  if (e.location !== undefined && e.location !== null) {
    const loc = e.location as Record<string, unknown>;
    if (typeof loc !== "object") errors.push("Location is not an object");
    else {
      if (typeof loc.lat !== "number" || !Number.isFinite(loc.lat)) errors.push("Invalid location lat");
      if (typeof loc.lng !== "number" || !Number.isFinite(loc.lng)) errors.push("Invalid location lng");
    }
  }
  return { valid: errors.length === 0, errors };
}

/** LLMs return "1776" or "-44" as strings; coerce before validating */
export function coerceYear(value: unknown): number | null {
  if (typeof value === "string" && /^-?\d{1,5}$/.test(value.trim())) return validateYear(parseInt(value, 10));
  return validateYear(value);
}
