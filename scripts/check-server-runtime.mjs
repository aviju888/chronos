import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

// Preserve native ESM imports instead of bundling away deployment-only errors.
const output = mkdtempSync(path.join(tmpdir(), 'chronos-server-runtime-'));
try {
  const compiled = spawnSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'),
    '--outDir', output, '--noEmit', 'false', '--allowImportingTsExtensions', 'false', '--resolveJsonModule'], {stdio: 'inherit'});
  assert.equal(compiled.status, 0, 'Server runtime compilation');
  writeFileSync(path.join(output, 'package.json'), JSON.stringify({type: 'module'}));
  symlinkSync(path.resolve('node_modules'), path.join(output, 'node_modules'), 'dir');
  const {default: api} = await import(pathToFileURL(path.join(output, 'api/chronos/stream.js')).href);
  const request = body => new Request('http://chronos.test/api/chronos/stream', {
    method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body),
  });
  assert.equal((await api.fetch(new Request('http://chronos.test/api/chronos/stream'))).status, 405);
  assert.equal((await api.fetch(request({}))).status, 400);
  assert.equal((await api.fetch(request({query:'Rome',range:{start:0,end:100}}))).status, 400);
  assert.equal((await api.fetch(request({query:'Silk Road', replay:true}))).status, 400);
  // Explicit local harness: recordings are not reachable through the public handler.
  const {runChronos} = await import(pathToFileURL(path.join(output, 'modern/lib/chronos/pipeline.js')).href);
  const {sseResponse} = await import(pathToFileURL(path.join(output, 'modern/lib/sse.js')).href);
  const response = sseResponse(request({}), (send, signal) => runChronos({query:'Roman Empire 27 BCE - 476 CE',mode:'quick'}, send, signal, {replay:true, pace:false}));
  assert.equal(response.status, 200);
  const frames = await response.text();
  assert.ok(frames.includes('event: intent') && frames.includes('event: event') && frames.includes('event: done'));
  assert.ok(!frames.includes('event: error'));
  console.log('Native Node API: import, live-only API validation and isolated local fixture SSE PASS');
} finally {
  rmSync(output, {recursive:true, force:true});
}
