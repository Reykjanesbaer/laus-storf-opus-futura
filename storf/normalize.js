/*
 * Laus störf — hreinsun og staðfesting á störfum.
 *
 * Þetta er EINA staðurinn sem ákveður hvað telst gilt starf. Hann er notaður
 * af samstillingarskriftunni (Node, við birtingu) og aftur í vafranum þegar
 * data/jobs.json er lesið — varnarlag, ekki traust á skránni.
 *
 * Inntakið er „umsækjandi“ (candidate) á okkar eigin sniði, ekki sniði
 * Opus Futura. Þýðing frá gagnasniði þjónustuaðilans er í
 * scripts/lib/provider.js og scripts/opus-mapping.json.
 *
 * Allt frá þjónustuaðila er ótraust: texti er hreinsaður og settur í DOM með
 * textContent (aldrei innerHTML), vefslóðir verða að vera https, og HTML í
 * lýsingum er brotið niður í fáar öruggar blokkir (málsgreinar, millifyrirsagnir
 * og listar) — engin tög, engar eigindir, engin tengsl.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dates.js'));
  else root.LausStorfNormalize = factory(root.LausStorfDates);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  'use strict';

  var SCHEMA = 1;

  var LIMITS = {
    id: 200,
    title: 300,
    label: 120,        /* svið, tegund starfs, staðsetning */
    summary: 600,
    block: 4000,
    blocks: 200,
    listItems: 100,
    url: 2000,
    excerpt: 220
  };

  var GENERAL_NAMES = ['almenn umsokn'];

  /* ------------------------------------------------------------------ */
  /* Texti                                                               */
  /* ------------------------------------------------------------------ */

  /* Aðeins strengir og tölur eru teknir gildir; allt annað verður tómt */
  function asString(v) {
    if (typeof v === 'string') return v;
    if (typeof v === 'number' && isFinite(v)) return String(v);
    return '';
  }

  /* Stýristafir út, bil samþjöppuð, klippt. Allt á einni línu. */
  function cleanText(v, max) {
    var s = asString(v)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠﻿]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (max && s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, '').trim() + '…';
    return s;
  }

  /* Sama og cleanText, en lína fyrir línu: bil innan lína, línuskil varðveitt */
  function cleanMultiline(v) {
    return asString(v)
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠﻿]/g, '')
      .split('\n').map(function (l) { return l.replace(/[ \t ]+/g, ' ').trim(); }).join('\n');
  }

  /* Til samanburðar á nöfnum: „Almenn umsókn“ → „almenn umsokn“ */
  function foldName(s) {
    return asString(s).toLowerCase()
      .replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/æ/g, 'ae').replace(/ö/g, 'o')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  var ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
    hellip: '…', bull: '•', middot: '·', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
    laquo: '«', raquo: '»', copy: '©', reg: '®', deg: '°', euro: '€', times: '×',
    eth: 'ð', ETH: 'Ð', thorn: 'þ', THORN: 'Þ', aelig: 'æ', AElig: 'Æ',
    aacute: 'á', Aacute: 'Á', eacute: 'é', Eacute: 'É', iacute: 'í', Iacute: 'Í',
    oacute: 'ó', Oacute: 'Ó', uacute: 'ú', Uacute: 'Ú', yacute: 'ý', Yacute: 'Ý',
    ouml: 'ö', Ouml: 'Ö'
  };

  function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, function (all, name) {
      if (name.charAt(0) === '#') {
        var code = name.charAt(1).toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        if (!isFinite(code) || code < 32 || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF)) return ' ';
        return String.fromCodePoint(code);
      }
      return Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : all;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Vefslóðir                                                           */
  /* ------------------------------------------------------------------ */

  /*
   * https eingöngu, engin notandanöfn í slóð, engin bil. Skilar slóðinni í
   * staðlaðri mynd eða null. allowedHosts (valfrjálst) er listi af lénum;
   * „example.com“ leyfir líka undirlén.
   */
  function safeUrl(raw, allowedHosts) {
    var s = asString(raw).trim();
    if (!s || s.length > LIMITS.url || /[\s\u0000-\u001F]/.test(s)) return null;
    var u;
    try { u = new URL(s); } catch (e) { return null; }
    if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) return null;
    if (u.hostname.indexOf('.') === -1) return null;
    if (allowedHosts && allowedHosts.length) {
      var host = u.hostname.toLowerCase();
      var ok = allowedHosts.some(function (h) {
        h = String(h).toLowerCase().replace(/^\./, '');
        return host === h || host.slice(-(h.length + 1)) === '.' + h;
      });
      if (!ok) return null;
    }
    return u.href;
  }

  /* ------------------------------------------------------------------ */
  /* Lýsingar: blokkir                                                   */
  /*   { t: 'p', x }  málsgrein     { t: 'h', x }   millifyrirsögn        */
  /*   { t: 'ul', items } listi     { t: 'ol', items } númeraður listi    */
  /* ------------------------------------------------------------------ */

  function textToBlocks(text) {
    var lines = cleanMultiline(text).split('\n');
    var blocks = [], para = [], list = null;

    function flushPara() {
      if (para.length) blocks.push({ t: 'p', x: cleanText(para.join(' '), LIMITS.block) });
      para = [];
    }
    function flushList() {
      if (list) blocks.push({ t: 'ul', items: list });
      list = null;
    }

    lines.forEach(function (line) {
      var bullet = /^(?:[-*•·–]|\d{1,2}[.)])\s+(.*)$/.exec(line);
      if (line === '') { flushPara(); flushList(); return; }
      if (bullet) {
        flushPara();
        (list = list || []).push(cleanText(bullet[1], LIMITS.block));
        return;
      }
      flushList();
      para.push(line);
    });
    flushPara();
    flushList();
    return limitBlocks(blocks);
  }

  /*
   * HTML → blokkir. Engin tög lifa af: <p>, <div>, <br>, <h1–h6>, <ul>,
   * <ol> og <li> ákvarða aðeins uppbygginguna; allur annar texti er varðveittur
   * og tög hent. <script>, <style> og athugasemdir hverfa ásamt innihaldi.
   * Einingar eru afkóðaðar EFTIR að tög eru fjarlægð, svo „&lt;script&gt;“
   * endar sem sýnilegur texti en aldrei sem tag.
   */
  function htmlToBlocks(html) {
    var src = asString(html);
    if (src.length > 400000) src = src.slice(0, 400000);
    src = src
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|iframe|object|embed|template)\b[\s\S]*?<\/\1\s*>/gi, ' ');

    var blocks = [];
    var buf = '';
    var list = null;          /* { t, items } */
    var inItem = false;
    var heading = false;

    function takeText() {
      var t = cleanText(decodeEntities(buf), LIMITS.block);
      buf = '';
      return t;
    }
    function flush() {
      var t = takeText();
      if (!t) return;
      if (list && inItem) list.items.push(t);
      else if (heading) blocks.push({ t: 'h', x: t });
      else blocks.push({ t: 'p', x: t });
    }
    function closeList() {
      flush();
      if (list && list.items.length) blocks.push({ t: list.t, items: list.items.slice(0, LIMITS.listItems) });
      list = null;
      inItem = false;
    }

    var re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>|<|[^<]+/g;
    var m;
    while ((m = re.exec(src))) {
      var tok = m[0];
      if (!m[1]) {
        buf += tok === '<' ? '<' : tok;       /* hreinn texti (eða stakt „<“) */
        continue;
      }
      var name = m[1].toLowerCase();
      var closing = tok.charAt(1) === '/';

      if (name === 'br') {
        if (list && inItem) buf += ' ';     /* línuskil innan liðar */
        else flush();                       /* annars ný málsgrein */
        continue;
      }
      if (/^h[1-6]$/.test(name)) { flush(); heading = !closing; continue; }
      if (name === 'ul' || name === 'ol') {
        if (closing) closeList();
        else { closeList(); list = { t: name, items: [] }; }
        continue;
      }
      if (name === 'li') {
        flush();
        inItem = !closing && !!list;
        continue;
      }
      if (name === 'p' || name === 'div' || name === 'section' || name === 'article' ||
          name === 'tr' || name === 'table' || name === 'blockquote') {
        flush();
        continue;
      }
      /* öll önnur tög (strong, em, a, span …): texti haldið, tag hent */
    }
    closeList();
    return limitBlocks(blocks);
  }

  function limitBlocks(blocks) {
    return blocks.filter(function (b) {
      if (b.t === 'ul' || b.t === 'ol') return b.items.length > 0;
      return !!b.x;
    }).slice(0, LIMITS.blocks);
  }

  /* Staðfestir blokkir sem eru þegar á okkar sniði (úr data/jobs.json) */
  function cleanBlocks(blocks) {
    if (!Array.isArray(blocks)) return [];
    var out = [];
    blocks.slice(0, LIMITS.blocks).forEach(function (b) {
      if (!b || typeof b !== 'object') return;
      if (b.t === 'p' || b.t === 'h') {
        var x = cleanText(b.x, LIMITS.block);
        if (x) out.push({ t: b.t, x: x });
      } else if (b.t === 'ul' || b.t === 'ol') {
        var items = (Array.isArray(b.items) ? b.items : []).slice(0, LIMITS.listItems)
          .map(function (i) { return cleanText(i, LIMITS.block); }).filter(Boolean);
        if (items.length) out.push({ t: b.t, items: items });
      }
    });
    return out;
  }

  /* Blokkir → flatur texti (leit og útdráttur) */
  function blocksToText(blocks) {
    return (blocks || []).map(function (b) {
      return b.items ? b.items.join(' ') : b.x;
    }).join(' ');
  }

  /* Útdráttur úr fyrstu málsgrein, klipptur við orðamörk */
  function excerpt(blocks, max) {
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].t === 'p') return cleanText(blocks[i].x, max || LIMITS.excerpt);
    }
    return cleanText(blocksToText(blocks), max || LIMITS.excerpt);
  }

  /* ------------------------------------------------------------------ */
  /* Starf                                                               */
  /* ------------------------------------------------------------------ */

  function label(v) { return cleanText(v, LIMITS.label) || null; }

  function isGeneralName(name) {
    return !!name && GENERAL_NAMES.indexOf(foldName(name)) !== -1;
  }

  /*
   * Eitt starf. Skilar { job } eða { reason } (stuttur kóði, aldrei innihald).
   * opts.allowedHosts: leyfð lén fyrir vefslóðir (valfrjálst)
   */
  function normalizeJob(c, opts) {
    opts = opts || {};
    if (!c || typeof c !== 'object' || Array.isArray(c)) return { reason: 'not-object' };

    var title = cleanText(c.title, LIMITS.title);
    if (!title) return { reason: 'no-title' };

    var applyUrl = safeUrl(c.applyUrl, opts.allowedHosts);
    var detailUrl = safeUrl(c.detailUrl, opts.allowedHosts);

    /* Auðkenni: skráð auðkenni, annars vefslóð starfsins. Aldrei búið til úr titli. */
    var id = cleanText(c.id, LIMITS.id) || detailUrl || applyUrl || '';
    if (!id) return { reason: 'no-id' };

    var blocks = null;
    if (Array.isArray(c.description)) blocks = cleanBlocks(c.description);
    else if (c.descriptionHtml) blocks = htmlToBlocks(c.descriptionHtml);
    else if (c.descriptionText) blocks = textToBlocks(c.descriptionText);
    if (blocks && !blocks.length) blocks = null;

    var summary = cleanText(c.summary, LIMITS.summary) || (blocks ? excerpt(blocks) : '') || null;

    var department = label(c.department);
    var general = c.isGeneral === true || isGeneralName(department);

    return {
      job: {
        id: id,
        title: title,
        department: department,
        employmentType: label(c.employmentType),
        location: label(c.location),
        publishedAt: D.normalizeDate(c.publishedAt),
        deadline: D.normalizeDate(c.deadline),
        isGeneral: general,
        summary: summary,
        description: blocks,
        detailUrl: detailUrl,
        applyUrl: applyUrl
      }
    };
  }

  /*
   * Listi af störfum. Fyrsta tilvik hvers auðkennis gildir.
   * Skilar { jobs, dropped: { <ástæða>: fjöldi } }.
   */
  function normalizeJobs(list, opts) {
    var jobs = [], dropped = {}, seen = Object.create(null);
    function drop(reason) { dropped[reason] = (dropped[reason] || 0) + 1; }
    (Array.isArray(list) ? list : []).forEach(function (c) {
      var r = normalizeJob(c, opts);
      if (!r.job) { drop(r.reason); return; }
      if (seen[r.job.id]) { drop('duplicate'); return; }
      seen[r.job.id] = true;
      jobs.push(r.job);
    });
    return { jobs: jobs, dropped: dropped };
  }

  function sumDropped(dropped) {
    return Object.keys(dropped).reduce(function (n, k) { return n + dropped[k]; }, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Skjal (data/jobs.json)                                              */
  /* ------------------------------------------------------------------ */

  /* „2026-10-19T14:37:00Z“ → ms, annars null */
  function parseInstant(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v)) return null;
    var ms = Date.parse(v);
    return isNaN(ms) ? null : ms;
  }

  function buildDocument(jobs, meta) {
    return {
      schema: SCHEMA,
      source: (meta && meta.source) || 'opusfutura',
      fetchedAt: (meta && meta.fetchedAt) || new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      count: jobs.length,
      jobs: jobs
    };
  }

  /*
   * Staðfestir skjal sem var lesið úr data/jobs.json.
   * Skilar { ok: true, jobs, fetchedAt, droppedCount } eða { ok: false, error }.
   * Munurinn á „engin störf“ og „gögn ónýt“ er hér: tómur listi í heilu skjali
   * er gilt (ok), skemmt skjal er það ekki.
   */
  function validateDocument(doc, opts) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, error: 'not-object' };
    if (doc.schema !== SCHEMA) return { ok: false, error: 'schema' };
    var fetchedMs = parseInstant(doc.fetchedAt);
    if (fetchedMs === null) return { ok: false, error: 'fetchedAt' };
    if (!Array.isArray(doc.jobs)) return { ok: false, error: 'jobs' };
    if (typeof doc.count === 'number' && doc.count !== doc.jobs.length) return { ok: false, error: 'count' };
    var r = normalizeJobs(doc.jobs, opts);
    return { ok: true, jobs: r.jobs, fetchedAt: fetchedMs, droppedCount: sumDropped(r.dropped), dropped: r.dropped };
  }

  return {
    SCHEMA: SCHEMA,
    LIMITS: LIMITS,
    cleanText: cleanText,
    foldName: foldName,
    decodeEntities: decodeEntities,
    safeUrl: safeUrl,
    textToBlocks: textToBlocks,
    htmlToBlocks: htmlToBlocks,
    cleanBlocks: cleanBlocks,
    blocksToText: blocksToText,
    excerpt: excerpt,
    isGeneralName: isGeneralName,
    normalizeJob: normalizeJob,
    normalizeJobs: normalizeJobs,
    sumDropped: sumDropped,
    parseInstant: parseInstant,
    buildDocument: buildDocument,
    validateDocument: validateDocument
  };
});
