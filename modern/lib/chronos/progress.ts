import type { ChronosState } from '../../components/chronos/useChronos';

/** Progress follows received frames, never an elapsed-time estimate. */
export function progressLabel(state: ChronosState): string {
  if (state.status === 'error') return 'Investigation interrupted';
  if (state.stopped) return 'Stopped early';
  if (state.status === 'done') return 'Assembled';
  if (state.narrative) return 'Writing the story';
  if (!state.intent) return 'Finding your topic';
  const sourcesFinished = ['llm', 'wikipedia', 'wikidata'].every(id => ['done', 'failed', 'skipped'].includes(state.tasks[id as keyof typeof state.tasks].status));
  if (sourcesFinished) return 'Connecting the timeline';
  return state.order.length ? 'Building your timeline' : 'Looking for events';
}
