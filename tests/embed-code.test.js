'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../storf/config.js');
const E = require('../storf/embed-code.js');

const BASE = 'https://reykjanesbaer.github.io/laus-storf-opus-futura/';
const lay = (o) => Object.assign(C.layoutDefaults(), o || {});

test('iframe: sjálfgefið er nákvæmlega mynstrið úr verkbeiðninni', () => {
  assert.equal(E.iframeCode(BASE, C.defaults(), lay()),
    '<iframe\n' +
    '  src="https://reykjanesbaer.github.io/laus-storf-opus-futura/"\n' +
    '  title="Laus störf hjá Reykjanesbæ"\n' +
    '  loading="lazy"\n' +
    '  style="width:100%;height:1000px;border:0;display:block;">\n' +
    '</iframe>');
});

test('iframe: valdar stillingar fara í slóðina, aðeins frávik frá sjálfgefnu', () => {
  const o = C.parse('theme=light&frame=0&title=0');
  const code = E.iframeCode(BASE, o, lay());
  assert.match(code, /src="https:\/\/reykjanesbaer\.github\.io\/laus-storf-opus-futura\/\?theme=light&frame=0&title=0"/);
  assert.equal(/accent=|radius=|view=/.test(code), false);
});

test('iframe: hæð, breidd, hámarksbreidd og staðsetning', () => {
  const code = E.iframeCode(BASE, C.defaults(), lay({ height: 1400, width: '80%', maxw: '720px', align: 'center' }));
  assert.match(code, /style="width:80%;max-width:min\(720px,100%\);height:1400px;border:0;display:block;margin-left:auto;margin-right:auto;"/);
});

test('iframe: engin scrolling="no" — innri skrun helst þegar störfin eru fleiri en hæðin leyfir', () => {
  const code = E.iframeCode(BASE, C.defaults(), lay());
  assert.equal(/scrolling/i.test(code), false);
  assert.equal(/overflow:\s*hidden/i.test(code), false);
});

test('iframe: gildin í slóðinni geta ekki rofið eigindina', () => {
  const o = C.parse({ dept: '"><script>alert(1)</script>&x=1' });
  const code = E.iframeCode(BASE, o, lay());
  assert.equal(code.includes('<script'), false);
  assert.equal(code.split('\n').length, 6, 'engin aukalína');
  assert.match(code, /dept=%22%3E%3Cscript%3Ealert%281%29%3C%2Fscript%3E%26x%3D1/);
});

test('iframe: slóðin skilar sömu stillingum til baka (umferð fram og til baka)', () => {
  const o = C.parse('theme=dark&accent=2760AB&bg=F7F9FB&radius=0&frame=0&title=0&intro=0&search=0&filters=0&groups=0&dates=0&desc=0&deadline=0&sort=title&spacing=normal&view=cards&dept=Velfer%C3%B0arsvi%C3%B0');
  const src = /src="([^"]+)"/.exec(E.iframeCode(BASE, o, lay()))[1];
  assert.deepEqual(C.parse(new URL(src).search), o);
});

test('allar færibreytur hafa nöfn sem eru örugg í HTML án þess að skrifa „&“ sem „&amp;“', () => {
  /* Ef nafn byrjar á nafngreindri einingu án semíkommu er hún samt ekki afkóðuð í eigind
     þegar næsti stafur er „=“ eða bókstafur/tala — þetta tryggir að svo sé. */
  C.KEYS.forEach((k) => assert.match(k, /^[a-z]+$/, k));
});

test('script: sjálfgefið og með stillingum', () => {
  assert.equal(E.scriptCode(BASE, C.defaults(), lay()),
    '<script\n  src="https://reykjanesbaer.github.io/laus-storf-opus-futura/embed.js">\n</script>');
  const code = E.scriptCode(BASE, C.parse('theme=dark&frame=0&dept=A%26B%22'), lay({ width: '90%', maxw: '800px', align: 'right' }));
  assert.equal(code,
    '<script\n  src="https://reykjanesbaer.github.io/laus-storf-opus-futura/embed.js"\n' +
    '  data-theme="dark"\n  data-frame="0"\n  data-dept="A&amp;B&quot;"\n' +
    '  data-width="90%"\n  data-max-width="800px"\n  data-align="right">\n</script>');
});

test('slóð: bein slóð fær líka breidd og staðsetningu', () => {
  assert.equal(E.buildUrl(BASE, C.defaults(), null), BASE);
  assert.equal(E.buildUrl(BASE, C.parse('frame=0'), lay({ width: '80%', maxw: '720px', align: 'center' })),
    BASE + '?frame=0&width=80%25&maxw=720px&align=center');
  const url = E.buildUrl(BASE, C.parse('frame=0&view=cards'), lay({ width: '80%', maxw: '720px', align: 'center' }));
  assert.deepEqual(C.parseLayout(new URL(url).search), lay({ width: '80%', maxw: '720px', align: 'center' }));
  assert.deepEqual(C.parse(new URL(url).search), C.parse('frame=0&view=cards'));
});

test('grunnslóð: GitHub Pages undirslóð er virt, staðbundið fær framleiðsluslóð', () => {
  const pages = E.resolveBase({ protocol: 'https:', hostname: 'reykjanesbaer.github.io',
    href: 'https://reykjanesbaer.github.io/laus-storf-opus-futura/ritstjorn/?theme=dark#x' });
  assert.deepEqual(pages, { base: 'https://reykjanesbaer.github.io/laus-storf-opus-futura/', local: false });

  const fork = E.resolveBase({ protocol: 'https:', hostname: 'annad.github.io', href: 'https://annad.github.io/eigin-slod/ritstjorn/' });
  assert.equal(fork.base, 'https://annad.github.io/eigin-slod/');

  ['localhost', '127.0.0.1'].forEach((hostname) => {
    const r = E.resolveBase({ protocol: 'http:', hostname, href: 'http://' + hostname + ':8080/ritstjorn/' });
    assert.deepEqual(r, { base: C.PRODUCTION_BASE, local: true });
  });
  assert.equal(E.resolveBase({ protocol: 'file:', hostname: '', href: 'file:///x/ritstjorn/index.html' }).local, true);
});

test('framleiðsluslóðir eru þær sem verkbeiðnin tilgreinir', () => {
  assert.equal(C.PRODUCTION_BASE, 'https://reykjanesbaer.github.io/laus-storf-opus-futura/');
});
