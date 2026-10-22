/** Standalone preferences never read or write Classic archives, chats, or theme. */
export type Preferences = { theme: 'system' | 'light' | 'dark'; sfx: boolean };
const defaults: Preferences = { theme: 'system', sfx: false };
let sessionPreferences: Preferences | undefined;

export function getPreferences(): Preferences {
  if (sessionPreferences) return sessionPreferences;
  try {
    const theme = localStorage.getItem('chronos-modern-theme');
    sessionPreferences = {
      theme: theme === 'light' || theme === 'dark' ? theme : 'system',
      sfx: localStorage.getItem('chronos-modern-sfx') === 'true',
    };
  } catch { sessionPreferences = { ...defaults }; }
  return sessionPreferences;
}

export function setPreferences(preferences: Preferences) {
  // Session controls keep working even when storage is blocked or full.
  sessionPreferences = { ...preferences };
  try {
    localStorage.setItem('chronos-modern-theme', preferences.theme);
    localStorage.setItem('chronos-modern-sfx', String(preferences.sfx));
  } catch { /* Reload persistence is unavailable; keep the in-memory choice. */ }
}
