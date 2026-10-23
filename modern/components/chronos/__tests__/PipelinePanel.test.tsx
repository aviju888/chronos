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
const running: ChronosState = {...initialState,runId:1,status:'running',startedAt:Date.now(),traces:[{source:'intent',kind:'note',text:'Reading the query'}]};
const researched: ChronosState = {...running,traces:[...running.traces,{source:'wikipedia',kind:'note',text:'Found the source article'}]};
const done: ChronosState = {...researched,status:'done',finishedAt:Date.now()};
it('reserves no source column until actual research arrives', () => {
  const {rerender} = render(<PipelineSection state={running} onStop={() => {}} />);
  const panel = screen.getByRole('region', {name:'Investigation progress'});
  expect(panel.getAttribute('data-source-ready')).toBe('false');
  expect(screen.queryByText('Source details')).toBeNull();
  rerender(<PipelineSection state={researched} onStop={() => {}} />);
  expect(screen.getByRole('region', {name:'Investigation progress'})).toBe(panel);
  expect(panel.getAttribute('data-source-ready')).toBe('true');
  expect(screen.getByRole('heading', {name:'Source details'})).toBeTruthy();
});
it('collapses on completion and allows reopening; a new run opens again', () => {
  const {rerender} = render(<PipelineSection state={researched} onStop={() => {}} />);
  fireEvent.click(screen.getByRole('button', {name:'Collapse research details'}));
  fireEvent.click(screen.getByRole('button', {name:'Expand research details'}));
  rerender(<PipelineSection state={done} onStop={() => {}} />);
  expect(screen.getByRole('button', {name:'Expand research details'}).getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('heading', {name:'Source details'})).toBeNull();
  fireEvent.click(screen.getByRole('button', {name:'Expand research details'}));
  expect(screen.getByRole('heading', {name:'Source details'})).toBeTruthy();
  rerender(<PipelineSection state={{...running,runId:2}} onStop={() => {}} />);
  expect(screen.getByRole('button', {name:'Collapse research details'}).getAttribute('aria-expanded')).toBe('true');
  expect(screen.queryByText('Source details')).toBeNull();
});
it('keeps interrupted and failed research available for inspection', () => {
  const onStop = vi.fn();
  const {rerender} = render(<PipelineSection state={running} onStop={onStop} />);
  fireEvent.click(screen.getByRole('button', {name:'Stop research'}));
  expect(onStop).toHaveBeenCalledOnce();
  for (const state of [{...done,stopped:true},{...researched,status:'error' as const}]) {
    rerender(<PipelineSection state={state} onStop={onStop} />);
    expect(screen.getByRole('button', {name:'Collapse research details'})).toBeTruthy();
    expect(screen.getByRole('heading', {name:'Source details'})).toBeTruthy();
    expect(screen.queryByRole('button', {name:'Stop research'})).toBeNull();
  }
});
