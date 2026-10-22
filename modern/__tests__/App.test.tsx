import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../App';
import { setPreferences } from '../lib/preferences';
vi.mock('../components/chronos/ChronosApp', () => ({ ChronosApp: () => <h1>Owned interface fixture</h1> }));
vi.mock('../lib/sfx', () => ({ previewSfx: vi.fn() }));
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); setPreferences({ theme: 'system', sfx: false }); localStorage.clear(); document.documentElement.classList.remove('dark'); });
it('renders and toggles without storage while retaining a full-document Classic link', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Denied'); });
  render(<App />);
  expect(screen.getByRole('link', { name: 'Classic' }).getAttribute('href')).toBe('/classic/');
  const sound = screen.getByRole('button', { name: 'Turn sound on' });
  expect(sound.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'Use dark theme' }));
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  fireEvent.click(sound);
  expect(screen.getByRole('button', { name: 'Turn sound off' }).getAttribute('aria-pressed')).toBe('true');
});
it('visiting modern leaves Classic keys untouched', () => {
  localStorage.setItem('chronos-theme', 'dark');
  localStorage.setItem('chronos_archives', 'owned-archives');
  localStorage.setItem('chronos_chat_owned', 'owned-chat');
  const write = vi.spyOn(Storage.prototype, 'setItem');
  render(<App />);
  expect(write).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Use dark theme' }));
  expect(write.mock.calls.map(([key]) => key)).toEqual(['chronos-modern-theme','chronos-modern-sfx']);
  expect(localStorage.getItem('chronos-theme')).toBe('dark');
  expect(localStorage.getItem('chronos_archives')).toBe('owned-archives');
  expect(localStorage.getItem('chronos_chat_owned')).toBe('owned-chat');
});
