import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PipelineSection } from '../ChronosApp';
import { initialState, type ChronosState } from '../useChronos';
vi.mock('../InvestigationMap', () => ({InvestigationMap: () => null}));
vi.mock('../DotMap', () => ({DotMap: () => null}));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn()}));
});
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
const running: ChronosState = {...initialState,runId:1,status:'running',startedAt:Date.now(),traces:[{source:'intent',kind:'note',text:'Reading the source article'}]};
const done: ChronosState = {...running,status:'done',finishedAt:Date.now()};
it('keeps the same expanded progress and source-detail elements when research finishes', () => {
  const {rerender} = render(<PipelineSection state={running} onStop={() => {}} />);
  const panel = screen.getByRole('region', {name:'Investigation progress'});
  const source = screen.getByRole('button', {name:'Source details'});
  expect(source.getAttribute('aria-expanded')).toBe('true');
  const style = panel.className;
  rerender(<PipelineSection state={done} onStop={() => {}} />);
  expect(screen.getByRole('region', {name:'Investigation progress'})).toBe(panel);
  expect(panel.className).toBe(style);
  expect(screen.getByRole('button', {name:'Source details'})).toBe(source);
  expect(source.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('button', {name:'Sources & process'}).getAttribute('aria-expanded')).toBe('true');
});
it('respects an intentional collapse across completion and opens details for a new investigation', () => {
  const {rerender} = render(<PipelineSection state={running} onStop={() => {}} />);
  fireEvent.click(screen.getByRole('button', {name:'Source details'}));
  fireEvent.click(screen.getByRole('button', {name:'Sources & process'}));
  rerender(<PipelineSection state={done} onStop={() => {}} />);
  expect(screen.getByRole('button', {name:'Sources & process'}).getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(screen.getByRole('button', {name:'Sources & process'}));
  expect(screen.getByRole('button', {name:'Source details'}).getAttribute('aria-expanded')).toBe('false');
  rerender(<PipelineSection state={{...running,runId:2}} onStop={() => {}} />);
  expect(screen.getByRole('button', {name:'Sources & process'}).getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('button', {name:'Source details'}).getAttribute('aria-expanded')).toBe('true');
});
