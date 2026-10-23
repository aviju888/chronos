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
  // Recording path guarantees no external model or Wikimedia calls.
  const response = await api.fetch(request({query:'Roman Empire 27 BCE - 476 CE',mode:'quick',replay:true}));
  assert.equal(response.status, 200);
  const frames = await response.text();
  assert.ok(frames.includes('event: intent') && frames.includes('event: event') && frames.includes('event: done'));
  assert.ok(!frames.includes('event: error'));
  console.log('Native Node API: import, validation and recorded SSE replay PASS');
} finally {
  rmSync(output, {recursive:true, force:true});
}
