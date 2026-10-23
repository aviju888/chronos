import type { ChronosState } from '../../components/chronos/useChronos';
import { formatRange, formatYear } from './time';
import { parseNarrative } from './cite';

export const ARCHIVE_KEY = 'chronos_modern_archives_v1';
export type Archive = { version: 1; id: string; savedAt: number; state: ChronosState };
type Store = Pick<Storage, 'getItem' | 'setItem'>;
type ArchiveResult = { items: Archive[]; error: string | null };
const unavailable = 'Archives are unavailable in this browser. You can still export this timeline.';
const record = (x: unknown): x is Record<string, any> => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every(v => typeof v === 'string');
const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x);

function validArchive(x: unknown): x is Archive {
  if (!record(x) || x.version !== 1 || typeof x.id !== 'string' || !finite(x.savedAt) || !record(x.state)) return false;
  const s = x.state;
  if (!['done', 'error'].includes(s.status) || typeof s.query !== 'string' || !['quick', 'deep'].includes(s.mode)
    || typeof s.narrative !== 'string' || !strings(s.order) || !record(s.events) || !record(s.alias)
    || !Array.isArray(s.traces) || !s.traces.every((t: any) => record(t) && typeof t.text === 'string' && typeof t.source === 'string' && typeof t.kind === 'string')
    || !Array.isArray(s.eras) || !Array.isArray(s.notices) || !record(s.tasks) || !finite(s.mergeCount)
    || !finite(s.startedAt) || !finite(s.finishedAt) || typeof s.stopped !== 'boolean'
    || typeof s.replay !== 'boolean' || !(s.error === null || typeof s.error === 'string')
    || ![null, 'model', 'composed'].includes(s.narrativeSource)) return false;
  if (s.intent !== null && (!record(s.intent) || typeof s.intent.topic !== 'string' || !record(s.intent.range)
    || !finite(s.intent.range.start) || !finite(s.intent.range.end) || typeof s.intent.queryType !== 'string'
    || (s.intent.article && (typeof s.intent.article.title !== 'string' || typeof s.intent.article.url !== 'string')))) return false;
  if (!Object.values(s.alias).every(v => typeof v === 'string') || !s.notices.every((n: any) => record(n) && ['replay', 'fallback', 'partial'].includes(n.kind) && typeof n.text === 'string')) return false;
  if (!['llm', 'wikidata', 'wikipedia', 'dedup'].every(id => record(s.tasks[id]) && typeof s.tasks[id].label === 'string' && ['pending', 'running', 'done', 'failed', 'skipped'].includes(s.tasks[id].status)
    && (s.tasks[id].steps === undefined || (Array.isArray(s.tasks[id].steps) && s.tasks[id].steps.every((t: any) => record(t) && typeof t.label === 'string' && typeof t.meta === 'string'))))) return false;
  if (!s.eras.every((e: any) => record(e) && typeof e.id === 'string' && typeof e.title === 'string' && finite(e.startYear) && finite(e.endYear) && finite(e.lane))) return false;
  return s.order.length > 0 && Object.keys(s.events).length === s.order.length && s.order.every((id: string) => {
    const e = s.events[id];
    return record(e) && e.id === id && typeof e.title === 'string' && typeof e.summary === 'string'
      && finite(e.year) && (e.endYear === undefined || finite(e.endYear)) && finite(e.weight) && typeof e.category === 'string' && typeof e.confidence === 'string'
      && ['wikipediaTitle', 'wikipediaUrl', 'qid', 'exactDate'].every(k => e[k] === undefined || typeof e[k] === 'string')
      && (e.yearConflicts === undefined || (Array.isArray(e.yearConflicts) && e.yearConflicts.every((c: any) => record(c) && finite(c.year) && typeof c.source === 'string')))
      && strings(e.sources) && e.sources.every((v: string) => ['llm', 'wikipedia', 'wikidata'].includes(v)) && strings(e.mergedFrom)
      && Array.isArray(e.citations) && e.citations.every((c: any) => record(c) && typeof c.label === 'string' && typeof c.source === 'string' && (c.url === undefined || typeof c.url === 'string'))
      && Array.isArray(e.facts) && e.facts.every((f: any) => record(f) && typeof f.label === 'string' && typeof f.value === 'string' && typeof f.source === 'string')
      && (!e.location || (record(e.location) && finite(e.location.lat) && finite(e.location.lng) && (e.location.name === undefined || typeof e.location.name === 'string')))
      && (!e.thumbnail || (record(e.thumbnail) && typeof e.thumbnail.url === 'string'));
  });
}

export function readArchives(store?: Store): ArchiveResult {
  try {
    const raw = (store ?? localStorage).getItem(ARCHIVE_KEY);
    if (!raw) return { items: [], error: null };
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Invalid archive');
    const items = parsed.filter(validArchive);
    return { items, error: items.length === parsed.length ? null : 'Some archives could not be read. Existing data has been kept.' };
  } catch { return { items: [], error: unavailable }; }
}

export function snapshot(state: ChronosState): Archive {
  return {
    version: 1, id: `${state.startedAt}-${state.runId}`, savedAt: state.finishedAt ?? Date.now(),
    state: { ...state, merges: [], traces: [] },
  };
}

export function saveArchive(archive: Archive, store?: Store): ArchiveResult {
  const previous = readArchives(store);
  if (previous.error) return previous;
  const items = [archive, ...previous.items.filter(a => a.id !== archive.id)];
  try { (store ?? localStorage).setItem(ARCHIVE_KEY, JSON.stringify(items)); return { items, error: null }; }
  catch { return { ...previous, error: 'This timeline could not be saved. Export it, or remove an old archive to free space.' }; }
}

export function removeArchive(id: string, store?: Store): ArchiveResult {
  const previous = readArchives(store);
  if (previous.error) return previous;
  const items = previous.items.filter(a => a.id !== id);
  try { (store ?? localStorage).setItem(ARCHIVE_KEY, JSON.stringify(items)); return { items, error: null }; }
  catch { return { ...previous, error: 'The archive could not be removed.' }; }
}

export function readClassicArchives(): { id: string; title: string }[] {
  try {
    const entries: unknown = JSON.parse(localStorage.getItem('chronos_archives') ?? '[]');
    return Array.isArray(entries) ? entries.filter(x => record(x) && typeof x.id === 'string' && typeof x.region === 'string').map(x => ({id: x.id, title: x.region})) : [];
  } catch { return []; }
}

export function exportText(archive: Archive): string {
  const s = archive.state;
  const events = s.order.map(id => s.events[id]);
  const numbers = new Map<string, number>();
  events.forEach((e, i) => { numbers.set(e.id, i + 1); e.mergedFrom.forEach(id => numbers.set(id, i + 1)); });
  const story = parseNarrative(s.narrative).map(t => t.kind === 'text' ? t.text : numbers.has(t.id) ? `[${numbers.get(t.id)}]` : '[unresolved citation]').join('');
  return [
    s.intent?.topic ?? s.query,
    s.intent ? formatRange(s.intent.range.start, s.intent.range.end) : '',
    `Saved ${new Date(archive.savedAt).toISOString()}`,
    s.stopped ? 'Stopped early — partial investigation.' : s.status === 'error' ? `Incomplete: ${s.error}` : '',
    ...s.notices.map(n => n.text), '', story, '', 'EVENTS & SOURCES', '',
    ...events.map((e, i) => [`[${i + 1}] ${formatYear(e.year)} — ${e.title}`, e.summary, `Sources: ${e.sources.join(', ')} · Confidence: ${e.confidence}`,
      ...e.citations.map(c => `- ${c.label}${c.url ? `: ${c.url}` : ''}${c.detail ? ` (${c.detail})` : ''}`), ''].join('\n')),
  ].join('\n');
}

export function downloadArchive(archive: Archive, format: 'json' | 'txt') {
  const data = format === 'json' ? JSON.stringify(archive, null, 2) : exportText(archive);
  const url = URL.createObjectURL(new Blob([data], { type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `chronos-${(archive.state.intent?.topic ?? archive.state.query).replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 70)}.${format}`;
  document.body.append(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
