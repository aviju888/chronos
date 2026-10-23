import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PromptComposer } from '../PromptComposer';

const suggestions = ['Ancient Rome', 'Edo Japan', 'The space race'];
const submit = vi.fn();
let motionChanged: (() => void) | undefined;
let reduced = false;
function Harness() {
  const [value, setValue] = useState('');
  return <PromptComposer value={value} onChange={setValue} onSubmit={submit} mode="quick" onModeChange={() => {}} suggestions={suggestions} tall />;
}
const input = () => screen.getByRole('textbox', { name: 'Topic, place or period' }) as HTMLTextAreaElement;
const shown = () => document.querySelector('[data-prompt-suggestion]')?.textContent;

beforeEach(() => {
  vi.useFakeTimers(); reduced = false; motionChanged = undefined; submit.mockClear();
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener: (_: string, cb: () => void) => { motionChanged = cb; }, removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('cycles examples without inserting text or submitting a query', () => {
  render(<Harness />);
  expect(shown()).toBe('Ancient Rome');
  act(() => { vi.advanceTimersByTime(4500); });
  expect(shown()).toBe('Edo Japan');
  expect(input().value).toBe('');
  expect(submit).not.toHaveBeenCalled();
});

it('Tab accepts the displayed example once, then allows normal tab navigation', () => {
  render(<Harness />);
  act(() => { vi.advanceTimersByTime(4500); });
  expect(fireEvent.keyDown(input(), { key: 'Tab' })).toBe(false);
  expect(input().value).toBe('Edo Japan');
  expect(fireEvent.keyDown(input(), { key: 'Tab' })).toBe(true);
  expect(submit).not.toHaveBeenCalled();
  fireEvent.keyDown(input(), { key: 'Enter' });
  expect(submit).toHaveBeenCalledWith('Edo Japan');
});

it('does not intercept reverse tab, modified tab or IME composition', () => {
  render(<Harness />);
  for (const modifiers of [{ shiftKey: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }]) {
    expect(fireEvent.keyDown(input(), { key: 'Tab', ...modifiers })).toBe(true);
    expect(input().value).toBe('');
  }
});

it('stops suggesting while the user types, then resumes after clearing', () => {
  render(<Harness />);
  fireEvent.change(input(), { target: { value: 'My own topic' } });
  act(() => { vi.advanceTimersByTime(9000); });
  expect(shown()).toBeUndefined();
  expect(fireEvent.keyDown(input(), { key: 'Tab' })).toBe(true);
  expect(input().value).toBe('My own topic');
  fireEvent.change(input(), { target: { value: '' } });
  expect(shown()).toBe('Ancient Rome');
  act(() => { vi.advanceTimersByTime(4500); });
  expect(shown()).toBe('Edo Japan');
});

it('keeps a static example for reduced motion while retaining Tab completion', () => {
  reduced = true;
  render(<Harness />);
  act(() => { vi.advanceTimersByTime(18000); });
  expect(shown()).toBe('Ancient Rome');
  expect((document.querySelector('[data-prompt-suggestion]') as HTMLElement).style.animation).toBe('');
  fireEvent.keyDown(input(), { key: 'Tab' });
  expect(input().value).toBe('Ancient Rome');
});

it('cleans up its timer when unmounted', () => {
  const { unmount } = render(<Harness />);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
