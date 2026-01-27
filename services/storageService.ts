import { TimelineData } from '../types';

const ARCHIVES_KEY = 'chronos_archives';
const CHAT_PREFIX = 'chronos_chat_';

// Approximate max localStorage size (5MB typical, we use 4MB to be safe)
const MAX_STORAGE_BYTES = 4 * 1024 * 1024;

export interface StorageResult {
  success: boolean;
  error?: string;
  cleanedUp?: number; // Number of timelines auto-deleted
}

/**
 * Estimate the byte size of a string in localStorage
 */
function getByteSize(str: string): number {
  return new Blob([str]).size;
}

/**
 * Get current localStorage usage estimate
 */
export function getStorageUsage(): { used: number; total: number; percent: number } {
  let used = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      used += getByteSize(key) + getByteSize(localStorage.getItem(key) || '');
    }
  }
  return {
    used,
    total: MAX_STORAGE_BYTES,
    percent: Math.round((used / MAX_STORAGE_BYTES) * 100)
  };
}

/**
 * Load timelines from localStorage with validation
 */
export function loadTimelines(): TimelineData[] {
  try {
    const saved = localStorage.getItem(ARCHIVES_KEY);
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    // Basic validation - ensure each timeline has required fields
    return parsed.filter((t: any) =>
      t &&
      typeof t.id === 'string' &&
      typeof t.region === 'string' &&
      typeof t.createdAt === 'number' &&
      t.timeRange && typeof t.timeRange.start === 'number' && typeof t.timeRange.end === 'number' &&
      Array.isArray(t.eras) &&
      Array.isArray(t.events)
    );
  } catch (e) {
    console.error('Failed to load archives:', e);
    return [];
  }
}

/**
 * Save timelines to localStorage with auto-cleanup if quota exceeded
 */
export function saveTimelines(timelines: TimelineData[]): StorageResult {
  const data = JSON.stringify(timelines);

  // First attempt: try to save directly
  try {
    localStorage.setItem(ARCHIVES_KEY, data);
    return { success: true };
  } catch (e) {
    // Likely quota exceeded, try auto-cleanup
    console.warn('localStorage save failed, attempting auto-cleanup:', e);
  }

  // If we have 2 or fewer timelines, we can't clean up much
  if (timelines.length <= 2) {
    return {
      success: false,
      error: 'Storage quota exceeded. Please delete some timelines manually.'
    };
  }

  // Sort by createdAt and remove oldest timelines until we can save
  const sorted = [...timelines].sort((a, b) => a.createdAt - b.createdAt);
  let cleanedUp = 0;

  while (sorted.length > 2) {
    // Remove oldest timeline
    const removed = sorted.shift();
    cleanedUp++;

    // Also clean up its chat history
    if (removed) {
      try {
        localStorage.removeItem(`${CHAT_PREFIX}${removed.id}`);
      } catch {
        // Ignore chat cleanup errors
      }
    }

    // Try to save again
    try {
      const newData = JSON.stringify(sorted);
      localStorage.setItem(ARCHIVES_KEY, newData);
      return {
        success: true,
        cleanedUp
      };
    } catch {
      // Still not enough space, continue cleanup
    }
  }

  // Last resort - we removed as much as we could
  return {
    success: false,
    error: 'Storage quota exceeded even after cleanup. Please clear browser data.',
    cleanedUp
  };
}

/**
 * Delete a specific timeline and its chat history
 */
export function deleteTimeline(timelines: TimelineData[], id: string): TimelineData[] {
  // Remove chat history
  try {
    localStorage.removeItem(`${CHAT_PREFIX}${id}`);
  } catch {
    // Ignore
  }

  return timelines.filter(t => t.id !== id);
}

/**
 * Clear all Chronos data from localStorage
 */
export function clearAllData(): void {
  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key === ARCHIVES_KEY || key.startsWith(CHAT_PREFIX) || key === 'chronos-theme')) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  });
}
