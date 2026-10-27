/*
 * Laus störf — þýðing á gagnasniði Opus Futura yfir á okkar snið.
 *
 * Þessi skrá veit EKKERT um raunverulega reiti Opus Futura. Hvaða reitir
 * eru lesnir stendur í scripts/opus-mapping.json og er fyllt út eftir að
 * JSON-ið hefur verið skoðað (sjá `npm run inspect`). Óútfyllt vörpun gerir
 * samstillinguna óvirka með skýrri villu — hún giskar aldrei.
 *
 * Vörpunin lýsir hvar hver reitur er sem slóð með punktum:
 *   "title"                reitur á starfi
 *   "department.name"      reitur í undirhlut
 *   "links.0.href"         stak í lista
 * Slóð má vera listi af slóðum; fyrsta ekki-tóma gildið er notað.
 */
'use strict';

var path = require('path');

var FIELD_NAMES = ['id', 'title', 'department', 'employmentType', 'location',
  'publishedAt', 'deadline', 'summary', 'description', 'detailUrl', 'applyUrl', 'isGeneral'];

class ProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}

/* Slóð → gildi, eða undefined. Ver gegn __proto__ og óþekktum hlutum. */
function getPath(obj, p) {
  if (p === '' || p === null || p === undefined) return obj;
  var cur = obj;
  var parts = String(p).split('.');
  for (var i = 0; i < parts.length; i++) {
    if (cur === null || typeof cur !== 'object') return undefined;
    var k = parts[i];
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, k)) return undefined;
    cur = cur[k];
  }
  return cur;
}

function isEmpty(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

/* Fyrsta ekki-tóma gildi úr einni slóð eða lista af slóðum */
function pick(item, spec) {
  if (spec === null || spec === undefined) return undefined;
  var specs = Array.isArray(spec) ? spec : [spec];
  for (var i = 0; i < specs.length; i++) {
    var v = getPath(item, specs[i]);
    if (!isEmpty(v)) return v;
  }
  return undefined;
}

/* Gildi sem má vera hlutur með nafni (t.d. { name: 'Menntasvið' }) → texti */
function toLabel(v) {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string' || typeof v === 'number') return v;
  if (Array.isArray(v)) {
    var parts = v.map(toLabel).filter(function (x) { return !isEmpty(x); });
    return parts.length ? parts.join(', ') : undefined;
  }
  if (typeof v === 'object') {
    var keys = ['name', 'title', 'label', 'text', 'value'];
    for (var i = 0; i < keys.length; i++) {
      if (typeof v[keys[i]] === 'string' && v[keys[i]].trim()) return v[keys[i]];
    }
  }
  return undefined;
}

function toBool(v) {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') return /^(true|1|yes|já)$/i.test(v.trim());
  return false;
}

function loadMapping(file) {
  var p = file || path.join(__dirname, '..', 'opus-mapping.json');
  var m;
  try { m = JSON.parse(require('fs').readFileSync(p, 'utf8')); }
  catch (e) { throw new ProviderError('MAPPING_READ', 'Gat ekki lesið vörpunina ' + path.basename(p)); }
  return m;
}

/* Er vörpunin útfyllt? Lágmark: hvar listinn er, heiti starfs og eitthvað sem auðkennir. */
function checkMapping(m) {
  var f = (m && m.fields) || {};
  var missing = [];
  if (!m || m.jobsPath === null || m.jobsPath === undefined) missing.push('jobsPath');
  if (isEmpty(f.title)) missing.push('fields.title');
  if (isEmpty(f.id) && isEmpty(f.applyUrl) && isEmpty(f.detailUrl)) missing.push('fields.id (eða applyUrl/detailUrl)');
  if (missing.length) {
    throw new ProviderError('MAPPING_UNCONFIGURED',
      'Vörpun Opus Futura er óútfyllt (' + missing.join(', ') + '). ' +
      'Keyrðu `npm run inspect` og fylltu út scripts/opus-mapping.json.');
  }
}

/*
 * Hrátt JSON frá þjónustuaðila → { candidates, skipped }.
 * Kastar ProviderError ef sniðið er ekki það sem vörpunin segir til um.
 */
function extractCandidates(raw, mapping) {
  // Lagað gagnasnið staðfest 2026-10-27: { workplace: "...", jobs: [] }.
  // Ef listinn er í raun tómur þarf ekki að þekkja reiti í einstöku starfi.
  // Um leið og jobs inniheldur færslur krefjumst við staðfestrar vörpunar.
  if (!mapping || mapping.jobsPath === null || mapping.jobsPath === undefined) checkMapping(mapping);
  var list = getPath(raw, mapping.jobsPath);
  if (!Array.isArray(list)) {
    throw new ProviderError('SHAPE', 'Starfalistinn fannst ekki þar sem vörpunin segir til um (jobsPath).');
  }
  if (list.length === 0) {
    return { candidates: [], skipped: { inactive: 0 }, total: 0 };
  }
  checkMapping(mapping);

  var f = mapping.fields;
  var st = mapping.statusFilter || {};
  var general = mapping.generalApplication || {};
  var skipped = { inactive: 0 };
  var out = [];

  list.forEach(function (item) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      skipped.notObject = (skipped.notObject || 0) + 1;
      out.push(null);                                 /* talið sem ógilt af normalize */
      return;
    }

    if (!isEmpty(st.path) && Array.isArray(st.activeValues) && st.activeValues.length) {
      var s = getPath(item, st.path);
      /* Vantar stöðureitinn er það frávik frá sniðinu (ekki „óvirkt starf“): talið
         ógilt, svo breytt gagnasnið endi aldrei sem „engin laus störf“. */
      if (s === undefined || s === null) {
        skipped.noStatus = (skipped.noStatus || 0) + 1;
        out.push(null);
        return;
      }
      var active = st.activeValues.some(function (v) { return String(v).toLowerCase() === String(s).toLowerCase(); });
      if (!active) { skipped.inactive++; return; }
    }

    var c = {};
    FIELD_NAMES.forEach(function (name) {
      if (name === 'description' || isEmpty(f[name])) return;
      var v = pick(item, f[name]);
      if (name === 'department' || name === 'employmentType' || name === 'location') v = toLabel(v);
      if (name === 'isGeneral') v = toBool(v);
      c[name] = v;
    });

    var d = pick(item, f.description);
    if (d !== undefined) {
      if (mapping.descriptionFormat === 'text') c.descriptionText = typeof d === 'string' ? d : undefined;
      else c.descriptionHtml = typeof d === 'string' ? d : undefined;
    }

    if (!isEmpty(general.path) && toBool(getPath(item, general.path))) c.isGeneral = true;
    out.push(c);
  });

  return { candidates: out, skipped: skipped, total: list.length };
}

/* ------------------------------------------------------------------ */
/* Skoðun: lýsir byggingu JSON án þess að skrifa út allt innihald       */
/* ------------------------------------------------------------------ */

function shapeOf(v) {
  if (v === null) return 'null';
  if (typeof v === 'string') {
    var s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'dagsetning YYYY-MM-DD';
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) return 'dagsetning+tími ISO';
    if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(s)) return 'dagsetning D.M.YYYY';
    if (/^https?:\/\//i.test(s)) {
      try { return 'vefslóð ' + new URL(s).protocol + '//' + new URL(s).host + '/…'; } catch (e) { return 'vefslóð (ógild)'; }
    }
    if (/<\/?[a-z][\s\S]*>/i.test(s)) return 'HTML (' + s.length + ' stafir)';
    return 'texti (' + s.length + ' stafir)';
  }
  if (typeof v === 'number') return Number.isInteger(v) ? 'heiltala' : 'tala';
  if (typeof v === 'boolean') return 'boolean';
  if (Array.isArray(v)) return 'listi (' + v.length + ')';
  return 'hlutur';
}

function sample(v) {
  if (typeof v === 'string') {
    var s = v.replace(/\s+/g, ' ').trim();
    return s.length > 60 ? s.slice(0, 57) + '…' : s;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

/* Skilar línum: „slóð : gerð [: sýnishorn úr fyrsta stak]“ */
function describeStructure(raw, opts) {
  var maxDepth = (opts && opts.maxDepth) || 6;
  var showSamples = !opts || opts.samples !== false;
  var lines = [];
  var seen = new Set();

  function walk(v, p, depth) {
    var shape = shapeOf(v);
    var line = (p || '(rót)') + ' : ' + shape;
    if (showSamples && typeof v !== 'object' && v !== null) {
      var smp = sample(v);
      if (smp && !/^(HTML|vefslóð)/.test(shape)) line += ' : ' + JSON.stringify(smp);
    }
    if (!seen.has(line)) { seen.add(line); lines.push(line); }
    if (depth >= maxDepth || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      if (v.length) walk(v[0], p + '[0]', depth + 1);
      return;
    }
    Object.keys(v).slice(0, 80).forEach(function (k) { walk(v[k], p ? p + '.' + k : k, depth + 1); });
  }
  walk(raw, '', 0);
  return lines;
}

module.exports = {
  FIELD_NAMES: FIELD_NAMES,
  ProviderError: ProviderError,
  getPath: getPath,
  loadMapping: loadMapping,
  checkMapping: checkMapping,
  extractCandidates: extractCandidates,
  describeStructure: describeStructure
};
