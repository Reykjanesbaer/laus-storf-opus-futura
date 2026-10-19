#!/usr/bin/env node
/*
 * Laus störf — samstilling við Opus Futura.
 *
 * Keyrir á GitHub Actions við hverja birtingu (ekki í vafra gesta):
 *   1. sækir JSON frá Opus Futura
 *   2. þýðir það með scripts/opus-mapping.json
 *   3. hreinsar og staðfestir hvert starf (storf/normalize.js)
 *   4. skrifar AÐEINS gilt skjal í data/jobs.json
 *
 * Mistakist eitthvað skrifar skriftan ekkert og hættir með villukóða — skrá
 * sem fyrir er er aldrei yfirskrifuð með tómum eða skemmdum gögnum. Tómur
 * listi úr heilu, rétt byggðu svari er skráður sem „engin störf“; svar sem
 * er ónýtt (rangt snið, flestar færslur ógildar) er villa.
 *
 * Villuboð innihalda aldrei efni úr svarinu, aðeins kóða og tölur.
 *
 *   node scripts/sync-jobs.js [--out data/jobs.json] [--url <slóð>]
 *        [--input <skrá>] [--mapping <skrá>] [--inspect] [--no-samples]
 *
 * Útgönguskilyrði: 0 í lagi · 1 mistókst · 2 vörpun óútfyllt
 */
'use strict';

var fs = require('fs');
var path = require('path');
var N = require('../storf/normalize.js');
var D = require('../storf/dates.js');
var P = require('./lib/provider.js');

var DEFAULT_URL = 'https://workplace.opusfutura.com/embed/jobs/27xzaq995vs8e5631z5babkh.json';
var MAX_BYTES = 10 * 1024 * 1024;
var MAX_INVALID_SHARE = 0.5;

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function isLocalHttp(u) {
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
}

/*
 * Sækir JSON. https eingöngu (http aðeins á localhost, fyrir próf).
 * Endurtekur við netvillur, tímamörk, 429 og 5xx.
 */
async function fetchJson(url, o) {
  o = o || {};
  var retries = o.retries === undefined ? 3 : o.retries;
  var timeoutMs = o.timeoutMs || 20000;
  var maxBytes = o.maxBytes || MAX_BYTES;
  var wait = o.sleep || sleep;
  var doFetch = o.fetch || fetch;

  var u;
  try { u = new URL(url); } catch (e) { throw new P.ProviderError('URL', 'Ógild slóð á gagnauppsprettu.'); }
  if (u.protocol !== 'https:' && !isLocalHttp(u)) throw new P.ProviderError('URL', 'Gagnauppspretta verður að vera https.');

  var lastErr;
  for (var attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await wait(Math.min(1000 * Math.pow(2, attempt - 1), 8000));
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, timeoutMs);
    try {
      var res = await doFetch(u.href, {
        signal: ctl.signal,
        redirect: 'follow',
        headers: { 'accept': 'application/json', 'user-agent': 'laus-storf-sync (Reykjanesbaer)' }
      });
      if (res.url) {
        var fin = new URL(res.url);
        if (fin.protocol !== 'https:' && !isLocalHttp(fin)) throw new P.ProviderError('URL', 'Tilvísun á ótryggða slóð.');
      }
      if (!res.ok) {
        var retry = res.status === 429 || res.status >= 500;
        lastErr = new P.ProviderError('HTTP_' + res.status, 'Gagnauppspretta svaraði með stöðukóða ' + res.status + '.');
        if (retry) continue;
        throw lastErr;
      }
      var declared = +res.headers.get('content-length');
      if (declared && declared > maxBytes) throw new P.ProviderError('TOO_LARGE', 'Svarið er of stórt.');
      var buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > maxBytes) throw new P.ProviderError('TOO_LARGE', 'Svarið er of stórt.');
      try { return JSON.parse(buf.toString('utf8')); }
      catch (e) { throw new P.ProviderError('JSON', 'Svarið er ekki gilt JSON.'); }
    } catch (e) {
      if (e instanceof P.ProviderError) {
        if (/^HTTP_(429|5)/.test(e.code)) { lastErr = e; continue; }
        throw e;
      }
      lastErr = new P.ProviderError(e && e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK',
        e && e.name === 'AbortError' ? 'Tímamörk runnu út.' : 'Netsamband mistókst.');
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new P.ProviderError('NETWORK', 'Netsamband mistókst.');
}

/*
 * Hreint fall: hrátt JSON → skjal. Kastar P.ProviderError ef gögnin eru ónýt.
 * Hér er enginn aðgangur að neti eða skrám, svo þetta er auðprófað.
 */
function buildFromRaw(raw, mapping, nowMs) {
  var now = nowMs === undefined ? Date.now() : nowMs;
  var ex = P.extractCandidates(raw, mapping);
  var r = N.normalizeJobs(ex.candidates, { allowedHosts: mapping.allowedUrlHosts });

  var live = r.jobs.filter(function (j) { return !(j.deadline && D.isPast(j.deadline, now)); });
  var expired = r.jobs.length - live.length;

  var duplicates = r.dropped.duplicate || 0;
  var invalid = N.sumDropped(r.dropped) - duplicates;
  var considered = ex.total - ex.skipped.inactive;
  if (considered > 0 && invalid / considered > MAX_INVALID_SHARE) {
    throw new P.ProviderError('QUALITY',
      'Of margar færslur stóðust ekki staðfestingu (' + invalid + ' af ' + considered + '). ' +
      'Gagnasniðið kann að hafa breyst — athugaðu opus-mapping.json.');
  }

  var iso = new Date(now).toISOString().replace(/\.\d+Z$/, 'Z');
  var doc = N.buildDocument(live, { source: 'opusfutura', fetchedAt: iso });

  var check = N.validateDocument(doc);
  if (!check.ok || check.droppedCount !== 0 || check.jobs.length !== live.length) {
    throw new P.ProviderError('SELF_CHECK', 'Skjalið stóðst ekki lokastaðfestingu.');
  }

  return {
    doc: doc,
    stats: { received: ex.total, inactive: ex.skipped.inactive, invalid: invalid,
      duplicates: duplicates, expired: expired, published: live.length }
  };
}

/* Skrifar í tímabundna skrá og endurnefnir — hálfskrifuð skrá verður aldrei birt */
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  var tmp = file + '.tmp-' + process.pid;
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) { /* ekkert */ }
    throw e;
  }
}

function parseArgs(argv) {
  var a = { out: path.join(__dirname, '..', 'data', 'jobs.json'), url: process.env.OPUS_FEED_URL || DEFAULT_URL };
  for (var i = 0; i < argv.length; i++) {
    var k = argv[i];
    if (k === '--out') a.out = argv[++i];
    else if (k === '--url') a.url = argv[++i];
    else if (k === '--input') a.input = argv[++i];
    else if (k === '--mapping') a.mapping = argv[++i];
    else if (k === '--inspect') a.inspect = true;
    else if (k === '--no-samples') a.noSamples = true;
    else throw new Error('Óþekkt færibreyta: ' + k);
  }
  return a;
}

async function main(argv) {
  var args = parseArgs(argv);

  var raw;
  if (args.input) {
    try { raw = JSON.parse(fs.readFileSync(args.input, 'utf8')); }
    catch (e) { throw new P.ProviderError('INPUT', 'Gat ekki lesið inntaksskrána.'); }
  } else {
    raw = await fetchJson(args.url);
  }

  if (args.inspect) {
    P.describeStructure(raw, { samples: !args.noSamples }).forEach(function (l) { console.log(l); });
    return 0;
  }

  var mapping = P.loadMapping(args.mapping);
  var res = buildFromRaw(raw, mapping);
  writeAtomic(args.out, JSON.stringify(res.doc, null, 2) + '\n');

  var s = res.stats;
  console.log('Samstilling tókst: ' + s.published + ' störf birt (móttekin ' + s.received +
    ', óvirk ' + s.inactive + ', útrunnin ' + s.expired + ', ógild ' + s.invalid + ', tvítekin ' + s.duplicates + ').');
  if (s.published === 0) console.log('Engin störf eru auglýst — skjalið er gilt og tómt.');
  return 0;
}

module.exports = { DEFAULT_URL: DEFAULT_URL, fetchJson: fetchJson, buildFromRaw: buildFromRaw, writeAtomic: writeAtomic, main: main };

if (require.main === module) {
  main(process.argv.slice(2)).then(function (code) { process.exit(code); }, function (e) {
    /* Aðeins kóði og okkar eigin texti — aldrei efni úr svarinu */
    if (e instanceof P.ProviderError) {
      console.error('Samstilling mistókst [' + e.code + ']: ' + e.message);
      process.exit(e.code === 'MAPPING_UNCONFIGURED' ? 2 : 1);
    }
    console.error('Samstilling mistókst [' + (e && e.name ? e.name : 'ERROR') + ']');
    process.exit(1);
  });
}
