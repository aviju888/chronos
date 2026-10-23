import { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EventDetail } from '../EventDetail';
import { FIXTURES } from '../../../lib/chronos/fixtures';
import type { ChronosEvent } from '../../../lib/chronos/types';

vi.mock('motion/react', async () => {
  const React = await import('react');
  return {
    useReducedMotion: () => true,
    AnimatePresence: ({children}: {children: React.ReactNode}) => children,
    motion: new Proxy({}, {get: (_target, tag: string) => React.forwardRef(({initial, animate, exit, transition, ...props}: Record<string, unknown>, ref) => React.createElement(tag, {...props, ref}))}),
  };
});
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn()}));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const event = (FIXTURES[0].frames.find(f => f.event === 'event')!.data as {event: ChronosEvent}).event;
function Harness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return <><button ref={triggerRef} onClick={() => setOpen(true)}>Open event</button><EventDetail event={open ? event : null} live={false} onClose={() => setOpen(false)} returnFocusRef={triggerRef} /></>;
}
it.each(['Escape', 'Close'])('returns focus to the connected trigger after %s', dismissal => {
  render(<Harness />);
  const trigger = screen.getByRole('button', {name: 'Open event'});
  trigger.focus(); fireEvent.click(trigger);
  const close = screen.getByRole('button', {name: 'Close event details'});
  expect(document.activeElement).toBe(close);
  if (dismissal === 'Escape') fireEvent.keyDown(close, {key: 'Escape'});
  else fireEvent.click(close);
  expect(document.activeElement).toBe(trigger);
});

it('keeps mobile evidence in the document without covering or locking the page', () => {
  vi.stubGlobal('matchMedia', () => ({matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn()}));
  document.body.style.overflow = 'auto';
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', {name: 'Open event'}));
  expect(screen.queryByRole('dialog')).toBeNull();
  const region = screen.getByRole('region', {name: `Sources for ${event.title}`});
  expect(region.className).not.toMatch(/fixed|absolute/);
  expect(document.body.style.overflow).toBe('auto');
  expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
  document.body.style.overflow = '';
});

it('returns to the event trigger after a Safari-style tap that did not focus it', () => {
  render(<Harness />);
  const trigger = screen.getByRole('button', {name:'Open event'});
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', {name:'Close event details'}));
  expect(document.activeElement).toBe(trigger);
});
