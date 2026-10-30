'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const N = require('../storf/normalize.js');
const SD = require('../scripts/should-deploy.js');

const NOW = Date.parse('2026-10-30T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const job = (o) => Object.assign({ id: 'https://workplace.opusfutura.com/advert/a', title: 'Starf', department: 'Velferðarsvið',
  applyUrl: 'https://workplace.opusfutura.com/advert/a', detailUrl: 'https://workplace.opusfutura.com/advert/a', deadline: '2026-12-01' }, o);
const doc = (jobs, fetchedMs) => N.buildDocument(N.normalizeJobs(jobs).jobs, { fetchedAt: iso(fetchedMs) });

test('sömu störf og nýleg birt gögn → sleppa birtingu', () => {
  const r = SD.decide(doc([job()], NOW), doc([job()], NOW - 20 * 60000), NOW, 60);
  assert.equal(r.deploy, false);
  assert.match(r.reason, /engin breyting/);
});

test('nýtt starf → birta strax', () => {
  const r = SD.decide(doc([job(), job({ id: 'b', title: 'Nýtt', applyUrl: null, detailUrl: null })], NOW), doc([job()], NOW - 5 * 60000), NOW, 60);
  assert.equal(r.deploy, true);
  assert.match(r.reason, /breyst/);
});

test('starf horfið (lokað eða útrunnið) → birta strax', () => {
  assert.equal(SD.decide(doc([], NOW), doc([job()], NOW - 5 * 60000), NOW, 60).deploy, true);
});

test('breyttur texti eða frestur → birta', () => {
  assert.equal(SD.decide(doc([job({ deadline: '2026-12-15' })], NOW), doc([job()], NOW - 60000), NOW, 60).deploy, true);
  assert.equal(SD.decide(doc([job({ title: 'Breytt heiti' })], NOW), doc([job()], NOW - 60000), NOW, 60).deploy, true);
});

test('óbreytt en birt gögn eru orðin gömul → birta til að endurnýja „uppfært“-tímann', () => {
  const r = SD.decide(doc([job()], NOW), doc([job()], NOW - 61 * 60000), NOW, 60);
  assert.equal(r.deploy, true);
  assert.match(r.reason, /endurnýja/);
  assert.equal(SD.decide(doc([job()], NOW), doc([job()], NOW - 59 * 60000), NOW, 60).deploy, false);
});

test('tómt og tómt, nýlegt → sleppa; ógild birt gögn → birta', () => {
  assert.equal(SD.decide(doc([], NOW), doc([], NOW - 10 * 60000), NOW, 60).deploy, false);
  for (const bad of [null, {}, 'x', { schema: 1, fetchedAt: 'rugl', jobs: [] }, { schema: 1, fetchedAt: iso(NOW), jobs: 'x' }]) {
    assert.equal(SD.decide(doc([job()], NOW), bad, NOW, 60).deploy, true, JSON.stringify(bad));
  }
});

function serve(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: 'http://127.0.0.1:' + srv.address().port + '/data/jobs.json' }));
  });
}
const close = (srv) => new Promise((r) => { srv.closeAllConnections?.(); srv.close(r); });

test('run(): sækir birt gögn; allar villur við lestur þeirra → birta (aldrei sleppa nýju starfi)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-'));
  const f = path.join(dir, 'new.json');
  fs.writeFileSync(f, JSON.stringify(doc([job()], NOW)));
  const args = (url) => ({ newFile: f, liveUrl: url, maxAgeMin: 60 });
  const o = { now: NOW, sleep: async () => {} };

  let live = doc([job()], NOW - 10 * 60000);
  const { srv, url } = await serve((req, res) => res.end(JSON.stringify(live)));
  try {
    assert.equal((await SD.run(args(url), o)).deploy, false, 'sömu gögn');
    live = doc([], NOW - 10 * 60000);
    assert.equal((await SD.run(args(url), o)).deploy, true, 'munur');
  } finally { await close(srv); }

  for (const handler of [
    (req, res) => { res.statusCode = 404; res.end('x'); },
    (req, res) => { res.statusCode = 503; res.end('x'); },
    (req, res) => res.end('ekki json')
  ]) {
    const s = await serve(handler);
    try { assert.equal((await SD.run(args(s.url), o)).deploy, true); } finally { await close(s.srv); }
  }
  assert.equal((await SD.run(args('http://127.0.0.1:1/x.json'), o)).deploy, true, 'netvilla');
});
