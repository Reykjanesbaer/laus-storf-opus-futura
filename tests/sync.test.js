'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const P = require('../scripts/lib/provider.js');
const S = require('../scripts/sync-jobs.js');
const N = require('../storf/normalize.js');

const FEED = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/generic-feed.json'), 'utf8'));
const MAPPING_FILE = path.join(__dirname, 'fixtures/generic-mapping.json');
const MAPPING = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
const NOW = Date.parse('2026-10-19T14:00:00Z');

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'storf-')); }

/* ---------- vörpunarvélin ---------- */

test('Opus Futura: staðfest tómt jobs-fylki skilar gildum tómlista', () => {
  const real = P.loadMapping();
  assert.equal(real.jobsPath, 'jobs');
  const { doc, stats } = S.buildFromRaw({ workplace: 'Reykjanesbær', jobs: [] }, real, NOW);
  assert.equal(stats.received, 0);
  assert.equal(stats.published, 0);
  assert.deepEqual(doc.jobs, []);
  assert.equal(N.validateDocument(doc).ok, true);
});

test('Opus Futura: ef jobs verður ekki tómt er óstaðfest vörpun höfnun, aldrei falskur tómlisti', () => {
  const real = P.loadMapping();
  assert.throws(
    () => S.buildFromRaw({ workplace: 'Reykjanesbær', jobs: [{ id: '1', title: 'Starf' }] }, real, NOW),
    (e) => e.code === 'MAPPING_UNCONFIGURED'
  );
});

test('Opus Futura: rangt gagnasnið er alltaf villa', () => {
  const real = P.loadMapping();
  for (const raw of [{}, { workplace: 'Reykjanesbær' }, { jobs: null }, { jobs: {} }, { jobs: '[]' }]) {
    assert.throws(() => S.buildFromRaw(raw, real, NOW), (e) => e.code === 'SHAPE');
  }
});

test('vörpun: gögn fara rétta leið — hlutur sem svið, HTML hreinsað, ógild slóð felld burt', () => {
  const { doc, stats } = S.buildFromRaw(FEED, MAPPING, NOW);
  const byId = Object.fromEntries(doc.jobs.map((j) => [j.id, j]));

  assert.deepEqual(Object.keys(byId).sort(), ['101', '102', '106', '107']);
  assert.equal(byId['101'].department, 'Menntasvið');
  assert.equal(byId['101'].deadline, '2026-10-26');
  assert.equal(byId['101'].publishedAt, '2026-10-05');
  assert.deepEqual(byId['101'].description, [
    { t: 'p', x: 'Fyrsta málsgrein & fleira.' },
    { t: 'h', x: 'Verkefni' },
    { t: 'ul', items: ['Eitt', 'Tvö'] }
  ]);
  assert.equal(byId['101'].applyUrl, 'https://example.org/a/apply');
  assert.equal(byId['102'].applyUrl, null, 'http-slóð er hafnað');
  assert.equal(byId['102'].detailUrl, 'https://example.org/b');
  assert.equal(byId['106'].isGeneral, true);
  assert.equal(byId['107'].applyUrl, null, 'javascript:-slóð er hafnað');
  assert.equal(byId['107'].detailUrl, null, 'slóð með notandanafni er hafnað');

  assert.deepEqual(stats, { received: 8, inactive: 1, invalid: 1, duplicates: 1, expired: 1, published: 4 });
  assert.equal(JSON.stringify(doc).includes('alert(1)'), false, 'script úr lýsingu birtist hvergi');
});

test('vörpun: skjalið sem er skrifað stenst eigin staðfestingu', () => {
  const { doc } = S.buildFromRaw(FEED, MAPPING, NOW);
  const v = N.validateDocument(doc);
  assert.equal(v.ok, true);
  assert.equal(v.droppedCount, 0);
  assert.equal(doc.fetchedAt, '2026-10-19T14:00:00Z');
});

test('vörpun: tómur listi í réttu sniði = „engin störf“, ekki villa', () => {
  const { doc, stats } = S.buildFromRaw({ payload: { items: [] } }, MAPPING, NOW);
  assert.equal(doc.count, 0);
  assert.deepEqual(doc.jobs, []);
  assert.equal(stats.published, 0);
});

test('vörpun: rangt snið er villa, ekki „engin störf“', () => {
  const bad = [{}, { payload: {} }, { payload: { items: 'texti' } }, { payload: { items: {} } }, [], null, 'texti', 5];
  bad.forEach((raw) => assert.throws(() => S.buildFromRaw(raw, MAPPING, NOW), (e) => e.code === 'SHAPE',
    'ætti að hafna: ' + JSON.stringify(raw)));
});

test('vörpun: ef flestar færslur eru ógildar hefur sniðið líklega breyst → villa', () => {
  const drifted = { payload: { items: [1, 2, 3, 4].map((n) => ({ ref: n, headline: 'Heiti', closes: '2026-12-31', state: 'open' })) } };
  assert.throws(() => S.buildFromRaw(drifted, MAPPING, NOW), (e) => e.code === 'QUALITY');
});

test('vörpun: ef stöðureitur hverfur úr öllum færslum er það villa, ekki „engin störf“', () => {
  const noStatus = { payload: { items: [1, 2, 3].map((n) => ({ ref: n, name: 'Heiti', closes: '2026-12-31', links: { apply: 'https://example.org/x' } })) } };
  assert.throws(() => S.buildFromRaw(noStatus, MAPPING, NOW), (e) => e.code === 'QUALITY');
});

test('vörpun: öll störf merkt lokuð í kerfinu = gilt „engin störf“', () => {
  const allClosed = { payload: { items: [1, 2].map((n) => ({ ref: n, name: 'Heiti', state: 'closed' })) } };
  const { doc, stats } = S.buildFromRaw(allClosed, MAPPING, NOW);
  assert.equal(doc.count, 0);
  assert.equal(stats.inactive, 2);
});

test('vörpun: leyfð lén takmarka slóðir', () => {
  const m = Object.assign({}, MAPPING, { allowedUrlHosts: ['opusfutura.com'] });
  const { doc } = S.buildFromRaw(FEED, m, NOW);
  doc.jobs.forEach((j) => { assert.equal(j.applyUrl, null); assert.equal(j.detailUrl, null); });
});

test('vörpun: slóðir með __proto__ eru ekki fylgt', () => {
  assert.equal(P.getPath({ a: { b: 1 } }, 'a.b'), 1);
  assert.equal(P.getPath({}, '__proto__.polluted'), undefined);
  assert.equal(P.getPath({ a: [{ x: 5 }] }, 'a.0.x'), 5);
  assert.equal(P.getPath({ a: 1 }, 'a.b.c'), undefined);
});

test('skoðun: lýsir byggingu án þess að birta langan texta eða slóðir í heild', () => {
  const lines = P.describeStructure(FEED).join('\n');
  assert.match(lines, /payload\.items : listi \(8\)/);
  assert.match(lines, /payload\.items\[0\]\.closes : dagsetning D\.M\.YYYY/);
  assert.match(lines, /payload\.items\[0\]\.body : HTML/);
  assert.match(lines, /vefslóð https:\/\/example\.org\/…/);
  assert.equal(lines.includes('/a/apply'), false);
  const none = P.describeStructure(FEED, { samples: false }).join('\n');
  assert.equal(none.includes('Prófun – Fyrsta starf'), false);
});

/* ---------- netið og skráarskrif ---------- */

function server(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: 'http://127.0.0.1:' + srv.address().port + '/feed.json' }));
  });
}
const close = (srv) => new Promise((r) => { srv.closeAllConnections?.(); srv.close(r); });
const noWait = { sleep: async () => {}, retries: 2 };

test('net: fetchJson hafnar öðru en https (utan localhost)', async () => {
  await assert.rejects(S.fetchJson('http://example.org/x.json', noWait), (e) => e.code === 'URL');
  await assert.rejects(S.fetchJson('ftp://example.org/x.json', noWait), (e) => e.code === 'URL');
  await assert.rejects(S.fetchJson('rugl', noWait), (e) => e.code === 'URL');
});

test('net: endurtekur við 5xx og tekst svo', async () => {
  let n = 0;
  const { srv, url } = await server((req, res) => {
    n++;
    if (n < 3) { res.statusCode = 503; res.end('bilað'); return; }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(FEED));
  });
  try {
    const raw = await S.fetchJson(url, noWait);
    assert.equal(n, 3);
    assert.equal(raw.payload.items.length, 8);
  } finally { await close(srv); }
});

test('net: 404, skemmt JSON, HTML-svar og of stórt svar eru villur', async () => {
  const cases = [
    ['HTTP_404', (req, res) => { res.statusCode = 404; res.end('nei'); }],
    ['JSON', (req, res) => { res.end('{"payload": {"items": [ {'); }],
    ['JSON', (req, res) => { res.setHeader('content-type', 'text/html'); res.end('<html>Viðhald</html>'); }],
    ['TOO_LARGE', (req, res) => { res.end('[' + '1,'.repeat(5000) + '1]'); }]
  ];
  for (const [code, handler] of cases) {
    const { srv, url } = await server(handler);
    try {
      await assert.rejects(S.fetchJson(url, Object.assign({ maxBytes: 1000 }, noWait)), (e) => e.code === code, code);
    } finally { await close(srv); }
  }
});

test('net: tímamörk', async () => {
  const { srv, url } = await server(() => { /* svarar aldrei */ });
  try {
    await assert.rejects(S.fetchJson(url, { timeoutMs: 100, retries: 0 }), (e) => e.code === 'TIMEOUT');
  } finally { await close(srv); }
});

test('samstilling: tekst → skjal er skrifað og gilt', async () => {
  const dir = tmpdir();
  const out = path.join(dir, 'data', 'jobs.json');
  const { srv, url } = await server((req, res) => res.end(JSON.stringify(FEED)));
  try {
    const code = await S.main(['--url', url, '--mapping', MAPPING_FILE, '--out', out]);
    assert.equal(code, 0);
    const doc = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(N.validateDocument(doc).ok, true);
    assert.equal(fs.readdirSync(path.dirname(out)).length, 1, 'engar tímabundnar skrár eftir');
  } finally { await close(srv); }
});

test('samstilling: MISTÖKST → fyrri skrá er ósnert (aldrei yfirskrifuð með tómu)', async () => {
  const dir = tmpdir();
  const out = path.join(dir, 'jobs.json');
  const previous = JSON.stringify(N.buildDocument(
    [{ id: 'gamalt', title: 'Prófun – Gamalt starf', applyUrl: 'https://example.org/old' }].map((c) => N.normalizeJob(c).job),
    { fetchedAt: '2026-10-18T10:00:00Z' }));
  fs.writeFileSync(out, previous);

  const failures = [
    (req, res) => { res.statusCode = 500; res.end('x'); },
    (req, res) => res.end('ekki json'),
    (req, res) => res.end('{}'),                                         /* rangt snið */
    (req, res) => res.end(JSON.stringify({ payload: { items: 'x' } })),
    (req, res) => res.end(JSON.stringify({ payload: { items: [{}, {}, {}] } }))  /* flest ógilt */
  ];
  for (const handler of failures) {
    const { srv, url } = await server(handler);
    try {
      await assert.rejects(S.main(['--url', url, '--mapping', MAPPING_FILE, '--out', out]));
      assert.equal(fs.readFileSync(out, 'utf8'), previous);
      assert.deepEqual(fs.readdirSync(dir), ['jobs.json'], 'engin hálfskrifuð skrá');
    } finally { await close(srv); }
  }
});

test('samstilling: óþekkt starf í raunverulegu sniði skrifar ekkert og gefur sérstakan kóða', async () => {
  const dir = tmpdir();
  const out = path.join(dir, 'jobs.json');
  const input = path.join(dir, 'in.json');
  fs.writeFileSync(input, JSON.stringify({ workplace: 'Reykjanesbær', jobs: [{ id: '1', title: 'Starf' }] }));
  await assert.rejects(S.main(['--input', input, '--out', out]), (e) => e.code === 'MAPPING_UNCONFIGURED');
  assert.equal(fs.existsSync(out), false);
});

test('samstilling: skoðunarhamur þarf enga vörpun', async () => {
  const dir = tmpdir();
  const input = path.join(dir, 'in.json');
  fs.writeFileSync(input, JSON.stringify(FEED));
  const lines = [];
  const orig = console.log;
  console.log = (l) => lines.push(l);
  try { assert.equal(await S.main(['--input', input, '--inspect', '--no-samples']), 0); }
  finally { console.log = orig; }
  assert.ok(lines.some((l) => l.startsWith('payload.items : listi (8)')));
});
