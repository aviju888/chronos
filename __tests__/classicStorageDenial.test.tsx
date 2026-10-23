import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { OnboardingOverlay, useOnboarding } from '../components/OnboardingOverlay';

function ThemeProbe() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}
function TourProbe() {
  const { showOnboarding, resetOnboarding, completeOnboarding } = useOnboarding();
  return <><span>{showOnboarding ? 'tour open' : 'tour closed'}</span><button onClick={resetOnboarding}>Reset tour</button><button onClick={completeOnboarding}>Complete tour</button></>;
}
const denied = () => { throw new DOMException('Storage denied', 'SecurityError'); };
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.documentElement.classList.remove('dark'); });

describe('Classic storage denial', () => {
  it('keeps the system theme and session toggles when reads and writes are denied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
    expect(screen.getByRole('button').textContent).toBe('dark');
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
  it('honors a saved theme even when writes are denied', () => {
    localStorage.setItem('chronos-theme', 'light');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
    expect(screen.getByRole('button').textContent).toBe('light');
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button').textContent).toBe('dark');
    expect(localStorage.getItem('chronos-theme')).toBe('light');
  });
  it('keeps onboarding controls usable when all storage operations are denied', () => {
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) vi.spyOn(Storage.prototype, method).mockImplementation(denied);
    render(<TourProbe />);
    expect(screen.getByText('tour open')).toBeTruthy();
    fireEvent.click(screen.getByText('Complete tour'));
    expect(screen.getByText('tour closed')).toBeTruthy();
    fireEvent.click(screen.getByText('Reset tour'));
    expect(screen.getByText('tour open')).toBeTruthy();
  });
  it('allows skipping the overlay when reading and saving completion are denied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
    const completed = vi.fn();
    render(<OnboardingOverlay forceShow onComplete={completed} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(completed).toHaveBeenCalledOnce();
  });
});
