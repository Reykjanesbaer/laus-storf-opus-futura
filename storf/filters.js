/*
 * Laus störf — leit, síur, röðun, flokkun og textar.
 *
 * Hreinar aðgerðir án DOM-snertingar, svo þær séu prófaðar beint og
 * storf.js þurfi aðeins að teikna.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dates.js'), require('./normalize.js'));
  else root.LausStorfFilters = factory(root.LausStorfDates, root.LausStorfNormalize);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D, N) {
  'use strict';

  var OTHER_LABEL = 'Önnur störf';
  var GENERAL_LABEL = 'Almenn umsókn';
  var STALE_HOURS = 12;           /* samstillt á ~30 mín fresti; eldri gögn teljast úrelt */

  /* ------------------------------------------------------------------ */
  /* Leit                                                                */
  /* ------------------------------------------------------------------ */

  /*
   * Smáir stafir og íslenskir stafir felldir saman (ð→d, þ→th, æ→ae, ö→o, áéíóúý→aeioury), svo „menntasvid“
   * finni „Menntasvið“ hjá þeim sem hafa ekki íslenskt lyklaborð.
   */
  function fold(s) {
    return String(s === null || s === undefined ? '' : s).toLowerCase()
      .replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/æ/g, 'ae').replace(/ö/g, 'o')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  /* Leitartexti starfs (heiti, svið, staðsetning, tegund, samantekt og lýsing) */
  function haystack(job) {
    return fold([job.title, job.department, job.location, job.employmentType, job.summary,
      job.description ? N.blocksToText(job.description) : ''].join(' '));
  }

  /* Gefur afrit með leitartexta til hliðar; upprunalegu störfin breytast ekki */
  function prepare(jobs) {
    return jobs.map(function (j) { return { job: j, hay: haystack(j) }; });
  }

  /* ------------------------------------------------------------------ */
  /* Svið og flokkar                                                     */
  /* ------------------------------------------------------------------ */

  /* Heiti flokks. Almenn umsókn án sviðs fær heitið „Almenn umsókn“. */
  function groupLabel(job) {
    if (job.department) return job.department;
    return job.isGeneral ? GENERAL_LABEL : OTHER_LABEL;
  }

  function byLabel(a, b) { return a.localeCompare(b, 'is'); }

  /* Röð flokka: almennar umsóknir fyrst, síðan svið í stafrófsröð, „Önnur störf“ síðast */
  function orderLabels(entries) {
    return entries.sort(function (a, b) {
      if (a.general !== b.general) return a.general ? -1 : 1;
      if ((a.label === OTHER_LABEL) !== (b.label === OTHER_LABEL)) return a.label === OTHER_LABEL ? 1 : -1;
      return byLabel(a.label, b.label);
    });
  }

  /* Valkostir í „Eftir tegund“: aðeins það sem er í gögnunum */
  function departments(jobs) {
    var seen = Object.create(null), list = [];
    jobs.forEach(function (j) {
      var l = groupLabel(j);
      if (!seen[l]) { seen[l] = true; list.push({ label: l, general: !!j.isGeneral || N.isGeneralName(l) }); }
      else if (j.isGeneral) { list.forEach(function (e) { if (e.label === l) e.general = true; }); }
    });
    return orderLabels(list).map(function (e) { return e.label; });
  }

  function groupJobs(jobs) {
    var map = Object.create(null), list = [];
    jobs.forEach(function (j) {
      var l = groupLabel(j);
      if (!map[l]) { map[l] = { label: l, general: false, jobs: [] }; list.push(map[l]); }
      map[l].jobs.push(j);
      if (j.isGeneral) map[l].general = true;
    });
    return orderLabels(list);
  }

  /* ------------------------------------------------------------------ */
  /* Dagsetningar og tímabil                                             */
  /* ------------------------------------------------------------------ */

  function isActive(job, nowMs) {
    return !(job.deadline && D.isPast(job.deadline, nowMs));
  }

  /* Hvaða dagsetningarreitur ber tímabilssíuna uppi — aðeins það sem er til í gögnunum */
  function rangeField(jobs) {
    if (jobs.some(function (j) { return j.publishedAt; })) return 'publishedAt';
    if (jobs.some(function (j) { return j.deadline; })) return 'deadline';
    return null;
  }

  function validDay(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && D.normalizeDate(s) === s; }

  /* ------------------------------------------------------------------ */
  /* Röðun                                                               */
  /* ------------------------------------------------------------------ */

  function cmpNullLast(a, b, dir) {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a < b ? -dir : dir;
  }

  var COMPARE = {
    newest: function (a, b) {
      return cmpNullLast(a.publishedAt, b.publishedAt, -1) ||
        cmpNullLast(a.deadline, b.deadline, 1) || byLabel(a.title, b.title);
    },
    deadline: function (a, b) {
      return cmpNullLast(a.deadline, b.deadline, 1) ||
        cmpNullLast(a.publishedAt, b.publishedAt, -1) || byLabel(a.title, b.title);
    },
    title: function (a, b) { return byLabel(a.title, b.title); }
  };

  /* Röðunarvalkostir sem gögnin bera uppi */
  function sortOptions(jobs) {
    var out = [];
    if (jobs.some(function (j) { return j.publishedAt; })) out.push('newest');
    if (jobs.some(function (j) { return j.deadline; })) out.push('deadline');
    out.push('title');
    return out;
  }

  /* Ef beðið er um röðun sem gögnin styðja ekki er næsta nothæfa valin */
  function effectiveSort(jobs, requested) {
    var opts = sortOptions(jobs);
    if (opts.indexOf(requested) !== -1) return requested;
    return opts[0];
  }

  function sortJobs(jobs, sort) {
    var cmp = COMPARE[effectiveSort(jobs, sort)];
    return jobs.slice().sort(cmp);
  }

  /* ------------------------------------------------------------------ */
  /* Síun                                                                */
  /* ------------------------------------------------------------------ */

  /*
   * state: { q, dept, from, to, field }. Allt virkar saman.
   * prepared: úttak prepare() — { job, hay }[]
   */
  function filterPrepared(prepared, state, nowMs) {
    var tokens = fold(state.q).split(' ').filter(Boolean);
    var from = validDay(state.from) ? state.from : '';
    var to = validDay(state.to) ? state.to : '';
    var field = state.field;

    return prepared.filter(function (p) {
      var j = p.job;
      if (!isActive(j, nowMs)) return false;
      if (state.dept && groupLabel(j) !== state.dept) return false;
      for (var i = 0; i < tokens.length; i++) if (p.hay.indexOf(tokens[i]) === -1) return false;
      if ((from || to) && field) {
        var day = D.dayOf(j[field]);
        if (!day) return false;
        if (from && day < from) return false;
        if (to && day > to) return false;
      }
      return true;
    }).map(function (p) { return p.job; });
  }

  /* Er einhver sía virk? (stýrir „Hreinsa síur“) */
  function hasActiveFilter(state) {
    return !!(fold(state.q) || state.dept || validDay(state.from) || validDay(state.to));
  }

  /* ------------------------------------------------------------------ */
  /* Textar                                                              */
  /* ------------------------------------------------------------------ */

  /* „1 laust starf“, „2 laus störf“, „21 laust starf“, „11 laus störf“ */
  function countLabel(n) {
    var one = n % 10 === 1 && n % 100 !== 11;
    return n + (one ? ' laust starf' : ' laus störf');
  }

  function deadlineLabel(job) {
    return job.deadline ? 'Umsóknarfrestur til ' + D.formatDateTime(job.deadline) : '';
  }

  function publishedLabel(job) {
    return job.publishedAt ? 'Auglýst ' + D.formatDate(job.publishedAt) : '';
  }

  function isStale(fetchedAtMs, nowMs) {
    return typeof fetchedAtMs === 'number' && (nowMs - fetchedAtMs) > STALE_HOURS * 3600000;
  }

  /* „19. október 2026 kl. 14:37“ að íslenskum tíma */
  function updatedLabel(fetchedAtMs) {
    var iso = new Date(fetchedAtMs).toISOString().replace(/\.\d+Z$/, 'Z');
    return D.formatDateTime(iso);
  }

  return {
    OTHER_LABEL: OTHER_LABEL,
    GENERAL_LABEL: GENERAL_LABEL,
    STALE_HOURS: STALE_HOURS,
    fold: fold,
    prepare: prepare,
    groupLabel: groupLabel,
    departments: departments,
    groupJobs: groupJobs,
    isActive: isActive,
    rangeField: rangeField,
    validDay: validDay,
    sortOptions: sortOptions,
    effectiveSort: effectiveSort,
    sortJobs: sortJobs,
    filterPrepared: filterPrepared,
    hasActiveFilter: hasActiveFilter,
    countLabel: countLabel,
    deadlineLabel: deadlineLabel,
    publishedLabel: publishedLabel,
    isStale: isStale,
    updatedLabel: updatedLabel
  };
});
