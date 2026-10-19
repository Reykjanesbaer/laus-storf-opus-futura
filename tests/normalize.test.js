'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../storf/normalize.js');
const { sampleDocument } = require('./fixtures/sample.js');

const NOW = Date.parse('2026-10-19T14:00:00Z');

function job(extra) {
  return Object.assign({ id: 'a1', title: 'Prófun – Starf', applyUrl: 'https://example.org/apply' }, extra);
}

test('gilt starf fær allt sem er gefið og ekkert meira', () => {
  const r = N.normalizeJob(job({
    department: 'Menntasvið', employmentType: 'Fullt starf', location: 'Skóli',
    publishedAt: '6.10.2026', deadline: '2026-10-26', summary: 'Stutt.',
    detailUrl: 'https://example.org/d'
  }));
  assert.deepEqual(r.job, {
    id: 'a1', title: 'Prófun – Starf', department: 'Menntasvið', employmentType: 'Fullt starf',
    location: 'Skóli', publishedAt: '2026-10-06', deadline: '2026-10-26', isGeneral: false,
    summary: 'Stutt.', description: null, detailUrl: 'https://example.org/d', applyUrl: 'https://example.org/apply'
  });
});

test('valfrjálsa reiti má vanta — ekkert er búið til í staðinn', () => {
  const r = N.normalizeJob({ id: 'x', title: 'Aðeins heiti' });
  assert.equal(r.job.department, null);
  assert.equal(r.job.deadline, null);
  assert.equal(r.job.publishedAt, null);
  assert.equal(r.job.summary, null);
  assert.equal(r.job.applyUrl, null, 'umsóknarslóð er aldrei búin til');
  assert.equal(r.job.detailUrl, null);
});

test('starf án heitis eða auðkennis er hafnað', () => {
  assert.equal(N.normalizeJob({ id: '1', title: '   ' }).reason, 'no-title');
  assert.equal(N.normalizeJob({ title: 'Heiti' }).reason, 'no-id');
  assert.equal(N.normalizeJob(null).reason, 'not-object');
  assert.equal(N.normalizeJob('texti').reason, 'not-object');
  assert.equal(N.normalizeJob([1]).reason, 'not-object');
});

test('auðkenni fær slóð starfsins til vara, aldrei heiti', () => {
  assert.equal(N.normalizeJob({ title: 'T', applyUrl: 'https://example.org/x' }).job.id, 'https://example.org/x');
  assert.equal(N.normalizeJob({ title: 'T', detailUrl: 'https://example.org/d', applyUrl: 'https://example.org/x' }).job.id, 'https://example.org/d');
  assert.equal(N.normalizeJob({ id: 42, title: 'T' }).job.id, '42');
});

test('tvítekin auðkenni: fyrsta færslan gildir', () => {
  const r = N.normalizeJobs([job({ title: 'Fyrst' }), job({ title: 'Annað' }), job({ id: 'b2', title: 'Þriðja' })]);
  assert.deepEqual(r.jobs.map((j) => j.title), ['Fyrst', 'Þriðja']);
  assert.deepEqual(r.dropped, { duplicate: 1 });
});

test('vefslóðir: aðeins https án notandanafns, annars null', () => {
  const bad = ['http://example.org/x', 'javascript:alert(1)', 'data:text/html,<b>x</b>', '//example.org/x',
    'https://user:pw@example.org/x', 'https://localhost/x', 'ftp://example.org/x', 'https://exa mple.org/x',
    '/relative', '', 'https://', 'https://example.org/\u0000x', 5, null, {}];
  bad.forEach((u) => assert.equal(N.safeUrl(u), null, 'ætti að hafna: ' + JSON.stringify(u)));
  assert.equal(N.safeUrl('https://example.org/a?b=1#c'), 'https://example.org/a?b=1#c');
  assert.equal(N.safeUrl('https://sub.example.org/x', ['example.org']), 'https://sub.example.org/x');
  assert.equal(N.safeUrl('https://evilexample.org/x', ['example.org']), null, 'lén verður að passa á punktamörkum');
  assert.equal(N.safeUrl('https://example.org.evil.net/x', ['example.org']), null);
  assert.equal(N.safeUrl('https://other.net/x', ['example.org']), null);
});

test('ógild umsóknarslóð er felld burt en starfið heldur sér', () => {
  const r = N.normalizeJob(job({ applyUrl: 'http://example.org/apply', detailUrl: 'https://example.org/d' }));
  assert.equal(r.job.applyUrl, null);
  assert.equal(r.job.detailUrl, 'https://example.org/d');
});

test('texti: stýristafir, bil og lengd', () => {
  assert.equal(N.cleanText('  a\u0000b \n\t c​  '), 'ab c');
  assert.equal(N.cleanText('x'.repeat(50), 20).length <= 21, true);
  assert.equal(N.cleanText({ toString() { return 'illt'; } }), '', 'hlutir eru ekki gerðir að texta');
  assert.equal(N.cleanText(['a']), '');
});

test('HTML í lýsingu: engin tög lifa, script hverfur, einingar afkóðaðar eftir á', () => {
  const blocks = N.htmlToBlocks(
    '<p onclick="x()">Halló <strong>heimur</strong> &amp; <a href="javascript:alert(1)">tengill</a></p>' +
    '<script>alert(1)</script><style>p{}</style><!-- falið -->' +
    '<h3>Verkefni</h3><ul><li>Eitt</li><li>Tvö<br>lína</li></ul><ol><li>Fyrst</li></ol>' +
    '<p>&lt;script&gt;alert(2)&lt;/script&gt;</p><div>Laust&nbsp;í&nbsp;lausu</div>');
  assert.deepEqual(blocks, [
    { t: 'p', x: 'Halló heimur & tengill' },
    { t: 'h', x: 'Verkefni' },
    { t: 'ul', items: ['Eitt', 'Tvö lína'] },
    { t: 'ol', items: ['Fyrst'] },
    { t: 'p', x: '<script>alert(2)</script>' },
    { t: 'p', x: 'Laust í lausu' }
  ]);
  const flat = JSON.stringify(blocks);
  assert.equal(/onclick|javascript:|alert\(1\)/.test(flat), false);
});

test('HTML: brotið og undarlegt snið veldur ekki villu', () => {
  assert.deepEqual(N.htmlToBlocks(''), []);
  assert.deepEqual(N.htmlToBlocks(null), []);
  assert.deepEqual(N.htmlToBlocks('<p>ólokið <b>feitt'), [{ t: 'p', x: 'ólokið feitt' }]);
  assert.deepEqual(N.htmlToBlocks('1 < 2 og 3 > 2'), [{ t: 'p', x: '1 < 2 og 3 > 2' }]);
  assert.deepEqual(N.htmlToBlocks('<li>laus liður</li>'), [{ t: 'p', x: 'laus liður' }]);
  assert.deepEqual(N.htmlToBlocks('&#128512; &#x1F600; &#99999999; &bogus;'), [{ t: 'p', x: '😀 😀 &bogus;' }]);
});

test('texti → blokkir: málsgreinar og punktalistar', () => {
  const blocks = N.textToBlocks('Fyrsta lína\nframhald\n\n- Eitt\n- Tvö\n\nSíðasta málsgrein');
  assert.deepEqual(blocks, [
    { t: 'p', x: 'Fyrsta lína framhald' },
    { t: 'ul', items: ['Eitt', 'Tvö'] },
    { t: 'p', x: 'Síðasta málsgrein' }
  ]);
});

test('útdráttur er búinn til úr lýsingu þegar samantekt vantar', () => {
  const r = N.normalizeJob(job({ descriptionHtml: '<p>Fyrsta málsgrein starfsins.</p><p>Önnur.</p>' }));
  assert.equal(r.job.summary, 'Fyrsta málsgrein starfsins.');
  assert.equal(r.job.description.length, 2);
  const long = N.normalizeJob(job({ descriptionText: 'orð '.repeat(200) }));
  assert.ok(long.job.summary.length <= 221 && long.job.summary.endsWith('…'));
});

test('almenn umsókn þekkist af heiti sviðs (með eða án séríslenskra stafa) eða skýru merki', () => {
  assert.equal(N.normalizeJob(job({ department: 'Almenn umsókn' })).job.isGeneral, true);
  assert.equal(N.normalizeJob(job({ department: 'almenn umsokn' })).job.isGeneral, true);
  assert.equal(N.normalizeJob(job({ department: 'Menntasvið' })).job.isGeneral, false);
  assert.equal(N.normalizeJob(job({ isGeneral: true })).job.isGeneral, true);
  assert.equal(N.normalizeJob(job({ isGeneral: 'true' })).job.isGeneral, false, 'aðeins boolean true gildir');
});

test('tómur listi og ekki-listi', () => {
  assert.deepEqual(N.normalizeJobs([]), { jobs: [], dropped: {} });
  assert.deepEqual(N.normalizeJobs(null), { jobs: [], dropped: {} });
  assert.deepEqual(N.normalizeJobs('rugl'), { jobs: [], dropped: {} });
});

test('skjal: tómt skjal er gilt („engin störf“), skemmd skjöl ekki', () => {
  const empty = N.buildDocument([], { fetchedAt: '2026-10-19T14:00:00Z' });
  const ok = N.validateDocument(empty);
  assert.equal(ok.ok, true);
  assert.equal(ok.jobs.length, 0);

  const bad = [
    null, [], 'texti', {}, { schema: 2, fetchedAt: '2026-10-19T14:00:00Z', jobs: [] },
    { schema: 1, fetchedAt: 'í gær', jobs: [] },
    { schema: 1, fetchedAt: '2026-10-19', jobs: [] },
    { schema: 1, fetchedAt: '2026-10-19T14:00:00Z', jobs: {} },
    { schema: 1, fetchedAt: '2026-10-19T14:00:00Z', jobs: [], count: 3 }
  ];
  bad.forEach((d) => assert.equal(N.validateDocument(d).ok, false, JSON.stringify(d)));
});

test('skjal: fetchedAt kl. 00:00:00Z er gilt', () => {
  assert.equal(N.validateDocument({ schema: 1, fetchedAt: '2026-10-19T00:00:00Z', count: 0, jobs: [] }).ok, true);
});

test('skjal: hreinsun er idempotent á prófunargögnunum', () => {
  const doc = sampleDocument(NOW);
  const v = N.validateDocument(doc);
  assert.equal(v.ok, true);
  assert.equal(v.droppedCount, 0);
  assert.equal(v.jobs.length, doc.jobs.length);
  /* starf án samantektar fær útdrátt úr lýsingu í fyrstu umferð; eftir það breytist ekkert */
  const again = N.normalizeJobs(v.jobs);
  assert.deepEqual(again.jobs, v.jobs);
  assert.equal(v.jobs.find((j) => j.id === 'prof-umhverfi-1').summary,
    'Prófunartexti sem er notaður sem útdráttur þegar enginn samantekt fylgir starfinu.');
});

test('skjal: skaðlegur texti helst sem texti, gögnin eru ekki afskræmd', () => {
  const doc = sampleDocument(NOW);
  const evil = N.validateDocument(doc).jobs.find((j) => j.id === 'prof-velferd-2');
  assert.match(evil.title, /<img src=x onerror=alert\(1\)>/, 'titillinn er varðveittur sem texti');
});
