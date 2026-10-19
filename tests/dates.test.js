'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../storf/dates.js');

test('normalizeDate: dagsetning án tíma helst óbreytt', () => {
  assert.equal(D.normalizeDate('2026-10-26'), '2026-10-26');
  assert.equal(D.normalizeDate('  2026-10-26 '), '2026-10-26');
});

test('normalizeDate: íslenskt snið D.M.YYYY', () => {
  assert.equal(D.normalizeDate('26.10.2026'), '2026-10-26');
  assert.equal(D.normalizeDate('1.3.2026'), '2026-03-01');
  assert.equal(D.normalizeDate('1. 3. 2026'), '2026-03-01');
});

test('normalizeDate: tími nákvæmlega 00:00 er „dagurinn sjálfur“', () => {
  assert.equal(D.normalizeDate('26.10.2026 00:00'), '2026-10-26');
  assert.equal(D.normalizeDate('2026-10-26T00:00:00Z'), '2026-10-26');
  assert.equal(D.normalizeDate('2026-10-26T00:00:00'), '2026-10-26');
});

test('normalizeDate: tímapunktur verður UTC (Ísland = UTC allt árið)', () => {
  assert.equal(D.normalizeDate('26.10.2026 14:30'), '2026-10-26T14:30:00Z');
  assert.equal(D.normalizeDate('2026-10-26T09:00:00'), '2026-10-26T09:00:00Z');
  assert.equal(D.normalizeDate('2026-07-01T09:00:00'), '2026-07-01T09:00:00Z', 'ekkert sumartímafrávik á Íslandi');
  assert.equal(D.normalizeDate('2026-10-26T12:00:00+02:00'), '2026-10-26T10:00:00Z');
  assert.equal(D.normalizeDate('2026-10-26T12:00:00-0130'), '2026-10-26T13:30:00Z');
  assert.equal(D.normalizeDate('2026-10-26T12:00:00.123Z'), '2026-10-26T12:00:00Z');
});

test('normalizeDate: ógilt og óþekkt snið gefur null (engin ágiskun)', () => {
  ['', '   ', 'bráðlega', '2026-02-30', '31.04.2026', '2026-13-01', '26/10/2026',
    'October 26, 2026', '2026-10-26T25:00:00Z', '26.10.2026 24:30', 0, 20261026, {}, [], null, undefined, true]
    .forEach((v) => assert.equal(D.normalizeDate(v), null, 'ætti að hafna: ' + JSON.stringify(v)));
});

test('isPast: frestur án tíma gildir út allan daginn á Íslandi', () => {
  const dl = '2026-10-26';
  assert.equal(D.isPast(dl, Date.parse('2026-10-26T00:00:00Z')), false);
  assert.equal(D.isPast(dl, Date.parse('2026-10-26T23:59:59Z')), false);
  assert.equal(D.isPast(dl, Date.parse('2026-10-27T00:00:00Z')), true);
  assert.equal(D.isPast(dl, Date.parse('2026-10-25T12:00:00Z')), false);
});

test('isPast: frestur með tíma gildir fram að þeirri stundu', () => {
  const dl = '2026-10-26T12:00:00Z';
  assert.equal(D.isPast(dl, Date.parse('2026-10-26T11:59:59Z')), false);
  assert.equal(D.isPast(dl, Date.parse('2026-10-26T12:00:01Z')), true);
});

test('isPast: vantar eða ógilt gildi telst ekki liðið', () => {
  assert.equal(D.isPast(null, Date.now()), false);
  assert.equal(D.isPast('rugl', Date.now()), false);
});

test('todayInIceland og formatDate', () => {
  assert.equal(D.todayInIceland(Date.parse('2026-10-19T23:59:59Z')), '2026-10-19');
  assert.equal(D.todayInIceland(Date.parse('2026-10-20T00:00:00Z')), '2026-10-20');
  assert.equal(D.formatDate('2026-10-26'), '26. október 2026');
  assert.equal(D.formatDate('2026-03-01'), '1. mars 2026');
  assert.equal(D.formatDate('2026-12-31'), '31. desember 2026');
  assert.equal(D.formatDate('2026-10-26T14:30:00Z'), '26. október 2026');
  assert.equal(D.formatDateTime('2026-10-26T14:30:00Z'), '26. október 2026 kl. 14:30');
  assert.equal(D.formatDateTime('2026-10-26'), '26. október 2026');
  assert.equal(D.formatDate('rugl'), '');
});

test('daysBetween', () => {
  assert.equal(D.daysBetween('2026-10-19', '2026-10-26'), 7);
  assert.equal(D.daysBetween('2026-10-26', '2026-10-19'), -7);
  assert.equal(D.daysBetween('2026-02-28', '2026-03-01'), 1);
});
