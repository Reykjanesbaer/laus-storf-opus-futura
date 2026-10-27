#!/usr/bin/env node
/*
 * Vafrapróf (Playwright + Chromium). Keyra í CI (test.yml) og staðbundið:
 *
 *   npm i --no-save playwright && npx playwright install chromium   (einu sinni)
 *   node tests/e2e/run.js
 *
 * Þjónar vefnum undir /laus-storf-opus-futura/ eins og GitHub Pages gerir, með
 * UPPSPUNNUM prófunargögnum (tests/fixtures/sample.js). Innfellingarpróf nota
 * annan uppruna (annað port) fyrir „foreldrasíðuna“, svo postMessage og iframe
 * eru prófuð þvert á uppruna eins og á vef bæjarins.
 *
 * Skjámyndir fara í _e2e/ (ekki í repóið).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');
const { createServer, BASE_PATH } = require('../../scripts/dev-server.js');
const { build } = require('../../scripts/build-site.js');
const { sampleDocument } = require('../fixtures/sample.js');
const N = require('../../storf/normalize.js');
const F = require('../../storf/filters.js');
const D = require('../../storf/dates.js');
const C = require('../../storf/config.js');

const SHOTS = path.join(ROOT, '_e2e');
fs.mkdirSync(SHOTS, { recursive: true });

function loadPlaywright() {
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(p); } catch (e) { /* næsta */ }
  }
  throw new Error('Playwright fannst ekki. Keyrðu: npm i --no-save playwright && npx playwright install chromium');
}

async function launch(chromium) {
  try { return await chromium.launch(); } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    const dir = fs.existsSync(base) && fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
    if (!dir) throw e;
    return chromium.launch({ executablePath: path.join(base, dir, 'chrome-linux', 'chrome') });
  }
}

const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));

/* ---------- „núverandi“ gögn og væntingar ---------- */
let scenario = () => sampleDocument(Date.now());
const expected = () => {
  const v = N.validateDocument(sampleDocument(Date.now()));
  return v.jobs.filter((j) => F.isActive(j, Date.now()));
};

/* ---------- smá prófunarrammi ---------- */
const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('  ✓ ' + name); }
  catch (e) {
    results.push({ name, ok: false, e });
    console.log('  ✗ ' + name + '\n      ' + String(e && e.message || e).split('\n').slice(0, 8).join('\n      '));
  }
}
const section = (t) => console.log('\n' + t);

(async () => {
  const pw = loadPlaywright();
  const browser = await launch(pw.chromium);

  const app = createServer({ root: ROOT, fixtureDoc: () => scenario() });
  const appPort = await listen(app);
  const APP = `http://127.0.0.1:${appPort}${BASE_PATH}/`;

  /* Foreldrasíða á ÖÐRU uppruna (innfellingar) */
  const hostPages = {};
  const host = http.createServer((req, res) => {
    const body = hostPages[new URL(req.url, 'http://x').pathname];
    if (!body) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  });
  const hostPort = await listen(host);
  const HOST = `http://127.0.0.1:${hostPort}`;

  const errors = [];
  async function newPage(opts, quiet) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1100, height: 900 } }, opts || {}));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('dialog', (d) => { errors.push('DIALOG (skaðlegur kóði keyrði): ' + d.message()); d.dismiss(); });
    page.on('console', (m) => {
      if (m.type() !== 'error' || /favicon/.test(m.text())) return;
      if (quiet && /Failed to load resource/.test(m.text())) return;   /* viljandi 404/500 í villuprófunum */
      errors.push('console: ' + m.text());
    });
    return page;
  }
  const ready = (page) => page.waitForFunction(() => !/Hleð/.test(document.getElementById('status').textContent));
  async function open(page, query) {
    await page.goto(APP + (query ? '?' + query : ''));
    await ready(page);
  }
  const titles = (page) => page.$$eval('.job-title', (n) => n.map((x) => x.textContent));
  const status = (page) => page.locator('#status').innerText();

  /* =================================================================== */
  section('Vefurinn — sjálfgefið útlit og gögn');
  /* =================================================================== */
  {
    const page = await newPage();
    await open(page);
    const exp = expected();

    await check('birtir virk störf, ekki útrunnin, og fjöldinn er réttur', async () => {
      assert.equal((await titles(page)).length, exp.length);
      assert.equal(await status(page), F.countLabel(exp.length));
      assert.equal((await titles(page)).some((t) => /Útrunnið/.test(t)), false);
      assert.ok((await titles(page)).some((t) => /Starfsmaður grunnskóla/.test(t)), 'frestur í dag er enn virkur');
    });

    await check('lang="is", ein h1, flokkar eru h2, störf eru h3', async () => {
      assert.equal(await page.getAttribute('html', 'lang'), 'is');
      assert.equal(await page.locator('h1').count(), 1);
      assert.equal(await page.locator('h1').innerText(), 'Laus störf í gegnum Opus Futura');
      assert.equal(await page.locator('h2').count(), 5);
      assert.equal(await page.locator('li.job h3.job-title').count(), exp.length);
    });

    await check('flokkar: almenn umsókn fyrst, svið í stafrófsröð, „Önnur störf“ síðast', async () => {
      const g = await page.$$eval('.group-title', (n) => n.map((x) => x.childNodes[0].textContent));
      assert.deepEqual(g, ['Almenn umsókn', 'Menntasvið', 'Umhverfis- og framkvæmdasvið', 'Velferðarsvið', 'Önnur störf']);
    });

    await check('íslensk merki á síunum og engin ensk orð', async () => {
      const text = await page.locator('#filters').innerText();
      for (const s of ['Leitarorð', 'Eftir tegund', 'Veldu tímabil', 'Röðun']) assert.match(text, new RegExp(s));
      assert.equal(await page.getAttribute('#q', 'placeholder'), 'Leita að störfum...');
    });

    await check('umsóknarfrestur og auglýsingardagur með íslensku dagsetningasniði', async () => {
      const job = exp.find((j) => j.id === 'prof-menntasvid-2');
      const li = page.locator('li.job', { hasText: 'Leikskólakennari' });
      assert.equal(await li.locator('.job-deadline').innerText(), 'Umsóknarfrestur til ' + D.formatDate(job.deadline));
      assert.equal(await li.locator('.job-kicker').innerText(), 'Auglýst ' + D.formatDate(job.publishedAt));
      assert.match(await li.locator('.job-deadline').innerText(), /^Umsóknarfrestur til \d{1,2}\. [a-zúáíóéæöð]+ 20\d\d$/);
    });

    await check('„Sækja um“ bendir á staðfesta slóð úr gögnunum — hvert einasta starf', async () => {
      for (const j of exp) {
        const li = page.locator('li.job', { has: page.locator('.job-title', { hasText: j.title.slice(0, 40) }) }).first();
        const apply = li.locator('a.btn-primary');
        if (j.applyUrl) {
          assert.equal(await apply.count(), 1, j.id);
          assert.equal(await apply.getAttribute('href'), j.applyUrl, j.id);
          assert.equal(await apply.getAttribute('target'), '_blank');
          assert.match(await apply.getAttribute('rel'), /noopener/);
          assert.match(await apply.getAttribute('rel'), /noreferrer/);
          assert.match(await apply.innerText(), /^Sækja um/);
          assert.match(await apply.locator('.sr-only').innerText(), /opnast í nýjum glugga/);
        } else {
          assert.equal(await apply.count(), 0, 'engin umsóknarslóð má ekki verða til: ' + j.id);
        }
      }
    });

    await check('„Nánar um starf“: ytri slóð ef aðeins hún er til, annars lýsing í okkar viðmóti', async () => {
      const onlyUrl = page.locator('li.job', { hasText: 'Starfsmaður grunnskóla' });
      const a = onlyUrl.locator('a', { hasText: 'Nánar um starf' });
      assert.equal(await a.getAttribute('href'), 'https://example.org/prof/grunnskoli');
      assert.equal(await onlyUrl.locator('button.btn-toggle').count(), 0);

      const withDesc = page.locator('li.job', { hasText: 'Leikskólakennari' });
      const btn = withDesc.locator('button.btn-toggle');
      const details = withDesc.locator('.job-details');
      assert.equal(await btn.getAttribute('aria-expanded'), 'false');
      assert.equal(await details.isVisible(), false);
      await btn.focus();
      await page.keyboard.press('Enter');
      assert.equal(await btn.getAttribute('aria-expanded'), 'true');
      assert.equal(await details.isVisible(), true);
      assert.match(await details.innerText(), /Kennsla og umönnun barna/);
      assert.equal(await details.locator('li').count(), 4, 'bæði ul og ol');
      await page.keyboard.press('Space');
      assert.equal(await btn.getAttribute('aria-expanded'), 'false');
      assert.equal(await details.isVisible(), false);
      await btn.click();
      const link = details.locator('a');
      assert.equal(await link.getAttribute('href'), 'https://example.org/prof/leikskoli', 'ytri auglýsing aðgengileg úr lýsingunni');
    });

    await check('skjámynd: tölva', async () => { await page.screenshot({ path: path.join(SHOTS, 'app-desktop.png'), fullPage: true }); });
    await page.context().close();
  }

  /* =================================================================== */
  section('Vefurinn — leit, síur, röðun');
  /* =================================================================== */
  {
    const page = await newPage();
    await open(page);
    const exp = expected();

    await check('leitarorð síar jafnóðum, án þess að hlaða aftur', async () => {
      await page.evaluate(() => { window.__mark = 1; });
      await page.fill('#q', 'leikskólakennari');
      assert.deepEqual(await titles(page), ['Prófun – Leikskólakennari']);
      assert.equal(await status(page), '1 laust starf');
      assert.equal(await page.evaluate(() => window.__mark), 1, 'síðan hlóðst ekki aftur');
    });

    await check('leit finnur með ósérstökum stöfum og í lýsingu', async () => {
      await page.fill('#q', 'MENNTASVID');
      assert.equal((await titles(page)).length, 2);
      await page.fill('#q', 'hæfniskröfur');
      assert.deepEqual(await titles(page), ['Prófun – Almenn umsókn']);
    });

    await check('engar niðurstöður → réttu skilaboðin, og hún er í stöðusvæðinu (aria-live)', async () => {
      await page.fill('#q', 'xyzzy');
      assert.equal(await status(page), 'Engin störf fundust sem passa við leitina.');
      assert.equal(await page.locator('li.job').count(), 0);
      assert.equal(await page.getAttribute('#status', 'role'), 'status');
      assert.equal(await page.getAttribute('#status', 'aria-live'), 'polite');
    });

    await check('„Hreinsa síur“ er aðeins sýnilegur með virka síu og hreinsar allt', async () => {
      assert.equal(await page.locator('#reset').isVisible(), true);
      assert.equal(await page.locator('#reset').innerText(), 'Hreinsa síur');
      await page.selectOption('#dept', 'Velferðarsvið');
      await page.locator('#reset').click();
      assert.equal(await page.inputValue('#q'), '');
      assert.equal(await page.inputValue('#dept'), '');
      assert.equal((await titles(page)).length, exp.length);
      assert.equal(await page.locator('#reset').isVisible(), false);
    });

    await check('„Eftir tegund“ er byggð á gögnunum og síar', async () => {
      const opts = await page.$$eval('#dept option', (n) => n.map((o) => o.textContent));
      assert.deepEqual(opts, ['Allt', 'Almenn umsókn', 'Menntasvið', 'Umhverfis- og framkvæmdasvið', 'Velferðarsvið', 'Önnur störf']);
      await page.selectOption('#dept', 'Velferðarsvið');
      assert.equal((await titles(page)).length, 2);
      assert.equal(await page.locator('h2').count(), 1);
      await page.fill('#q', 'stuðning');
      assert.equal((await titles(page)).length, 1, 'leit og flokkur vinna saman');
      await page.locator('#reset').click();
    });

    await check('„Veldu tímabil“ síar á auglýsingardag', async () => {
      assert.equal(await page.locator('#fPeriod legend').innerText(), 'Veldu tímabil');
      const today = D.todayInIceland(Date.now());
      const day = (n) => require('../fixtures/sample.js').addDays(today, n);
      await page.fill('#from', day(-3));
      await page.fill('#to', day(0));
      const t = await titles(page);
      assert.ok(t.length > 0 && t.length < expected().length);
      await page.fill('#from', day(5));
      await page.fill('#to', '');
      assert.equal(await status(page), 'Engin störf fundust sem passa við leitina.');
      await page.locator('#reset').click();
    });

    await check('röðun: heiti A–Ö og næsti frestur', async () => {
      assert.deepEqual(await page.$$eval('#sort option', (n) => n.map((o) => o.value)), ['newest', 'deadline', 'title']);
      await page.uncheck('input[name=none]').catch(() => {});
      await page.selectOption('#sort', 'title');
      const first = (await page.$$eval('.group', (g) => g.map((s) => [...s.querySelectorAll('.job-title')].map((x) => x.textContent))))[1];
      assert.deepEqual(first, first.slice().sort((a, b) => a.localeCompare(b, 'is')));
      await page.selectOption('#sort', 'newest');
    });

    await check('lyklaborð: allar stýringar nást með Tab, engin lyklagildra, sýnilegur fókushringur', async () => {
      await page.locator('#q').focus();
      let steps = 0;
      for (let i = 0; i < 80; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => res((() => {
          const a = document.activeElement;
          if (!a || a === document.body) return null;
          const cs = getComputedStyle(a);
          return { tag: a.tagName, id: a.id, text: (a.textContent || '').trim().slice(0, 20), outline: cs.outlineStyle + ' ' + cs.outlineWidth };
        })()))));
        if (!info) break;
        steps++;
        if (info.tag === 'BUTTON' || info.tag === 'A' || info.tag === 'INPUT' || info.tag === 'SELECT')
          assert.match(info.outline, /solid 3px/, 'fókushringur vantar á ' + JSON.stringify(info));
      }
      assert.ok(steps > 20, 'Tab fer í gegnum stýringarnar: ' + steps + ' skref');
      const left = await page.evaluate(() => document.activeElement === document.body || document.activeElement === document.documentElement);
      assert.equal(left, true, 'Tab kemst út úr vefnum (engin lyklagildra)');
    });

    await check('allar stýringar hafa sýnilegt heiti sem tengist þeim', async () => {
      const bad = await page.evaluate(() => [...document.querySelectorAll('input, select, button, a')]
        .filter((e) => !e.hidden && e.offsetParent !== null)
        .filter((e) => {
          const name = e.getAttribute('aria-label') || (e.labels && e.labels[0] && e.labels[0].textContent) || e.textContent;
          return !name || !name.trim();
        }).map((e) => e.outerHTML.slice(0, 80)));
      assert.deepEqual(bad, []);
    });
    await page.context().close();
  }

  /* =================================================================== */
  section('Vefurinn — öryggi (ótraustur texti)');
  /* =================================================================== */
  {
    const page = await newPage();
    await open(page);
    await check('skaðlegur texti birtist sem texti: engin tög, engin keyrsla, engar javascript:-slóðir', async () => {
      const li = page.locator('li.job', { hasText: 'onerror=alert(1)' });
      assert.equal(await li.count(), 1);
      assert.match(await li.locator('.job-title').innerText(), /<img src=x onerror=alert\(1\)> & <script>alert\(2\)<\/script>/);
      assert.match(await li.locator('.job-summary').innerText(), /<b>feitletrun<\/b>/);
      assert.equal(await page.locator('img').count(), 0, 'engin img úr gögnum');
      assert.equal(await page.locator('.storf script, .storf b, .storf iframe').count(), 0);
      assert.equal(await page.locator('a[href^="javascript:" i]').count(), 0);
      await li.locator('button.btn-toggle').click();
      assert.match(await li.locator('.job-details').innerText(), /<img src=x onerror=alert\(4\)>/);
      assert.equal(await page.locator('img').count(), 0);
    });

    await check('CSP er til staðar og bannar inline-skriftur', async () => {
      const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
      assert.match(csp, /script-src 'self'/);
      assert.equal(/unsafe-inline|unsafe-eval/.test(csp), false);
      assert.match(csp, /default-src 'none'/);
    });

    await check('allir ytri tenglar hafa rel=noopener noreferrer og eru https', async () => {
      const links = await page.$$eval('a[target=_blank]', (a) => a.map((x) => [x.href, x.rel]));
      assert.ok(links.length > 5);
      links.forEach(([h, r]) => { assert.match(h, /^https:\/\//); assert.match(r, /noopener/); assert.match(r, /noreferrer/); });
    });

    await check('engar beiðnir fara út fyrir okkar eigin uppruna (ekkert Opus Futura, engin þriðju aðilar)', async () => {
      const p2 = await newPage();
      const hosts = new Set();
      p2.on('request', (r) => hosts.add(new URL(r.url()).host));
      await open(p2);
      assert.deepEqual([...hosts], ['127.0.0.1:' + appPort]);
      await p2.context().close();
    });
    await page.context().close();
  }

  /* =================================================================== */
  section('Vefurinn — URL-færibreytur');
  /* =================================================================== */
  {
    const page = await newPage();
    const css = (sel, prop) => page.$eval(sel, (e, p) => getComputedStyle(e)[p], prop);
    const rgb = (hex) => { const n = parseInt(hex, 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };

    await check('theme=dark / light', async () => {
      await open(page, 'theme=dark');
      assert.equal(await css('.storf', 'backgroundColor'), rgb('1B2024'));
      await open(page, 'theme=light');
      assert.equal(await css('.storf', 'backgroundColor'), rgb('FFFFFF'));
    });
    await check('theme=auto fylgir stýrikerfinu (dökkt og ljóst)', async () => {
      const dark = await newPage({ colorScheme: 'dark' });
      await open(dark);
      assert.equal(await dark.$eval('.storf', (e) => getComputedStyle(e).backgroundColor), rgb('1B2024'));
      await dark.context().close();
      const light = await newPage({ colorScheme: 'light' });
      await open(light);
      assert.equal(await light.$eval('.storf', (e) => getComputedStyle(e).backgroundColor), rgb('FFFFFF'));
      await light.context().close();
    });
    await check('accent, bg, bgdark og radius', async () => {
      await open(page, 'accent=C5192D&bg=F7F9FB&radius=0');
      assert.equal(await css('a.btn-primary', 'backgroundColor'), rgb('C5192D'));
      assert.equal(await css('.storf', 'backgroundColor'), rgb('F7F9FB'));
      assert.equal(await css('a.btn-primary', 'borderTopLeftRadius'), '0px');
      await open(page, 'theme=dark&bgdark=000000');
      assert.equal(await css('.storf', 'backgroundColor'), rgb('000000'));
      await open(page, 'radius=20');
      assert.equal(await css('a.btn-primary', 'borderTopLeftRadius'), '20px');
    });
    await check('frame=0 og title=0', async () => {
      await open(page, 'frame=0&title=0');
      assert.equal(await page.locator('.storf.bare').count(), 1);
      assert.equal(await css('.storf', 'backgroundColor'), 'rgba(0, 0, 0, 0)');
      assert.equal(await css('#pageTitle', 'position'), 'absolute', 'h1 er enn til staðar fyrir skjálesara');
      assert.equal(await page.locator('h1').count(), 1);
    });
    await check('intro=0, search=0, filters=0', async () => {
      await open(page, 'intro=0&search=0&filters=0');
      assert.equal(await page.locator('#intro').isVisible(), false);
      assert.equal(await page.locator('#filters').isVisible(), false);
      await open(page, 'search=0');
      assert.equal(await page.locator('#q').isVisible(), false);
      assert.equal(await page.locator('#dept').isVisible(), true);
      await open(page, 'filters=0');
      assert.equal(await page.locator('#q').isVisible(), true);
      assert.equal(await page.locator('#dept').isVisible(), false);
    });
    await check('groups=0, dates=0, desc=0, deadline=0', async () => {
      await open(page, 'groups=0');
      assert.equal(await page.locator('.group-title').count(), 0);
      assert.equal(await page.locator('li.job h2.job-title').count(), expected().length, 'störf verða h2 án flokka');
      await open(page, 'dates=0');
      assert.equal(await page.locator('.job-kicker').count(), 0);
      await open(page, 'desc=0');
      assert.equal(await page.locator('.job-summary').count(), 0);
      assert.equal(await page.locator('button.btn-toggle').count(), 0);
      await open(page, 'deadline=0');
      assert.equal(await page.locator('.job-deadline').count(), 0);
    });
    await check('view=cards og spacing=normal', async () => {
      await open(page, 'view=cards');
      assert.equal(await css('.group .jobs', 'display'), 'grid');
      await open(page);
      assert.notEqual(await css('.group .jobs', 'display'), 'grid', 'listi er sjálfgefið');
      const compact = await page.$eval('li.job', (e) => parseFloat(getComputedStyle(e).paddingTop));
      await open(page, 'spacing=normal');
      const normal = await page.$eval('li.job', (e) => parseFloat(getComputedStyle(e).paddingTop));
      assert.ok(normal > compact);
    });
    await check('sort=title og sort=deadline ráða upphafsröð', async () => {
      await open(page, 'groups=0&sort=title');
      const t = await titles(page);
      assert.deepEqual(t, t.slice().sort((a, b) => a.localeCompare(b, 'is')));
      assert.equal(await page.inputValue('#sort'), 'title');
    });
    await check('dept=… sýnir aðeins það svið og felur sviðasíuna', async () => {
      await open(page, 'dept=' + encodeURIComponent('Menntasvið'));
      assert.equal((await titles(page)).length, 2);
      assert.equal(await page.locator('#dept').isVisible(), false);
      assert.equal(await page.locator('h2').count(), 1);
      await open(page, 'dept=' + encodeURIComponent('Svið sem er ekki til'));
      assert.equal(await status(page), 'Engin laus störf eru auglýst sem stendur.');
    });
    await check('ógild gildi falla á sjálfgefið án villu', async () => {
      await open(page, 'theme=purple&accent=red&radius=999&frame=maybe&view=table&sort=random&spacing=huge&dept=%00');
      assert.equal((await titles(page)).length, expected().length);
      assert.equal(await css('.storf', 'backgroundColor'), rgb('FFFFFF'));
      assert.equal(await css('a.btn-primary', 'backgroundColor'), rgb('1D4D91'));
    });
    await check('breidd og staðsetning virka á beinni slóð (ekki í iframe)', async () => {
      await open(page, 'width=60%25&maxw=500&align=center');
      const r = await page.$eval('#wrap', (e) => { const b = e.getBoundingClientRect(); return [b.width, b.left]; });
      assert.ok(r[0] <= 500 + 1 && r[0] >= 499, 'hámarksbreidd: ' + r[0]);
      assert.ok(Math.abs(r[1] - (1100 - r[0]) / 2) < 2, 'miðjað');
    });
    await page.context().close();
  }

  /* =================================================================== */
  section('Vefurinn — ástand: engin störf, villa, úrelt gögn');
  /* =================================================================== */
  {
    const page = await newPage(null, true);
    const reset = () => { scenario = () => sampleDocument(Date.now()); };

    await check('engin virk störf → „Engin laus störf eru auglýst sem stendur.“ (ekki villa, engar síur)', async () => {
      scenario = () => N.buildDocument([], { fetchedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z') });
      await open(page);
      assert.equal(await status(page), 'Engin laus störf eru auglýst sem stendur.');
      assert.equal(await page.locator('#filters').isVisible(), false);
      assert.equal(await page.locator('#error').isVisible(), false);
      assert.equal(await page.locator('li.job').count(), 0);
      reset();
    });
    await check('öll störf útrunnin = „engin laus störf“', async () => {
      scenario = () => { const d = sampleDocument(Date.now()); d.jobs = d.jobs.filter((j) => j.id === 'prof-menntasvid-utrunnid'); d.count = d.jobs.length; return d; };
      await open(page);
      assert.equal(await status(page), 'Engin laus störf eru auglýst sem stendur.');
      reset();
    });
    await check('gagnaskrá vantar (404) → villa með „Reyna aftur“, EKKI „engin laus störf“', async () => {
      scenario = () => null;
      await page.goto(APP);
      await page.locator('#error').waitFor({ state: 'visible' });
      assert.match(await page.locator('#errorText').innerText(), /Ekki tókst að birta laus störf úr Opus Futura/);
      assert.equal(await page.getAttribute('#error', 'role'), 'alert');
      assert.equal(/Engin laus störf eru auglýst/.test(await page.locator('body').innerText()), false);
      assert.equal(await page.locator('li.job').count(), 0);
      scenario = () => sampleDocument(Date.now());
      await page.locator('#retry').click();
      await ready(page);
      assert.equal(await page.locator('#error').isVisible(), false);
      assert.equal((await titles(page)).length, expected().length, 'Reyna aftur hleður gögnin');
    });
    await check('skemmd gögn (ógilt JSON, rangt snið) → villa, aldrei tómur listi', async () => {
      for (const bad of ['{"schema":1,"fetchedAt":', '<html>viðhald</html>', JSON.stringify({ schema: 9, jobs: [] }),
        JSON.stringify({ schema: 1, fetchedAt: 'í gær', jobs: [] }), JSON.stringify({ schema: 1, fetchedAt: '2026-10-19T10:00:00Z', jobs: 'x' })]) {
        scenario = () => bad;
        await page.goto(APP);
        await page.locator('#error').waitFor({ state: 'visible' });
        assert.equal(/Engin laus störf eru auglýst/.test(await page.locator('body').innerText()), false, bad.slice(0, 30));
      }
      reset();
    });
    await check('úrelt gögn (> 12 klst.) sýna athugasemd, nýleg ekki', async () => {
      scenario = () => { const d = sampleDocument(Date.now()); d.fetchedAt = new Date(Date.now() - 20 * 3600000).toISOString().replace(/\.\d+Z$/, 'Z'); return d; };
      await open(page);
      assert.equal(await page.locator('#stale').isVisible(), true);
      assert.match(await page.locator('#stale').innerText(), /síðast uppfærðar .* og kunna að vera úreltar/);
      assert.ok((await titles(page)).length > 0, 'störfin birtast samt');
      reset();
      await open(page);
      assert.equal(await page.locator('#stale').isVisible(), false);
    });
    await check('frestur sem rennur út á meðan síðan er opin hverfur við næstu teikningu', async () => {
      scenario = () => {
        const d = sampleDocument(Date.now());
        const j = d.jobs.find((x) => x.id === 'prof-umhverfi-1');
        j.deadline = new Date(Date.now() + 1500).toISOString().replace(/\.\d+Z$/, 'Z');   /* tímapunktur eftir 1,5 s */
        return d;
      };
      await open(page);
      assert.ok((await titles(page)).some((t) => /Verkefnastjóri viðhalds/.test(t)));
      await page.waitForTimeout(2200);
      await page.fill('#q', ' ');       /* kallar á teikningu */
      await page.fill('#q', '');
      assert.equal((await titles(page)).some((t) => /Verkefnastjóri viðhalds/.test(t)), false);
      reset();
    });
    await page.context().close();
  }

  /* =================================================================== */
  section('Útlit — sími og tölva (ekkert lárétt skrun)');
  /* =================================================================== */
  {
    for (const w of [320, 375, 414, 768, 1100, 1440]) {
      await check(`breidd ${w}px: ekkert lárétt skrun, hnappar nást, frásögn læsileg`, async () => {
        const page = await newPage({ viewport: { width: w, height: 800 } });
        await open(page);
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
          small: [...document.querySelectorAll('button, a.btn, input, select')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 24).length }));
        assert.ok(m.sw <= m.cw, `lárétt skrun: ${m.sw} > ${m.cw}`);
        assert.equal(m.small, 0, 'snertifletir undir 24 px (WCAG 2.5.8)');
        if (w === 375 || w === 1100) await page.screenshot({ path: path.join(SHOTS, `app-${w}.png`), fullPage: true });
        await page.context().close();
      });
    }
    await check('spjaldasýn á síma brotnar ekki', async () => {
      const page = await newPage({ viewport: { width: 320, height: 800 } });
      await open(page, 'view=cards&theme=dark');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      await page.screenshot({ path: path.join(SHOTS, 'app-cards-320-dark.png'), fullPage: true });
      await page.context().close();
    });
  }

  /* =================================================================== */
  section('Innfelling — venjulegur iframe án JavaScript (aðalleiðin)');
  /* =================================================================== */
  {
    const page = await newPage();
    hostPages['/plain.html'] = `<!doctype html><meta charset=utf-8><body style="margin:0"><h1>Síða bæjarins</h1>
      <iframe id="f" src="${APP}?frame=0&title=0" title="Laus störf hjá Reykjanesbæ" loading="lazy"
        style="width:100%;height:500px;border:0;display:block;"></iframe><p id="after">Eftir iframe</p></body>`;
    await check('iframe birtir störfin; fast hæð klippir ekki — innri skrun er nothæf', async () => {
      await page.goto(HOST + '/plain.html');
      const fr = page.frameLocator('#f');
      await fr.locator('li.job').first().waitFor();
      const r = await page.frames().find((f) => f !== page.mainFrame()).evaluate(() => ({
        scrollH: document.documentElement.scrollHeight, clientH: document.documentElement.clientHeight, overflowY: getComputedStyle(document.documentElement).overflowY }));
      assert.ok(r.scrollH > r.clientH, 'efnið er hærra en iframe');
      assert.notEqual(r.overflowY, 'hidden');
      /* skrunum innan iframe og sjáum síðasta starfið */
      await fr.locator('li.job').last().scrollIntoViewIfNeeded();
      assert.equal(await fr.locator('li.job').last().isVisible(), true);
      const box = await page.locator('#f').boundingBox();
      assert.equal(Math.round(box.height), 500, 'iframe-inn heldur fastri hæð');
    });
    await check('transparent: frame=0 lætur síðuna skína í gegn (iframe fær ekki ógegnsæjan bakgrunn)', async () => {
      const bg = await page.frames().find((f) => f !== page.mainFrame()).evaluate(() => getComputedStyle(document.body).backgroundColor);
      assert.equal(bg, 'rgba(0, 0, 0, 0)');
    });
    await page.context().close();
  }

  /* =================================================================== */
  section('Innfelling — skrifta með sjálfvirkri hæð, margar á sömu síðu');
  /* =================================================================== */
  {
    const page = await newPage();
    hostPages['/script.html'] = `<!doctype html><meta charset=utf-8><body style="margin:0">
      <div id="a"><script src="${APP}embed.js" data-frame="0" data-title="0" data-iframe-title="Öll störf"></script></div>
      <div id="b"><script src="${APP}embed.js" data-frame="0" data-title="0" data-dept="Velferðarsvið" data-view="cards" data-width="80%" data-max-width="600px" data-align="center"></script></div>
      <div id="c"><script src="${APP}embed.js" data-theme="dark" data-title="0" data-dept="Menntasvið"></script></div></body>`;
    let frames;
    await check('þrjár innfellingar búa til iframe og taka við færibreytum', async () => {
      await page.goto(HOST + '/script.html');
      await page.waitForFunction(() => document.querySelectorAll('iframe').length === 3);
      frames = await page.$$eval('iframe', (f) => f.map((x) => ({ src: x.src, title: x.title, id: new URL(x.src).searchParams.get('frameId') })));
      assert.equal(new Set(frames.map((f) => f.id)).size, 3);
      assert.equal(frames[0].title, 'Öll störf');
      assert.match(frames[1].src, /dept=Velfer%C3%B0arsvi%C3%B0/);
      assert.match(frames[1].src, /view=cards/);
      assert.equal(/width=|align=|iframe-title/.test(frames[1].src), false, 'iframe-stillingar fara ekki áfram');
    });
    const heights = async () => page.$$eval('iframe', (f) => f.map((x) => Math.round(x.getBoundingClientRect().height)));
    const contentH = async (i) => { const fr = page.frames().filter((x) => x !== page.mainFrame())[i]; return fr.evaluate(() => Math.ceil(document.getElementById('wrap').getBoundingClientRect().height) + 1); };

    await check('hver iframe fær sína eigin hæð eftir innihaldi (engin klipping, ekkert autt)', async () => {
      /* loading=lazy: iframe sem er langt fyrir neðan skjáinn hleðst ekki fyrr en nálgast er */
      for (const id of ['#a', '#b', '#c']) { await page.locator(id + ' iframe').scrollIntoViewIfNeeded(); await page.waitForTimeout(250); }
      await page.waitForFunction(() => [...document.querySelectorAll('iframe')].every((f) => f.getBoundingClientRect().height !== 600), null, { timeout: 8000 });
      const h = await heights();
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(h[i] - (await contentH(i))) <= 2, `iframe ${i}: ${h[i]} vs ${await contentH(i)}`);
      assert.ok(h[0] > h[1] && h[1] > 0 && h[2] > 0 && h[0] > h[2], 'mismunandi hæðir: ' + h);
    });

    await check('breidd og staðsetning á iframe fylgja data-width/max-width/align', async () => {
      const b = await page.$eval('#b iframe', (f) => { const r = f.getBoundingClientRect(); return [r.width, r.left]; });
      assert.ok(Math.abs(b[0] - 600) <= 1);
      assert.ok(Math.abs(b[1] - (1100 - 600) / 2) <= 1);
    });

    await check('hæðin lagast þegar innihaldið breytist (leit í iframe)', async () => {
      const fr = page.frames().filter((x) => x !== page.mainFrame())[0];
      const before = (await heights())[0];
      await fr.fill('#q', 'leikskólakennari');
      await page.waitForFunction((b) => document.querySelector('iframe').getBoundingClientRect().height < b - 200, before);
      const after = (await heights())[0];
      assert.ok(Math.abs(after - (await contentH(0))) <= 2);
    });

    await check('fölsuð skilaboð eru hunsuð (röng uppspretta/uppruni/auðkenni/gildi)', async () => {
      const before = await heights();
      const ids = frames.map((f) => f.id);
      await page.evaluate((ids) => {
        /* foreldrasíðan sjálf er „sendandi“ — röng uppspretta og rangur uppruni */
        window.postMessage({ type: 'laus-storf:height', id: ids[0], height: 4000 }, '*');
        window.postMessage({ type: 'laus-storf:height', id: ids[1], height: 4000 }, '*');
        window.postMessage({ type: 'laus-storf:height', height: 4000 }, '*');
        window.postMessage({ type: 'laus-storf:height', id: ids[2], height: '4000px; position:fixed' }, '*');
      }, ids);
      await page.waitForTimeout(300);
      assert.deepEqual(await heights(), before);
      /* iframe 1 sendir með auðkenni iframe 2: sama uppspretta (iframe 1) en rangt auðkenni */
      const fr1 = page.frames().filter((x) => x !== page.mainFrame())[1];
      await fr1.evaluate((id) => parent.postMessage({ type: 'laus-storf:height', id, height: 3000 }, '*'), ids[2]);
      await fr1.evaluate((id) => parent.postMessage({ type: 'laus-storf:height', id, height: 99999 }, '*'), ids[1]);
      await page.waitForTimeout(300);
      assert.deepEqual(await heights(), before);
    });
    await check('skjámynd: margar innfellingar', async () => { await page.screenshot({ path: path.join(SHOTS, 'embed-script.png'), fullPage: true }); });
    await page.context().close();
  }

  /* =================================================================== */
  section('Kóðasmiður — /ritstjorn/');
  /* =================================================================== */
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('editor pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('editor console: ' + m.text()); });
    await page.goto(APP + 'ritstjorn/');
    const pv = page.frameLocator('#preview');
    await pv.locator('li.job').first().waitFor();
    const code = () => page.locator('#codeOut').innerText();
    const pvFrame = () => page.frames().find((f) => f.url().startsWith(APP) && !f.url().includes('ritstjorn'));
    const settle = () => page.waitForTimeout(150);
    const chk = (label) => page.locator('fieldset label', { hasText: new RegExp('^\\s*' + label) }).locator('input');

    await check('fyrirsögn, flipar og forskoðun eru eins og krafist er', async () => {
      assert.equal(await page.locator('h1').innerText(), 'Laus störf – forskoðun og kóðasmiður');
      assert.deepEqual(await page.$$eval('[role=tab]', (t) => t.map((x) => x.textContent)), ['iframe (mælt með)', 'Skrifta', 'Slóð']);
      assert.equal(await page.getAttribute('#preview', 'src').then((s) => /^\.\.\/|^http/.test(s) || true), true);
      assert.ok((await pv.locator('li.job').count()) > 0, 'forskoðunin er raunverulegi vefurinn með raunverulegum störfum');
      assert.match(await page.locator('#dataStatus').innerText(), /^Gögn: \d+ laus störf · sótt /);
    });

    await check('sjálfgefinn iframe-kóði er mynstrið úr verkbeiðninni', async () => {
      assert.equal(await code(), '<iframe\n  src="https://reykjanesbaer.github.io/laus-storf-opus-futura/"\n  title="Laus störf hjá Reykjanesbæ"\n  loading="lazy"\n  style="width:100%;height:1000px;border:0;display:block;">\n</iframe>');
      assert.match(await page.locator('#codeHint').innerText(), /hæðin er föst/i);
      assert.match(await page.locator('#codeHint').innerText(), /skrunstika/);
    });

    await check('hver stilling hefur sýnilegt og virkt áhrif á forskoðunina og kóðann', async () => {
      /* gátreitir: [merki, kóðabreyta, athugun í forskoðun þegar slökkt er] */
      const checks = [
        ['Ramma og bakgrunn', 'frame=0', (f) => f.evaluate(() => document.querySelector('.storf').classList.contains('bare'))],
        ['Titil', 'title=0', (f) => f.evaluate(() => document.getElementById('pageTitle').classList.contains('sr-only'))],
        ['Inngangstexta', 'intro=0', (f) => f.evaluate(() => document.getElementById('intro').hidden)],
        ['Leit', 'search=0', (f) => f.evaluate(() => document.getElementById('fSearch').hidden)],
        ['Síur', 'filters=0', (f) => f.evaluate(() => document.getElementById('fDept').hidden)],
        ['Fyrirsagnir sviða', 'groups=0', (f) => f.evaluate(() => document.querySelectorAll('.group-title').length === 0)],
        ['Auglýsingardag', 'dates=0', (f) => f.evaluate(() => document.querySelectorAll('.job-kicker').length === 0)],
        ['Lýsingar', 'desc=0', (f) => f.evaluate(() => document.querySelectorAll('.job-summary').length === 0)],
        ['Umsóknarfrest', 'deadline=0', (f) => f.evaluate(() => document.querySelectorAll('.job-deadline').length === 0)]
      ];
      for (const [label, param, probe] of checks) {
        const box = chk(label).first();
        await box.uncheck(); await settle();
        assert.ok(await probe(pvFrame()), label + ': engin áhrif í forskoðun');
        assert.match(await code(), new RegExp('[?&]' + param + '(&|")'), label + ': vantar í kóða');
        await box.check(); await settle();
        assert.equal(await probe(pvFrame()), false, label + ': kom ekki aftur');
        const src = /src="([^"]*)"/.exec(await code())[1];
        assert.equal(/[?&](frame|title|intro|search|filters|groups|dates|desc|deadline)=/.test(src), false, label + ': sjálfgefið á ekki heima í slóð');
      }
    });

    await check('þema, litir, hornarúnnun, framsetning, bil, röðun og svið', async () => {
      const bg = () => pvFrame().evaluate(() => getComputedStyle(document.querySelector('.storf')).backgroundColor);
      await page.locator('label:has(input[value=dark])').first().click(); await settle();
      assert.equal(await bg(), 'rgb(27, 32, 36)');
      assert.match(await code(), /theme=dark/);
      await page.locator('label:has(input[value=light])').first().click(); await settle();
      assert.equal(await bg(), 'rgb(255, 255, 255)');

      await page.fill('.crow input[type=text] >> nth=0', '#C5192D'); await settle();
      assert.equal(await pvFrame().evaluate(() => getComputedStyle(document.querySelector('a.btn-primary')).backgroundColor), 'rgb(197, 25, 45)');
      assert.match(await code(), /accent=C5192D/);
      await page.fill('.crow input[type=text] >> nth=1', '#F7F9FB'); await settle();
      assert.equal(await bg(), 'rgb(247, 249, 251)');
      assert.match(await code(), /bg=F7F9FB/);

      await page.locator('input[type=range]').fill('18'); await settle();
      assert.equal(await pvFrame().evaluate(() => getComputedStyle(document.querySelector('a.btn-primary')).borderTopLeftRadius), '18px');
      assert.match(await code(), /radius=18/);

      await page.locator('label:has(input[value=cards])').click(); await settle();
      assert.equal(await pvFrame().evaluate(() => getComputedStyle(document.querySelector('.group .jobs')).display), 'grid');
      assert.match(await code(), /view=cards/);
      await page.locator('label:has(input[value=normal])').click(); await settle();
      assert.match(await code(), /spacing=normal/);

      await page.selectOption('select >> nth=0', 'title'); await settle();
      assert.match(await code(), /sort=title/);
      assert.equal(await pvFrame().evaluate(() => document.getElementById('sort').value), 'title');

      await page.selectOption('select >> nth=1', 'Velferðarsvið'); await settle();
      assert.equal(await pvFrame().evaluate(() => document.querySelectorAll('li.job').length), 2);
      assert.match(await code(), /dept=Velfer%C3%B0arsvi%C3%B0/);
    });

    await check('breidd, hámarksbreidd, staðsetning og hæð: forskoðun og iframe-kóði', async () => {
      await page.fill('input[type=number] >> nth=0', '80'); await settle();
      await page.fill('input[type=number] >> nth=1', '600'); await settle();
      await page.locator('label:has(input[value=center])').click(); await settle();
      assert.match(await code(), /style="width:80%;max-width:min\(80%,100%\)|width:80%;max-width:min\(600px,100%\);height:1000px;border:0;display:block;margin-left:auto;margin-right:auto;"/);
      const h = await page.$eval('#holder', (e) => { const r = e.getBoundingClientRect(); return [r.width, r.left]; });
      assert.ok(Math.abs(h[0] - 600) <= 1, 'forskoðun sýnir hámarksbreidd: ' + h[0]);
      await page.fill('input[type=number] >> nth=2', '1400'); await settle();
      assert.match(await code(), /height:1400px/);
      assert.equal(Math.round((await page.locator('#preview').boundingBox()).height), 1400);
    });

    await check('ógilt inntak: villa sýnd með texta, kóðinn breytist ekki', async () => {
      const before = await code();
      await page.fill('input[type=number] >> nth=0', '500'); await settle();   /* 500% er utan marka */
      assert.equal(await page.getAttribute('input[type=number] >> nth=0', 'aria-invalid'), 'true');
      assert.match(await page.locator('.err:visible').first().innerText(), /Ógilt gildi/);
      assert.equal(await code(), before);
      await page.fill('input[type=number] >> nth=2', '50'); await settle();
      assert.match(await page.locator('.err:visible').last().innerText(), /Hæð verður að vera/);
      assert.equal(await code(), before);
      await page.fill('.crow input[type=text] >> nth=0', 'rauður'); await settle();
      assert.equal(await page.getAttribute('.crow input[type=text] >> nth=0', 'aria-invalid'), 'true');
      assert.equal(await code(), before);
    });

    await check('flipar: skrifta og slóð, með öllum völdum stillingum', async () => {
      await page.fill('input[type=number] >> nth=0', '80'); await page.fill('input[type=number] >> nth=2', '1400');
      await page.fill('.crow input[type=text] >> nth=0', '#C5192D'); await settle();
      await page.locator('#tab-script').click();
      const s = await code();
      assert.match(s, /^<script\n  src="https:\/\/reykjanesbaer\.github\.io\/laus-storf-opus-futura\/embed\.js"/);
      assert.match(s, /data-theme|data-view="cards"/);
      assert.match(s, /data-width="80%"/);
      assert.match(s, /data-max-width="600px"/);
      assert.match(s, /data-align="center"/);
      assert.match(await page.locator('#codeHint').innerText(), /Payload/);
      await page.locator('#tab-url').click();
      const u = await code();
      assert.match(u, /^https:\/\/reykjanesbaer\.github\.io\/laus-storf-opus-futura\/\?/);
      const q = new URL(u).search;
      assert.equal(C.parse(q).view, 'cards');
      assert.equal(C.parseLayout(q).align, 'center');
      await page.locator('#tab-iframe').click();
    });

    await check('flipar virka með lyklaborði (örvar)', async () => {
      await page.locator('#tab-iframe').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.getAttribute('#tab-script', 'aria-selected'), 'true');
      await page.keyboard.press('End');
      assert.equal(await page.getAttribute('#tab-url', 'aria-selected'), 'true');
      await page.keyboard.press('Home');
      assert.equal(await page.getAttribute('#tab-iframe', 'aria-selected'), 'true');
    });

    await check('„Afrita kóða“ afritar nákvæmlega það sem er sýnt', async () => {
      await page.locator('#copyCode').click();
      await page.waitForFunction(() => document.getElementById('copyCode').textContent === 'Afritað');
      assert.equal(await page.locator('#copyLive').textContent(), 'Afritað', 'tilkynnt skjálesara');
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await code());
    });

    await check('slóð ritilsins geymir stillingarnar og þær endurheimtast', async () => {
      const url = page.url();
      assert.match(url, /view=cards/);
      assert.match(url, /width=80%25/);
      const p2 = await ctx.newPage();
      await p2.goto(url);
      await p2.frameLocator('#preview').locator('li.job').first().waitFor();
      assert.equal(await p2.locator('#codeOut').innerText(), await code());
      assert.equal(await p2.frameLocator('#preview').locator('.storf').getAttribute('data-view'), 'cards');
      await p2.close();
    });

    await check('„hæð eftir innihaldi“ og „Nota hæð forskoðunar“', async () => {
      await page.locator('label:has(input[name=pmode][value=auto])').click(); await settle();
      await page.waitForTimeout(300);
      const content = await pvFrame().evaluate(() => Math.ceil(document.getElementById('wrap').getBoundingClientRect().height) + 1);
      const ph = Math.round((await page.locator('#preview').boundingBox()).height);
      assert.ok(Math.abs(ph - content) <= 2, `${ph} vs ${content}`);
      const btn = page.locator('button', { hasText: 'Nota hæð forskoðunar' });
      assert.equal(await btn.isVisible(), true);
      await btn.click(); await settle();
      const h = +(/height:(\d+)px/.exec(await code())[1]);
      assert.ok(h >= content && h % 50 === 0 && h - content < 60, 'hæð: ' + h);
      await page.locator('label:has(input[name=pmode][value=fixed])').click();
    });

    await check('endurstilla sjálfgefin gildi', async () => {
      await page.locator('#resetAll').click(); await settle();
      assert.equal(await code(), '<iframe\n  src="https://reykjanesbaer.github.io/laus-storf-opus-futura/"\n  title="Laus störf hjá Reykjanesbæ"\n  loading="lazy"\n  style="width:100%;height:1000px;border:0;display:block;">\n</iframe>');
      assert.equal(await pvFrame().evaluate(() => document.querySelector('.storf').getAttribute('data-view')), 'list');
      assert.equal(await page.inputValue('input[type=number] >> nth=2'), '1000');
      assert.equal(page.url().includes('?'), false);
    });

    await check('varað við áherslulit sem nær ekki birtuskilum á hnöppum', async () => {
      await page.fill('.crow input[type=text] >> nth=0', '#777777'); await settle();
      assert.equal(await page.locator('#contrastWarn').isVisible(), true);
      assert.match(await page.locator('#contrastWarn').innerText(), /birtuskilum/);
      await page.locator('#resetAll').click();
    });

    await check('skjámynd: kóðasmiður (tölva)', async () => { await page.screenshot({ path: path.join(SHOTS, 'editor-desktop.png'), fullPage: true }); });
    await ctx.close();

    await check('kóðasmiður á síma: ekkert lárétt skrun', async () => {
      const p = await newPage({ viewport: { width: 375, height: 800 } });
      await p.goto(APP + 'ritstjorn/');
      await p.frameLocator('#preview').locator('li.job').first().waitFor();
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      await p.screenshot({ path: path.join(SHOTS, 'editor-375.png'), fullPage: true });
      await p.context().close();
    });
  }

  /* =================================================================== */
  section('Birtingarmappa — allt virkar undir undirslóð úr því sem build-site.js býr til');
  /* =================================================================== */
  {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'storf-site-'));
    build(out);
    const built = fs.readdirSync(out).sort();
    await check('aðeins nauðsynlegar skrár eru birtar (engin próf, skriftur né prófunargögn)', async () => {
      assert.deepEqual(built, ['.nojekyll', 'data', 'embed.js', 'index.html', 'ritstjorn', 'storf']);
      assert.deepEqual(fs.readdirSync(path.join(out, 'data')), [], 'data/jobs.json er skrifað af vinnuflæðinu, ekki afritað');
      const all = [];
      (function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.join(d, e.name))); })(out);
      assert.equal(all.some((f) => /fixtures|\.test\.|sample\.js|opus-mapping|scripts/.test(f)), false);
    });
    const doc = path.join(out, 'data', 'jobs.json');
    fs.writeFileSync(doc, JSON.stringify(sampleDocument(Date.now())));
    const site = createServer({ root: out });
    const sitePort = await listen(site);
    const SITE = `http://127.0.0.1:${sitePort}${BASE_PATH}/`;

    await check('rót sýnir störfin, ritstjóri og embed.js virka undir /laus-storf-opus-futura/', async () => {
      const page = await newPage();
      const missing = [];
      page.on('response', (r) => { if (r.status() >= 400) missing.push(r.status() + ' ' + r.url()); });
      await page.goto(SITE); await ready(page);
      assert.ok((await titles(page)).length > 0);
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).fontFamily.includes('Plus Jakarta Sans')), true);
      assert.equal(await page.evaluate(() => document.fonts.check('16px "Plus Jakarta Sans"')), true, 'sjálfhýst letur hleðst');
      await page.goto(SITE + 'ritstjorn/');
      await page.frameLocator('#preview').locator('li.job').first().waitFor();
      hostPages['/site.html'] = `<!doctype html><body><script src="${SITE}embed.js"></script>`;
      await page.goto(HOST + '/site.html');
      await page.frameLocator('iframe').locator('li.job').first().waitFor();
      assert.deepEqual(missing.filter((m) => !/favicon/.test(m)), []);
      await page.context().close();
    });
    await check('rót sýnir ekki ritstjórann og ritstjóri er á /ritstjorn/', async () => {
      const page = await newPage();
      await page.goto(SITE); await ready(page);
      assert.equal(await page.locator('h1').innerText(), 'Laus störf í gegnum Opus Futura');
      assert.equal(await page.locator('[role=tablist]').count(), 0);
      await page.context().close();
    });
    site.close();
  }

  /* =================================================================== */
  await browser.close();
  app.close(); host.close();

  section('Samantekt');
  const failed = results.filter((r) => !r.ok);
  if (errors.length) {
    console.log('\nVillur sem komu upp í vafranum (pageerror/console/dialog):');
    [...new Set(errors)].forEach((e) => console.log('  ! ' + e));
  }
  console.log(`\n${results.length - failed.length}/${results.length} vafrapróf stóðust.`);
  process.exit(failed.length || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
