import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPreferences, setPreferences } from '../preferences';

afterEach(() => { vi.restoreAllMocks(); setPreferences({ theme: 'system', sfx: false }); localStorage.clear(); });
describe('modern preferences', () => {
  it('defaults sound off and never writes Classic keys', () => {
    localStorage.setItem('chronos-theme', 'dark');
    localStorage.setItem('chronos_archives', '[{"id":"owned"}]');
    localStorage.setItem('chronos_chat_owned', '["keep"]');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(getPreferences().sfx).toBe(false);
    setPreferences({ theme: 'dark', sfx: true });
    expect(write.mock.calls.map(([key]) => key)).toEqual(['chronos-modern-theme', 'chronos-modern-sfx']);
    expect(localStorage.getItem('chronos_archives')).toBe('[{"id":"owned"}]');
    expect(localStorage.getItem('chronos_chat_owned')).toBe('["keep"]');
    expect(localStorage.getItem('chronos-theme')).toBe('dark');
  });
  it('keeps the session preference when writes are denied but reads still work', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota exceeded'); });
    setPreferences({ theme: 'dark', sfx: true });
    expect(getPreferences()).toEqual({ theme: 'dark', sfx: true });
  });
  it('survives denied storage reads and writes', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Denied'); });
    expect(getPreferences()).toEqual({ theme: 'system', sfx: false });
    expect(() => setPreferences({ theme: 'dark', sfx: true })).not.toThrow();
    expect(getPreferences()).toEqual({ theme: 'dark', sfx: true });
  });
});
