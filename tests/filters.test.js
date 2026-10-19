'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../storf/filters.js');
const N = require('../storf/normalize.js');
const { sampleDocument } = require('./fixtures/sample.js');

/* Fast „núna“: 19. október 2026 kl. 14:00 á Íslandi */
const NOW = Date.parse('2026-10-19T14:00:00Z');
const doc = sampleDocument(NOW);
const jobs = N.validateDocument(doc).jobs;
const prepared = F.prepare(jobs);
const ids = (list) => list.map((j) => j.id);

function find(state) {
  return F.filterPrepared(prepared, Object.assign({ q: '', dept: '', from: '', to: '', field: 'publishedAt' }, state), NOW);
}

test('útrunnin störf birtast ekki, frestur sem rennur út í dag birtist enn', () => {
  const all = ids(find({}));
  assert.equal(all.includes('prof-menntasvid-utrunnid'), false, 'frestur í gær');
  assert.equal(all.includes('prof-menntasvid-1'), true, 'frestur í dag');
  assert.equal(all.length, jobs.length - 1);
});

test('frestur án tíma gildir til miðnættis á Íslandi', () => {
  const late = Date.parse('2026-10-19T23:59:59Z');
  const next = Date.parse('2026-10-20T00:00:00Z');
  const st = { q: '', dept: '', from: '', to: '', field: null };
  assert.equal(ids(F.filterPrepared(prepared, st, late)).includes('prof-menntasvid-1'), true);
  assert.equal(ids(F.filterPrepared(prepared, st, next)).includes('prof-menntasvid-1'), false);
});

test('leitarorð: heiti, svið og lýsing', () => {
  assert.deepEqual(ids(find({ q: 'leikskólakennari' })), ['prof-menntasvid-2']);
  assert.ok(ids(find({ q: 'velferðarsvið' })).includes('prof-velferd-1'), 'svið');
  assert.deepEqual(ids(find({ q: 'hæfniskröfur' })), ['prof-almenn'], 'texti úr lýsingu');
});

test('leit er óháð há-/lágstöfum og íslenskum stöfum', () => {
  const expected = ids(find({ q: 'menntasvið' }));
  assert.ok(expected.length >= 2);
  assert.deepEqual(ids(find({ q: 'MENNTASVID' })), expected);
  assert.deepEqual(ids(find({ q: 'menntasvid' })), expected);
  assert.deepEqual(ids(find({ q: 'leikskolakennari' })), ['prof-menntasvid-2']);
  assert.equal(F.fold('Þórður Ægir Öster'), 'thordur aegir oster');
});

test('leit: öll orð þurfa að finnast (AND) og aukabil skipta ekki máli', () => {
  assert.deepEqual(ids(find({ q: '  leikskóli   kennara ' })), ['prof-menntasvid-2']);
  assert.deepEqual(ids(find({ q: 'leikskóli verkefnastjóri' })), []);
});

test('leit: sértákn eru bókstafleg, ekki reglulegar segðir', () => {
  assert.deepEqual(ids(find({ q: '.*' })), []);
  assert.deepEqual(ids(find({ q: '((' })), []);
  assert.deepEqual(ids(find({ q: '[a-z]+' })), []);
  assert.deepEqual(ids(find({ q: '<script>' })), ['prof-velferd-2'], 'skaðlegt heiti er venjulegur texti');
});

test('svið: síar á nákvæmt heiti flokks', () => {
  assert.deepEqual(ids(find({ dept: 'Velferðarsvið' })).sort(), ['prof-velferd-1', 'prof-velferd-2']);
  assert.deepEqual(ids(find({ dept: F.OTHER_LABEL })), ['prof-ospurt']);
  assert.deepEqual(ids(find({ dept: 'Almenn umsókn' })), ['prof-almenn']);
  assert.deepEqual(ids(find({ dept: 'Svið sem er ekki til' })), []);
});

test('tímabil: síar á auglýsingardag, báðir endar með', () => {
  const day = (n) => require('./fixtures/sample.js').addDays('2026-10-19', n);
  const r = find({ from: day(-7), to: day(0) });
  assert.deepEqual(ids(r).sort(), ['prof-menntasvid-2', 'prof-umhverfi-2', 'prof-velferd-1', 'prof-velferd-2', 'prof-ospurt'].sort());
  assert.deepEqual(ids(find({ from: day(-1), to: day(-1) })).sort(), ['prof-ospurt', 'prof-velferd-2']);
  assert.deepEqual(ids(find({ from: day(1) })), []);
  assert.equal(find({ from: 'rugl', to: '2026-13-45' }).length, jobs.length - 1, 'ógild dagsetning er hunsuð');
});

test('tímabil á frest ef engin störf hafa auglýsingardag', () => {
  const noPub = jobs.map((j) => Object.assign({}, j, { publishedAt: null }));
  assert.equal(F.rangeField(noPub), 'deadline');
  assert.equal(F.rangeField(jobs), 'publishedAt');
  assert.equal(F.rangeField(noPub.map((j) => Object.assign({}, j, { deadline: null }))), null);
  const p = F.prepare(noPub);
  const r = F.filterPrepared(p, { q: '', dept: '', from: '2026-10-25', to: '2026-10-26', field: 'deadline' }, NOW);
  assert.deepEqual(ids(r), ['prof-velferd-1']);
});

test('síur vinna saman', () => {
  assert.deepEqual(ids(find({ q: 'prófun', dept: 'Menntasvið' })).sort(), ['prof-menntasvid-1', 'prof-menntasvid-2']);
  assert.deepEqual(ids(find({ q: 'leikskóli', dept: 'Velferðarsvið' })), []);
});

test('flokkun: almenn umsókn fyrst, svið í stafrófsröð, „Önnur störf“ síðast', () => {
  const groups = F.groupJobs(find({}));
  assert.deepEqual(groups.map((g) => g.label), ['Almenn umsókn', 'Menntasvið', 'Umhverfis- og framkvæmdasvið', 'Velferðarsvið', 'Önnur störf']);
  assert.equal(groups[1].jobs.length, 2);
  assert.deepEqual(F.departments(jobs), ['Almenn umsókn', 'Menntasvið', 'Umhverfis- og framkvæmdasvið', 'Velferðarsvið', 'Önnur störf']);
});

test('flokkar eru búnir til úr gögnunum, ekki föstum lista', () => {
  const custom = [
    { id: '1', title: 'A', department: 'Ég er nýtt svið', isGeneral: false },
    { id: '2', title: 'B', department: 'Ábyrgð og öryggi', isGeneral: false },
    { id: '3', title: 'C', department: null, isGeneral: true }
  ];
  assert.deepEqual(F.departments(custom), ['Almenn umsókn', 'Ábyrgð og öryggi', 'Ég er nýtt svið']);
  assert.deepEqual(F.departments([]), []);
});

test('röðun: nýjast fyrst er sjálfgefið, tómar dagsetningar síðast', () => {
  const s = F.sortJobs(find({}), 'newest');
  assert.equal(s[0].publishedAt >= s[1].publishedAt, true);
  const withDates = s.filter((j) => j.publishedAt).map((j) => j.publishedAt);
  assert.deepEqual(withDates, withDates.slice().sort().reverse());
});

test('röðun: næsti frestur fyrst, án frests síðast; heiti í íslenskri stafrófsröð', () => {
  const d = F.sortJobs(find({}), 'deadline');
  const dl = d.map((j) => j.deadline);
  assert.equal(dl[dl.length - 1], null);
  const dated = dl.filter(Boolean);
  assert.deepEqual(dated, dated.slice().sort());
  const t = F.sortJobs([{ title: 'Þ' }, { title: 'Z' }, { title: 'Á' }, { title: 'A' }, { title: 'Ö' }], 'title').map((j) => j.title);
  assert.deepEqual(t, ['A', 'Á', 'Z', 'Þ', 'Ö'], 'íslensk röð: þ á eftir z, ö síðast');
});

test('röðun: valkostir fylgja gögnunum og óstudd röðun fellur á næstu nothæfu', () => {
  assert.deepEqual(F.sortOptions(jobs), ['newest', 'deadline', 'title']);
  const noDates = jobs.map((j) => Object.assign({}, j, { publishedAt: null, deadline: null }));
  assert.deepEqual(F.sortOptions(noDates), ['title']);
  assert.equal(F.effectiveSort(noDates, 'newest'), 'title');
  const onlyDeadline = jobs.map((j) => Object.assign({}, j, { publishedAt: null }));
  assert.equal(F.effectiveSort(onlyDeadline, 'newest'), 'deadline');
});

test('röðun breytir ekki inntakinu', () => {
  const copy = jobs.slice();
  F.sortJobs(jobs, 'title');
  assert.deepEqual(jobs, copy);
});

test('fjöldatexti á íslensku', () => {
  assert.equal(F.countLabel(1), '1 laust starf');
  assert.equal(F.countLabel(2), '2 laus störf');
  assert.equal(F.countLabel(5), '5 laus störf');
  assert.equal(F.countLabel(11), '11 laus störf');
  assert.equal(F.countLabel(21), '21 laust starf');
  assert.equal(F.countLabel(101), '101 laust starf');
  assert.equal(F.countLabel(0), '0 laus störf');
});

test('dagsetningatextar', () => {
  assert.equal(F.deadlineLabel({ deadline: '2026-10-26' }), 'Umsóknarfrestur til 26. október 2026');
  assert.equal(F.deadlineLabel({ deadline: '2026-10-26T12:00:00Z' }), 'Umsóknarfrestur til 26. október 2026 kl. 12:00');
  assert.equal(F.deadlineLabel({ deadline: null }), '');
  assert.equal(F.publishedLabel({ publishedAt: '2026-10-06' }), 'Auglýst 6. október 2026');
  assert.equal(F.publishedLabel({ publishedAt: null }), '');
});

test('úrelt gögn og virk sía', () => {
  const t = Date.parse('2026-10-19T14:00:00Z');
  assert.equal(F.isStale(t - 11 * 3600000, t), false);
  assert.equal(F.isStale(t - 13 * 3600000, t), true);
  assert.equal(F.updatedLabel(t), '19. október 2026 kl. 14:00');
  assert.equal(F.hasActiveFilter({ q: '  ', dept: '', from: '', to: '' }), false);
  assert.equal(F.hasActiveFilter({ q: 'x', dept: '', from: '', to: '' }), true);
  assert.equal(F.hasActiveFilter({ q: '', dept: 'Menntasvið', from: '', to: '' }), true);
  assert.equal(F.hasActiveFilter({ q: '', dept: '', from: 'rugl', to: '' }), false);
});
