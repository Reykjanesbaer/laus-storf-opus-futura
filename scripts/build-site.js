#!/usr/bin/env node
/*
 * Laus störf — setur saman möppuna sem er birt á GitHub Pages.
 *
 *   node scripts/build-site.js [--out _site]
 *
 * Afritar aðeins það sem vefurinn þarf. Próf, skriftur, prófunargögn og
 * skjölun fara aldrei í birtinguna. data/jobs.json er EKKI afritað hér;
 * vinnuflæðið skrifar það (sjá .github/workflows/deploy.yml).
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var INCLUDE = ['index.html', 'embed.js', '.nojekyll', 'ritstjorn', 'storf'];

function copy(src, dest) {
  var st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(function (n) { copy(path.join(src, n), path.join(dest, n)); });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function build(outDir) {
  var out = path.resolve(outDir);
  if (out === ROOT || ROOT.indexOf(out + path.sep) === 0) throw new Error('Úttaksmappa má ekki vera rót verkefnisins');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  INCLUDE.forEach(function (n) { copy(path.join(ROOT, n), path.join(out, n)); });
  fs.mkdirSync(path.join(out, 'data'), { recursive: true });
  return out;
}

module.exports = { build: build, INCLUDE: INCLUDE };

if (require.main === module) {
  var i = process.argv.indexOf('--out');
  var out = build(i > -1 ? process.argv[i + 1] : '_site');
  console.log('Vefur settur saman í ' + path.relative(process.cwd(), out) + '/');
}
