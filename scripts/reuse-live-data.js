#!/usr/bin/env node
/*
 * Laus störf — notar síðustu birtu gögn þegar samstilling mistekst.
 *
 *   node scripts/reuse-live-data.js --url <slóð á data/jobs.json á Pages> --out <skrá>
 *
 * Sækir data/jobs.json af vefnum sem er í birtingu núna, staðfestir það með
 * sama kóða og samstillingin og skrifar það óbreytt. Þannig getur kóðabreyting
 * verið birt á meðan Opus Futura er óaðgengilegt án þess að störfin hverfi.
 * fetchedAt er óbreytt, svo vefurinn sýnir að gögnin séu orðin gömul.
 *
 * Útgönguskilyrði:
 *   0  gild fyrri gögn skrifuð
 *   3  engin fyrri gögn eru til (404) — fyrsta birting
 *   1  annað (netvilla, skemmd gögn …) — vinnuflæðið á þá EKKI að birta
 */
'use strict';

var N = require('../storf/normalize.js');
var P = require('./lib/provider.js');
var S = require('./sync-jobs.js');

async function reuse(url, out, o) {
  var doc = await S.fetchJson(url, o);
  var v = N.validateDocument(doc);
  if (!v.ok || v.droppedCount !== 0) throw new P.ProviderError('INVALID_PREVIOUS', 'Fyrri gögn standast ekki staðfestingu.');
  S.writeAtomic(out, JSON.stringify(doc, null, 2) + '\n');
  return { count: v.jobs.length, fetchedAt: doc.fetchedAt };
}

module.exports = { reuse: reuse };

if (require.main === module) {
  var a = process.argv.slice(2);
  var url = a[a.indexOf('--url') + 1], out = a[a.indexOf('--out') + 1];
  if (a.indexOf('--url') < 0 || a.indexOf('--out') < 0) { console.error('Notkun: --url <slóð> --out <skrá>'); process.exit(1); }
  reuse(url, out).then(function (r) {
    console.log('Notum síðustu birtu gögn: ' + r.count + ' störf, sótt ' + r.fetchedAt + '.');
  }, function (e) {
    var code = e && e.code;
    console.error('Gat ekki notað fyrri gögn [' + (code || (e && e.name) || 'ERROR') + ']' + (e instanceof P.ProviderError ? ': ' + e.message : ''));
    process.exit(code === 'HTTP_404' ? 3 : 1);
  });
}
