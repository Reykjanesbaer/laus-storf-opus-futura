'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../storf/config.js');

test('sjálfgefin gildi', () => {
  const d = C.defaults();
  assert.equal(d.theme, 'auto');
  assert.equal(d.accent, '1D4D91');
  assert.equal(d.frame, 1);
  assert.equal(d.title, 1);
  assert.equal(d.view, 'list');
  assert.equal(d.spacing, 'compact');
  assert.deepEqual(C.parse(''), d);
  assert.deepEqual(C.parse(undefined === 1 ? '' : {}), d);
  assert.equal(C.toQuery(d), '', 'sjálfgefið gefur tóma slóð');
});

test('gild gildi eru tekin', () => {
  const o = C.parse('theme=dark&accent=%232760ab&bg=f7f9fb&radius=12&frame=0&title=0&intro=0&search=0&filters=0&groups=0&dates=0&desc=0&deadline=0&sort=deadline&spacing=normal&view=cards&dept=Menntasvi%C3%B0');
  assert.deepEqual(o, {
    theme: 'dark', accent: '2760AB', bg: 'F7F9FB', bgdark: '', radius: 12, frame: 0, title: 0, intro: 0,
    search: 0, filters: 0, groups: 0, dates: 0, desc: 0, deadline: 0, sort: 'deadline', dept: 'Menntasvið',
    spacing: 'normal', view: 'cards'
  });
});

test('ógild gildi falla á sjálfgefið — aldrei villa', () => {
  const bad = 'theme=purple&accent=red&bg=%23zzz&bgdark=12&radius=99&frame=yes&title=2&sort=random&spacing=huge&view=table&radius=-3';
  const o = C.parse(bad);
  const d = C.defaults();
  Object.keys(d).filter((k) => k !== 'bg' && k !== 'bgdark').forEach((k) => assert.equal(o[k], d[k], k));
  assert.equal(o.bg, '1D4D91' === o.accent ? d.bg : d.bg);
  assert.equal(C.check('radius', '24'), 24);
  assert.equal(C.check('radius', '25'), 6);
  assert.equal(C.check('radius', '1.4'), 1);
  assert.equal(C.check('radius', 'abc'), 6);
  assert.equal(C.check('accent', '12345'), '1D4D91');
  assert.equal(C.check('accent', '#abc123'), 'ABC123');
  assert.equal(C.check('bg', ''), '', 'tómt bg = sjálfgefinn bakgrunnur');
});

test('allt hefur gildi þótt færibreytur vanti eða séu undarlegar', () => {
  [null, undefined, {}, { theme: ['dark'] }, { accent: {} }, { frame: null }, 'x=1&&=&theme', '%E0%A4%A', 'theme=dark&theme=light']
    .forEach((src) => { const o = C.parse(src === undefined ? {} : src); assert.deepEqual(Object.keys(o).sort(), C.KEYS.slice().sort()); });
  assert.equal(C.parse('theme=dark&theme=light').theme, 'dark', 'fyrsta gildi gildir');
});

test('dept: stýristafir hreinsaðir, lengd takmörkuð', () => {
  assert.equal(C.check('dept', '  Mennta\u0000svið \n'), 'Menntasvið');
  assert.equal(C.check('dept', 'x'.repeat(300)).length, 100);
  assert.equal(C.check('dept', ''), '');
});

test('changed og toQuery: aðeins frávik frá sjálfgefnu, í fastri röð, endurlesanlegt', () => {
  const o = C.parse('view=cards&theme=dark&frame=0&dept=Velfer%C3%B0arsvi%C3%B0');
  const q = C.toQuery(o);
  assert.equal(q, 'theme=dark&frame=0&dept=Velfer%C3%B0arsvi%C3%B0&view=cards');
  assert.deepEqual(C.parse(q), o);
});

test('stærðir: gild og ógild gildi', () => {
  assert.equal(C.parseSize('80%', 'width'), '80%');
  assert.equal(C.parseSize('480', 'width'), '480px');
  assert.equal(C.parseSize(' 480 PX ', 'width'), '480px');
  assert.equal(C.parseSize('100', 'width'), null, '100px er undir 200px');
  assert.equal(C.parseSize('101%', 'width'), null);
  assert.equal(C.parseSize('0%', 'width'), null);
  assert.equal(C.parseSize('2001px', 'width'), null);
  assert.equal(C.parseSize('none', 'width'), null);
  assert.equal(C.parseSize('none', 'maxWidth'), 'none');
  assert.equal(C.parseSize('calc(1px)', 'maxWidth'), null);
  assert.equal(C.parseSize('50%; color:red', 'width'), null, 'ekkert CSS-innspýtingarop');
  assert.equal(C.parseSize({}, 'width'), null);
});

test('hæð iframe: mörk', () => {
  assert.equal(C.parseHeight('1000'), 1000);
  assert.equal(C.parseHeight('1200px'), 1200);
  assert.equal(C.parseHeight('299'), null);
  assert.equal(C.parseHeight('5001'), null);
  assert.equal(C.parseHeight('1e3'), null);
  assert.equal(C.parseHeight('-5'), null);
});

test('stærðarstillingar úr slóð og CSS', () => {
  assert.deepEqual(C.parseLayout(''), { width: '100%', maxw: 'none', align: 'left', height: 1000 });
  assert.deepEqual(C.parseLayout('width=80%25&maxw=720&align=center&height=1400'),
    { width: '80%', maxw: '720px', align: 'center', height: 1400 });
  assert.deepEqual(C.parseLayout('width=x&maxw=y&align=top&height=1'), C.layoutDefaults());
  assert.equal(C.sizeCss('100%', 'none'), 'width:100%');
  assert.equal(C.sizeCss('80%', '720px'), 'width:80%;max-width:min(720px,100%)');
  assert.equal(C.sizeCss('rugl', 'rugl'), 'width:100%');
  assert.equal(C.margins('center'), 'margin-left:auto;margin-right:auto;');
  assert.equal(C.margins('right'), 'margin-left:auto;margin-right:0;');
  assert.equal(C.margins('left'), 'margin-left:0;margin-right:auto;');
});

test('birtuskil: sjálfgefinn litur nær AA á hvítu og í dökku þema', () => {
  const o = C.defaults();
  const light = C.palette(o, false), dark = C.palette(o, true);
  assert.ok(C.contrast(light.accentText, light.bg) >= 4.5);
  assert.ok(C.contrast(dark.accentText, dark.bg) >= 4.5, 'áherslulitur ljósaður á dökkum bakgrunni');
  assert.ok(C.contrast(light.onAccent, light.accent) >= 4.5);
  assert.ok(C.contrast(light.ink, light.bg) >= 7);
  assert.ok(C.contrast(dark.ink, dark.bg) >= 7);
  assert.ok(C.contrast(light.muted, light.bg) >= 4.5);
  assert.ok(C.contrast(dark.muted, dark.bg) >= 4.5);
  assert.ok(C.contrast(light.control, light.bg) >= 3, 'jaðar stjórntækja');
  assert.equal(light.accentText, '1D4D91', 'sjálfgefinn litur breytist ekki á hvítu');
});

test('birtuskil: hvaða bakgrunnur og áherslulitur sem er gefur læsilegan texta', () => {
  const colors = ['000000', 'FFFFFF', '1D4D91', 'FFD400', 'FF0000', '00FF00', '777777', '808080', '123456', 'F7F9FB', '16191B', 'C5192D'];
  colors.forEach((bg) => colors.forEach((accent) => {
    [false, true].forEach((dark) => {
      const p = C.palette({ accent, bg: dark ? '' : bg, bgdark: dark ? bg : '' }, dark);
      const tag = `bg=${bg} accent=${accent} dark=${dark}`;
      assert.ok(C.contrast(p.ink, p.bg) >= 4.5, 'ink ' + tag);
      assert.ok(C.contrast(p.muted, p.bg) >= 4.5, 'muted ' + tag);
      assert.ok(C.contrast(p.accentText, p.bg) >= 4.5, 'accentText ' + tag);
      assert.ok(C.contrast(p.control, p.bg) >= 3 - 0.01, 'control ' + tag);
    });
  }));
});

test('birtuskil hnapps: viðvörun fyrir áherslulit sem nær ekki AA með hvorum texta sem er', () => {
  assert.ok(C.buttonContrast('1D4D91') >= 7);
  assert.ok(C.buttonContrast('FFD400') >= 4.5, 'gulur fær dökkan texta');
  assert.ok(C.buttonContrast('777777') < 4.6, 'miðgrár er á mörkunum');
});
