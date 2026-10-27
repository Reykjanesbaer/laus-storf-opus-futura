'use strict';

// TEMPORARY diagnostic. Remove after Opus Futura mapping is verified.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../scripts/sync-jobs.js');
const P = require('../scripts/lib/provider.js');

test('inspect real Opus Futura public feed schema', { timeout: 40000 }, async () => {
  const raw = await S.fetchJson(S.DEFAULT_URL, { retries: 1, timeoutMs: 15000 });
  const lines = P.describeStructure(raw, { samples: true, maxDepth: 9 });
  console.log('OPUS_SCHEMA_BEGIN');
  for (const line of lines) {
    // Avoid publishing rich descriptions or raw application URLs in CI logs.
    if (/HTML|vefslóð/i.test(line)) console.log(line.replace(/ : "[^"]*"$/, ''));
    else console.log(line.slice(0, 260));
  }
  console.log('OPUS_SCHEMA_END');
  assert.ok(lines.length > 0);
});
