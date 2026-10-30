#!/usr/bin/env node
/*
 * Laus störf — þarf að birta? (aðeins fyrir tímasettar keyrslur)
 *
 *   node scripts/should-deploy.js --new <skrá> --live-url <slóð> [--max-age-minutes 60]
 *
 * Tímasett keyrsla á 15 mínútna fresti þarf ekki að birta Pages aftur ef störfin
 * eru þau sömu og þegar eru í birtingu. Hún birtir ef:
 *   • störfin hafa breyst (nýtt, lokað, breyttur texti eða frestur), eða
 *   • birt gögn eru eldri en --max-age-minutes (svo „uppfært“-tíminn haldist ferskur), eða
 *   • ekki tókst að lesa gild birt gögn (þá er öruggara að birta).
 *
 * Skrifar `deploy=true|false` og `reason=…` í $GITHUB_OUTPUT. Villa hér leiðir alltaf til
 * deploy=true — aldrei til þess að nýtt starf sé ekki birt.
 */
'use strict';

var fs = require('fs');
var N = require('../storf/normalize.js');
var S = require('./sync-jobs.js');

/* Hreint fall: { deploy, reason } */
function decide(newDoc, liveDoc, nowMs, maxAgeMin) {
  var nv = N.validateDocument(newDoc);
  if (!nv.ok) return { deploy: true, reason: 'ný gögn stóðust ekki samanburð' };
  var lv = N.validateDocument(liveDoc);
  if (!lv.ok) return { deploy: true, reason: 'engin gild birt gögn til samanburðar' };
  if (JSON.stringify(nv.jobs) !== JSON.stringify(lv.jobs)) return { deploy: true, reason: 'störfin hafa breyst' };
  var ageMin = (nowMs - lv.fetchedAt) / 60000;
  if (ageMin >= maxAgeMin) return { deploy: true, reason: 'birt gögn eru ' + Math.round(ageMin) + ' mín. gömul — endurnýja tímann' };
  return { deploy: false, reason: 'engin breyting (birt gögn eru ' + Math.round(Math.max(0, ageMin)) + ' mín. gömul)' };
}

async function run(args, o) {
  o = o || {};
  var newDoc = JSON.parse(fs.readFileSync(args.newFile, 'utf8'));
  var live;
  try { live = await S.fetchJson(args.liveUrl, { retries: 1, timeoutMs: 15000, sleep: o.sleep, fetch: o.fetch }); }
  catch (e) { return { deploy: true, reason: 'gat ekki lesið birt gögn' }; }
  return decide(newDoc, live, o.now === undefined ? Date.now() : o.now, args.maxAgeMin);
}

module.exports = { decide: decide, run: run };

if (require.main === module) {
  var a = process.argv.slice(2);
  var get = function (k, d) { var i = a.indexOf(k); return i > -1 ? a[i + 1] : d; };
  var args = { newFile: get('--new'), liveUrl: get('--live-url'), maxAgeMin: +get('--max-age-minutes', 60) };
  if (!args.newFile || !args.liveUrl) { console.error('Notkun: --new <skrá> --live-url <slóð>'); process.exit(1); }
  run(args).catch(function () { return { deploy: true, reason: 'óvænt villa' }; }).then(function (r) {
    console.log((r.deploy ? 'Birta: ' : 'Sleppa birtingu: ') + r.reason + '.');
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, 'deploy=' + r.deploy + '\nreason=' + r.reason + '\n');
    }
  });
}
