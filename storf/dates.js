/*
 * Laus störf — dagsetningar.
 *
 * Allt sem snýr að dagsetningum er hér og er notað bæði í vafranum og í
 * samstillingarskriftunni (Node), svo „útrunnið“ þýðir það sama alls staðar.
 *
 * Tímabelti: Atlantic/Reykjavik. Dagsetning án tíma (umsóknarfrestur
 * „2026-10-26“) gildir út allan þann almanaksdag á Íslandi. Gildi með tíma
 * gildir fram að þeirri stundu. Tími sem er nákvæmlega 00:00:00 er túlkaður
 * sem dagsetning án tíma, því kerfi skrá oft „26.10.2026 00:00“ þegar átt er
 * við daginn sjálfan.
 *
 * Skráð form (það sem fer í data/jobs.json):
 *   „YYYY-MM-DD“           dagsetning án tíma
 *   „YYYY-MM-DDTHH:MM:SSZ“ tímapunktur (UTC)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LausStorfDates = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TZ = 'Atlantic/Reykjavik';

  var MONTHS = ['janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní',
    'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember'];

  var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var ISO_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;
  var DMY_RE = /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

  function pad(n, w) {
    var s = String(n);
    while (s.length < (w || 2)) s = '0' + s;
    return s;
  }

  /* Alvöru dagsetning? (30. febrúar er ekki til) */
  function validYmd(y, m, d) {
    if (m < 1 || m > 12 || d < 1) return false;
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  /* Hlutar tímapunkts á Íslandi. Intl er notað svo tímabeltisreglur séu réttar;
     Ísland er reyndar UTC allt árið, svo varaleiðin (UTC) gefur sömu niðurstöðu. */
  var fmt = null;
  try {
    fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  } catch (e) { fmt = null; }

  function iceParts(ms) {
    if (fmt) {
      var o = {};
      fmt.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
      return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
    }
    var d = new Date(ms);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
      h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
  }

  /* Frávik íslensks staðartíma frá UTC á þessari stundu, í millisekúndum */
  function iceOffsetMs(ms) {
    var p = iceParts(ms);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
  }

  /* Staðartími á Íslandi → tímapunktur (ms) */
  function iceLocalToMs(y, m, d, h, mi, s) {
    var guess = Date.UTC(y, m - 1, d, h, mi, s);
    return guess - iceOffsetMs(guess);
  }

  function ymd(p) { return pad(p.y, 4) + '-' + pad(p.m) + '-' + pad(p.d); }

  /* „YYYY-MM-DD“ á Íslandi á þessari stundu */
  function todayInIceland(nowMs) {
    return ymd(iceParts(nowMs === undefined ? Date.now() : nowMs));
  }

  function isoInstant(ms) {
    var d = new Date(ms);
    return pad(d.getUTCFullYear(), 4) + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) +
      'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + 'Z';
  }

  /*
   * Hvaða form sem er sem við skiljum → skráð form, eða null.
   * Engin Date.parse-ágiskun: óþekkt snið eru hafnað frekar en túlkuð vitlaust.
   */
  function normalizeDate(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'string') return null;
    var s = raw.trim();
    if (!s) return null;
    var m;

    if ((m = DATE_RE.exec(s))) {
      return validYmd(+m[1], +m[2], +m[3]) ? s : null;
    }

    if ((m = DMY_RE.exec(s))) {
      var dy = +m[3], dm = +m[2], dd = +m[1];
      if (!validYmd(dy, dm, dd)) return null;
      var base = pad(dy, 4) + '-' + pad(dm) + '-' + pad(dd);
      if (m[4] === undefined) return base;
      var h = +m[4], mi = +m[5], sec = m[6] === undefined ? 0 : +m[6];
      if (h > 23 || mi > 59 || sec > 59) return null;
      if (h === 0 && mi === 0 && sec === 0) return base;
      return isoInstant(iceLocalToMs(dy, dm, dd, h, mi, sec));
    }

    if ((m = ISO_RE.exec(s))) {
      var y = +m[1], mo = +m[2], da = +m[3], hh = +m[4], mm = +m[5], ss = m[6] === undefined ? 0 : +m[6];
      if (!validYmd(y, mo, da) || hh > 23 || mm > 59 || ss > 59) return null;
      var ms;
      if (m[7] === undefined) {
        ms = iceLocalToMs(y, mo, da, hh, mm, ss);          /* án beltis = íslenskur tími */
      } else if (m[7].toUpperCase() === 'Z') {
        ms = Date.UTC(y, mo - 1, da, hh, mm, ss);
      } else {
        var sign = m[7].charAt(0) === '-' ? -1 : 1;
        var digits = m[7].slice(1).replace(':', '');
        ms = Date.UTC(y, mo - 1, da, hh, mm, ss) - sign * (+digits.slice(0, 2) * 60 + +digits.slice(2)) * 60000;
      }
      /* 00:00:00 á íslenskum tíma = „dagurinn sjálfur“ */
      var lp = iceParts(ms);
      if (lp.h === 0 && lp.mi === 0 && lp.s === 0) return ymd(lp);
      return isoInstant(ms);
    }

    return null;
  }

  /* Skráð form → { date: 'YYYY-MM-DD' (íslensk), ms: tímapunktur|null, time: 'HH:MM'|null } */
  function parseNormalized(value) {
    if (typeof value !== 'string') return null;
    var m;
    if ((m = DATE_RE.exec(value))) {
      return validYmd(+m[1], +m[2], +m[3]) ? { date: value, ms: null, time: null } : null;
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) {
      var ms = Date.parse(value);
      if (isNaN(ms)) return null;
      var p = iceParts(ms);
      return { date: ymd(p), ms: ms, time: pad(p.h) + ':' + pad(p.mi) };
    }
    return null;
  }

  /* Skráð dagsetning → „YYYY-MM-DD“ (íslensk) til samanburðar, eða null */
  function dayOf(value) {
    var p = parseNormalized(value);
    return p ? p.date : null;
  }

  /* Er frestur liðinn? Án tíma: liðinn þegar dagurinn er búinn á Íslandi. */
  function isPast(value, nowMs) {
    var p = parseNormalized(value);
    if (!p) return false;
    var now = nowMs === undefined ? Date.now() : nowMs;
    if (p.ms === null) return p.date < todayInIceland(now);
    return now > p.ms;
  }

  /* „26. október 2026“ */
  function formatDate(value) {
    var p = parseNormalized(value);
    if (!p) return '';
    var parts = p.date.split('-');
    return +parts[2] + '. ' + MONTHS[+parts[1] - 1] + ' ' + parts[0];
  }

  /* „26. október 2026 kl. 12:00“ ef tími er skráður, annars eins og formatDate */
  function formatDateTime(value) {
    var p = parseNormalized(value);
    if (!p) return '';
    return formatDate(value) + (p.time ? ' kl. ' + p.time : '');
  }

  /* Dagar frá a til b (YYYY-MM-DD), neikvætt ef b er á undan */
  function daysBetween(a, b) {
    var pa = a.split('-'), pb = b.split('-');
    return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 86400000);
  }

  return {
    TZ: TZ,
    MONTHS: MONTHS,
    normalizeDate: normalizeDate,
    parseNormalized: parseNormalized,
    dayOf: dayOf,
    isPast: isPast,
    todayInIceland: todayInIceland,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    daysBetween: daysBetween
  };
});
