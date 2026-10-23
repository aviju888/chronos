/** Explicit, resumable network audit. Never runs during normal tests or builds.
 * Runs the real pipeline against Wikimedia, with model availability disabled.
 * This tests whether curated topics remain usable under provider failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { runChronos } from '../modern/lib/chronos/pipeline';
import catalog from '../modern/lib/chronos/surprise-topics.json';
import { surpriseQuery } from '../modern/lib/chronos/discovery';
import { initialState, reducer } from '../modern/components/chronos/useChronos';

const output = process.env.CHRONOS_EVAL_OUTPUT;
if (!output) throw new Error('Set CHRONOS_EVAL_OUTPUT to a local receipt directory. This command makes real Wikimedia requests.');
fs.mkdirSync(output, {recursive:true});
delete process.env.GROQ_API_KEY; // Isolated child process; no paid model calls in this audit.
const limit = Number(process.env.CHRONOS_EVAL_LIMIT ?? catalog.length);
let next = 0, completed = 0, rateLimited = false;
const results: unknown[] = [];
async function check(topic: typeof catalog[number]) {
  const dest = path.join(output!, `${topic.id}.json`);
  if (fs.existsSync(dest)) return JSON.parse(fs.readFileSync(dest, 'utf8'));
  const query = surpriseQuery(topic);
  let state = reducer(initialState, {type:'start', query, mode:'quick', replay:false});
  const started = Date.now();
  let error: string | undefined;
  try {
    await runChronos({query, range:topic.range, mode:'quick'}, (event, data) => {
      state = reducer(state, {type:'frame', event, data, at:Date.now()});
    }, AbortSignal.timeout(90000), {live:true, pace:false, fixtureFallback:false});
  } catch (err) { error = String(err); }
  // Do not turn an upstream quota response into hundreds of further requests.
  if (/429|rate limit/i.test(error ?? '') || state.traces.some(t => /429|rate limit/i.test(t.text))) rateLimited = true;
  const events = Object.values(state.events);
  const sourced = events.filter(e => e.citations.some(c => ['wikipedia','wikidata'].includes(c.source) && c.url?.startsWith('https://')));
  const reasons = [];
  if (error) reasons.push('pipeline_error');
  if (JSON.stringify(state.intent?.range) !== JSON.stringify(topic.range)) reasons.push('range_mismatch');
  if (events.length < 5) reasons.push('fewer_than_5_events');
  if (sourced.length < 3) reasons.push('fewer_than_3_source_backed_events');
  if (new Set(events.map(e => e.year)).size < Math.min(3, topic.range.end-topic.range.start+1)) reasons.push('insufficient_date_variety');
  if (events.some(e => e.year > topic.range.end || (e.endYear ?? e.year) < topic.range.start)) reasons.push('non_overlapping_events');
  if (!state.narrative) reasons.push('missing_story');
  const result = {id:topic.id, topic:topic.topic, query, range:topic.range, article:state.intent?.article, mode:'live-sources-model-unavailable',
    seconds:Math.round((Date.now()-started)/100)/10, eventCount:events.length, sourceBackedEvents:sourced.length,
    distinctYears:new Set(events.map(e=>e.year)).size, passed:!reasons.length, reasons, error,
    sourceFailures:Object.values(state.tasks).filter(t => t.status==='failed').map(t=>t.id)};
  fs.writeFileSync(dest, JSON.stringify(result,null,2));
  fs.writeFileSync(path.join(output!, `${topic.id}.state.json`), JSON.stringify(state));
  return result;
}
await Promise.all(Array.from({length:1}, async () => {
  while(!rateLimited && next < Math.min(limit,catalog.length)) {
    const topic = catalog[next++];
    const result = await check(topic); results.push(result); completed++;
    if (completed%10===0 || !result.passed) console.log(JSON.stringify({completed, topic:topic.topic, passed:result.passed, reasons:result.reasons}));
    if (!rateLimited) await new Promise(resolve => setTimeout(resolve, 10000));
  }
}));
fs.writeFileSync(path.join(output,'summary.json'), JSON.stringify({total:results.length, interrupted:rateLimited ? 'upstream_rate_limit' : null, results},null,2));
console.log(rateLimited ? 'Audit stopped at upstream rate limit:' : 'Audit complete:', results.length);
