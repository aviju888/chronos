import { useState } from 'react';
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
beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const event = (FIXTURES[0].frames.find(f => f.event === 'event')!.data as {event: ChronosEvent}).event;
function Harness() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Open event</button><EventDetail event={open ? event : null} live={false} onClose={() => setOpen(false)} /></>;
}
it.each(['Escape', 'Close'])('restores the connected event trigger after %s', dismissal => {
  render(<Harness />);
  const trigger = screen.getByRole('button', {name: 'Open event'});
  trigger.focus(); fireEvent.click(trigger);
  const close = screen.getByRole('button', {name: 'Close'});
  expect(document.activeElement).toBe(close);
  if (dismissal === 'Escape') fireEvent.keyDown(window, {key: 'Escape'});
  else fireEvent.click(close);
  expect(document.activeElement).toBe(trigger);
});
