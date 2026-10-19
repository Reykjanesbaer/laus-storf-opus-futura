'use strict';
/*
 * embed.js keyrt í vm með eftirlíkingu af DOM. Prófar hvaða iframe er búinn til
 * og — mikilvægast — hvaða skilaboð eru tekin gild þegar margar innfellingar
 * eru á sömu síðu.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../storf/config.js');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'embed.js'), 'utf8');
const BASE = 'https://reykjanesbaer.github.io/laus-storf-opus-futura/';
const ORIGIN = 'https://reykjanesbaer.github.io';

/* Ein „síða“: einn window með einum lista af hlustendum, eins og í alvöru */
function page() {
  const listeners = [];
  const iframes = [];
  const win = {
    URL, URLSearchParams, Math, Date, String, Number, isFinite, parseFloat, parseInt, RegExp,
    addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); }
  };
  const doc = {
    currentScript: null,
    createElement: (tag) => {
      assert.equal(tag, 'iframe');
      const f = { style: {}, contentWindow: { name: 'win' + iframes.length }, tag };
      iframes.push(f);
      return f;
    }
  };
  win.window = win;
  win.document = doc;
  vm.createContext(win);

  return {
    iframes,
    /* Keyrir embed.js eins og vafri gerir þegar <script> með þessum eigindum er lesið */
    embed(src, attrs) {
      const list = Object.entries(attrs || {}).map(([name, value]) => ({ name, value }));
      list.unshift({ name: 'src', value: src });
      let inserted = null;
      doc.currentScript = {
        src,
        attributes: list,
        getAttribute: (n) => { const a = list.find((x) => x.name === n); return a ? a.value : null; },
        parentNode: { insertBefore: (el) => { inserted = el; } }
      };
      vm.runInContext(SRC, win);
      doc.currentScript = null;
      return inserted;
    },
    post(source, origin, data) {
      listeners.forEach((fn) => fn({ source, origin, data }));
    }
  };
}

const msg = (id, height) => ({ type: 'laus-storf:height', id, height });
const idOf = (f) => new URL(f.src).searchParams.get('frameId');

test('iframe er búinn til á undan skriftunni með slóð í sömu möppu og embed.js', () => {
  const p = page();
  const f = p.embed(BASE + 'embed.js', { 'data-theme': 'dark', 'data-frame': '0' });
  assert.ok(f);
  const u = new URL(f.src);
  assert.equal(u.origin + u.pathname, BASE);
  assert.equal(u.searchParams.get('theme'), 'dark');
  assert.equal(u.searchParams.get('frame'), '0');
  assert.match(u.searchParams.get('frameId'), /^ls-[a-z0-9]+$/);
  assert.equal(f.title, 'Laus störf hjá Reykjanesbæ');
  assert.equal(f.loading, 'lazy');
  assert.match(f.style.cssText, /^display:block;border:0;width:100%;height:600px;margin-left:0;margin-right:auto;color-scheme:normal$/);
});

test('undirslóð og fyrirspurn á embed.js rugla ekki grunnslóðinni', () => {
  const f = page().embed(BASE + 'embed.js?v=3#x', {});
  assert.equal(new URL(f.src).origin + new URL(f.src).pathname, BASE);
});

test('data-* færibreytur: iframe-stillingar fara EKKI áfram, vefstillingar fara áfram', () => {
  const f = page().embed(BASE + 'embed.js', {
    'data-width': '80%', 'data-max-width': '720px', 'data-align': 'center', 'data-height': '900',
    'data-iframe-title': 'Mitt heiti', 'data-title': '0', 'data-view': 'cards', 'data-dept': 'Menntasvið'
  });
  const q = new URL(f.src).searchParams;
  ['width', 'max-width', 'align', 'height', 'iframe-title'].forEach((k) => assert.equal(q.has(k), false, k));
  assert.equal(q.get('title'), '0', 'data-title er vefstilling (titill sýnilegur eða ekki), ekki titill iframe');
  assert.equal(q.get('view'), 'cards');
  assert.equal(q.get('dept'), 'Menntasvið');
  assert.equal(f.title, 'Mitt heiti');
  assert.match(f.style.cssText, /width:80%;max-width:min\(720px,100%\);height:900px;margin-left:auto;margin-right:auto/);
});

test('data-frameid og undarleg nöfn eru ekki send áfram; frameId kemur alltaf frá skriftunni', () => {
  const f = page().embed(BASE + 'embed.js', { 'data-frameid': 'illt', 'data-Bad_Key': '1', 'data-': 'x', 'data-a b': '1', 'data-x': 'y' });
  const q = new URL(f.src).searchParams;
  assert.match(q.get('frameId'), /^ls-/);
  assert.equal(q.has('frameid'), false);
  assert.equal(q.get('x'), 'y');
  assert.equal([...q.keys()].length, 2);
});

test('stærðir: sama gildisathugun og í config.js (samanburður á fjölda gilda)', () => {
  const widths = ['100%', '80%', '480', '480px', ' 50 % ', '100', '101%', '0%', '2001px', '1px', 'abc', '', '50%;color:red', 'calc(10px)', 'none', '1e3'];
  const maxes = widths.concat(['none', 'NONE', ' none ']);
  const aligns = ['left', 'center', 'right', 'CENTER', 'top', '', 'justify'];
  const heights = ['300', '299', '5000', '5001', '1200px', 'x', '', '12.5', '-1'];
  const p = page();
  widths.forEach((w) => maxes.forEach((m) => {
    const f = p.embed(BASE + 'embed.js', { 'data-width': w, 'data-max-width': m });
    const expect = C.sizeCss(C.parseSize(w, 'width') || '100%', C.parseSize(m, 'maxWidth') || 'none');
    assert.ok(f.style.cssText.indexOf(expect + ';height:') > -1, `width=${JSON.stringify(w)} max=${JSON.stringify(m)}: ${f.style.cssText} vs ${expect}`);
  }));
  aligns.forEach((a) => {
    const f = p.embed(BASE + 'embed.js', { 'data-align': a });
    const expect = C.margins(C.parseLayout({ align: a }).align);
    assert.ok(f.style.cssText.includes(expect), 'align=' + a);
  });
  heights.forEach((h) => {
    const f = p.embed(BASE + 'embed.js', { 'data-height': h });
    const parsed = C.parseHeight(h);
    assert.ok(f.style.cssText.includes('height:' + (parsed ? parsed : 600) + 'px'), 'height=' + h);
  });
});

test('hæð: gild skilaboð breyta hæðinni', () => {
  const p = page();
  const f = p.embed(BASE + 'embed.js', {});
  p.post(f.contentWindow, ORIGIN, msg(idOf(f), 1234));
  assert.equal(f.style.height, '1234px');
  p.post(f.contentWindow, ORIGIN, msg(idOf(f), 800.4));
  assert.equal(f.style.height, '800px');
});

test('hæð: skilaboð eru hafnað ef sendandi, uppruni, gerð, auðkenni eða gildi stenst ekki', () => {
  const p = page();
  const f = p.embed(BASE + 'embed.js', {});
  const id = idOf(f);
  const start = f.style.height;
  const other = { name: 'annar gluggi' };

  const bad = [
    [other, ORIGIN, msg(id, 900)],                                             /* röng uppspretta */
    [f.contentWindow, 'https://evil.example', msg(id, 900)],                    /* rangur uppruni */
    [f.contentWindow, 'https://reykjanesbaer.github.io.evil.net', msg(id, 900)],
    [f.contentWindow, ORIGIN, { type: 'annað', id, height: 900 }],              /* röng gerð */
    [f.contentWindow, ORIGIN, { id, height: 900 }],
    [f.contentWindow, ORIGIN, msg('ls-annad', 900)],                            /* annað auðkenni */
    [f.contentWindow, ORIGIN, { type: 'laus-storf:height', height: 900 }],      /* vantar auðkenni */
    [f.contentWindow, ORIGIN, msg(id, 49)],                                     /* of lágt */
    [f.contentWindow, ORIGIN, msg(id, 20001)],                                  /* of hátt */
    [f.contentWindow, ORIGIN, msg(id, -500)],
    [f.contentWindow, ORIGIN, msg(id, 0)],
    [f.contentWindow, ORIGIN, msg(id, NaN)],
    [f.contentWindow, ORIGIN, msg(id, Infinity)],
    [f.contentWindow, ORIGIN, msg(id, '900')],                                  /* strengur, ekki tala */
    [f.contentWindow, ORIGIN, msg(id, '900px; background:url(x)')],
    [f.contentWindow, ORIGIN, msg(id, { valueOf: () => 900 })],
    [f.contentWindow, ORIGIN, msg(id, [900])],
    [f.contentWindow, ORIGIN, null],
    [f.contentWindow, ORIGIN, 'laus-storf:height'],
    [f.contentWindow, ORIGIN, 42],
    [f.contentWindow, ORIGIN, undefined]
  ];
  bad.forEach(([src, origin, data], i) => {
    p.post(src, origin, data);
    assert.equal(f.style.height, start, 'skilaboð #' + i + ' hefðu átt að vera hafnað');
  });
});

test('hæð: engin ágiskun á „id er valfrjálst“ — skilaboð án auðkennis duga ekki', () => {
  const p = page();
  const f = p.embed(BASE + 'embed.js', {});
  p.post(f.contentWindow, ORIGIN, { type: 'laus-storf:height', height: 777 });
  assert.notEqual(f.style.height, '777px');
});

test('margar innfellingar á sömu síðu: hver fær aðeins sín eigin skilaboð', () => {
  const p = page();
  const a = p.embed(BASE + 'embed.js', { 'data-theme': 'light' });
  const b = p.embed(BASE + 'embed.js', { 'data-theme': 'dark' });
  const c = p.embed(BASE + 'embed.js', {});
  const ids = [a, b, c].map(idOf);
  assert.equal(new Set(ids).size, 3, 'auðkenni eru einstök');
  const startB = b.style.height, startC = c.style.height;

  p.post(a.contentWindow, ORIGIN, msg(ids[0], 1111));
  assert.equal(a.style.height, '1111px');
  assert.equal(b.style.height, startB);
  assert.equal(c.style.height, startC);

  /* iframe B þykist vera A: rétt auðkenni A en röng uppspretta → hafnað */
  p.post(b.contentWindow, ORIGIN, msg(ids[0], 2222));
  assert.equal(a.style.height, '1111px');

  /* A sendir með auðkenni B → hafnað */
  p.post(a.contentWindow, ORIGIN, msg(ids[1], 3333));
  assert.equal(b.style.height, startB);

  p.post(b.contentWindow, ORIGIN, msg(ids[1], 2222));
  p.post(c.contentWindow, ORIGIN, msg(ids[2], 3333));
  assert.deepEqual([a, b, c].map((f) => f.style.height), ['1111px', '2222px', '3333px']);
});

test('skriftan gerir ekkert ef document.currentScript vantar', () => {
  const p = page();
  const win = vm.createContext({ document: { currentScript: null }, window: {} });
  assert.doesNotThrow(() => vm.runInContext(SRC, win));
  assert.equal(p.iframes.length, 0);
});
