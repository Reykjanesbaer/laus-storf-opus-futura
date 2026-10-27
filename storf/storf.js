/*
 * Laus störf — vefurinn sjálfur: teikning og atburðir.
 *
 * Hleðst á eftir dates.js, normalize.js, filters.js og config.js. Öll gildisathugun
 * er í config.js og normalize.js, öll leit og röðun í filters.js; hér er aðeins DOM.
 *
 * Gögnin koma úr data/jobs.json sem samstillingin skrifar við birtingu —
 * vafrinn talar aldrei við Opus Futura. Allt sem kemur úr gögnunum er sett í
 * DOM með textContent og createElement, aldrei innerHTML.
 */
(function (global) {
  'use strict';

  var cfg = global.LausStorfConfig;
  var D = global.LausStorfDates;
  var N = global.LausStorfNormalize;
  var F = global.LausStorfFilters;
  var script = document.currentScript;

  /* Gagnaslóðin er miðuð við þessa skrá, ekki við síðuna (virkar undir /laus-storf-opus-futura/) */
  var DATA_URL = new URL('../data/jobs.json', script.src).href;

  function $(id) { return document.getElementById(id); }

  var els = {
    wrap: $('wrap'), root: $('storf'), title: $('pageTitle'), intro: $('intro'),
    filters: $('filters'), fSearch: $('fSearch'), fDept: $('fDept'), fSort: $('fSort'), fPeriod: $('fPeriod'),
    q: $('q'), dept: $('dept'), sort: $('sort'), from: $('from'), to: $('to'),
    bar: $('bar'), status: $('status'), reset: $('reset'), stale: $('stale'),
    error: $('error'), errorText: $('errorText'), retry: $('retry'), results: $('results')
  };

  var params = new URLSearchParams(global.location.search);
  var opts = cfg.parse();
  var layout = cfg.parseLayout();
  var inIframe = global.parent !== global;

  /* Auðkenni þessarar innfellingar (embed.js býr það til); aðeins öruggir stafir */
  var frameId = (function () {
    var v = params.get('frameId') || '';
    return /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : '';
  })();

  var darkMq = global.matchMedia('(prefers-color-scheme: dark)');

  /* Staða gagna og síu */
  var data = null;            /* { jobs, prepared, fetchedAt } */
  var state = { q: '', dept: '', from: '', to: '', field: null, sort: 'newest' };
  var expanded = Object.create(null);   /* auðkenni starfa með opna lýsingu */

  /* ------------------------------------------------------------------ */
  /* Útlit                                                               */
  /* ------------------------------------------------------------------ */
  function isDark() {
    return opts.theme === 'dark' || (opts.theme === 'auto' && darkMq.matches);
  }

  function applyAppearance() {
    var p = cfg.palette(opts, isDark());
    var s = global.document.documentElement.style;
    s.setProperty('--s-bg', '#' + p.bg);
    s.setProperty('--s-ink', '#' + p.ink);
    s.setProperty('--s-muted', '#' + p.muted);
    s.setProperty('--s-line', '#' + p.line);
    s.setProperty('--s-soft', '#' + p.soft);
    s.setProperty('--s-control', '#' + p.control);
    s.setProperty('--s-accent', '#' + p.accent);
    s.setProperty('--s-on-accent', '#' + p.onAccent);
    s.setProperty('--s-accent-text', '#' + p.accentText);
    s.setProperty('--s-radius', opts.radius + 'px');
    els.root.style.colorScheme = p.scheme;

    els.root.classList.toggle('bare', !opts.frame);
    els.root.setAttribute('data-view', opts.view);
    els.root.setAttribute('data-spacing', opts.spacing);
    els.title.classList.toggle('sr-only', !opts.title);
    els.intro.hidden = !opts.intro;

    /* Breidd og staðsetning eiga aðeins við beina slóð. Í iframe ræður iframe-inn sjálfur. */
    if (!inIframe) {
      els.wrap.style.width = layout.width;
      els.wrap.style.maxWidth = layout.maxw === 'none' ? '100%' : 'min(' + layout.maxw + ',100%)';
      els.wrap.style.marginLeft = layout.align === 'left' ? '0' : 'auto';
      els.wrap.style.marginRight = layout.align === 'right' ? '0' : 'auto';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Smíði DOM                                                           */
  /* ------------------------------------------------------------------ */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function option(value, text) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    return o;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';
  function icon(kind) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', 'icon icon-' + kind);
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', kind === 'external'
      ? 'M6.5 3H3v10h10V9.5M9.5 2.5H13.5V6.5M13.5 2.5L7.5 8.5'
      : 'M4 6l4 4 4-4');
    svg.appendChild(path);
    return svg;
  }

  /* Ytri tengill: opnast í nýjum glugga, merktur sýnilega og fyrir skjálesara */
  function externalLink(href, label, jobTitle, cls) {
    var a = el('a', 'btn ' + cls);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.appendChild(document.createTextNode(label));
    a.appendChild(icon('external'));
    a.appendChild(el('span', 'sr-only', ' – ' + jobTitle + ' (opnast í nýjum glugga)'));
    return a;
  }

  function renderBlocks(blocks, level) {
    var box = el('div', 'job-details-body');
    blocks.forEach(function (b) {
      if (b.t === 'h') box.appendChild(el('h' + Math.min(level + 1, 6), 'job-details-heading', b.x));
      else if (b.t === 'p') box.appendChild(el('p', null, b.x));
      else {
        var list = el(b.t);
        b.items.forEach(function (i) { list.appendChild(el('li', null, i)); });
        box.appendChild(list);
      }
    });
    return box;
  }

  var uid = 0;

  function renderJob(job, level) {
    var li = el('li', 'job');
    var art = el('article');
    var n = ++uid;
    var titleId = 'job-t-' + n;
    art.setAttribute('aria-labelledby', titleId);

    if (opts.dates && job.publishedAt) art.appendChild(el('p', 'job-kicker', F.publishedLabel(job)));

    var h = el('h' + level, 'job-title', job.title);
    h.id = titleId;
    art.appendChild(h);

    var meta = [];
    if (!opts.groups && job.department) meta.push(job.department);
    if (job.employmentType) meta.push(job.employmentType);
    if (job.location) meta.push(job.location);
    if (meta.length) art.appendChild(el('p', 'job-meta', meta.join(' · ')));

    if (opts.desc && job.summary) art.appendChild(el('p', 'job-summary', job.summary));

    if (opts.deadline && job.deadline) art.appendChild(el('p', 'job-deadline', F.deadlineLabel(job)));

    var actions = el('div', 'job-actions');
    var hasDetails = opts.desc && job.description && job.description.length;

    if (hasDetails) {
      var detId = 'job-d-' + n;
      var open = !!expanded[job.id];
      var btn = el('button', 'btn btn-secondary btn-toggle');
      btn.type = 'button';
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-controls', detId);
      btn.appendChild(document.createTextNode('Nánar um starf'));
      btn.appendChild(icon('chevron'));
      btn.appendChild(el('span', 'sr-only', ' – ' + job.title));

      var det = el('div', 'job-details');
      det.id = detId;
      det.hidden = !open;
      det.appendChild(renderBlocks(job.description, level));
      if (job.detailUrl) {
        var more = el('p', 'job-details-link');
        var a = el('a', 'text-link');
        a.href = job.detailUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.appendChild(document.createTextNode('Sjá auglýsinguna í heild'));
        a.appendChild(icon('external'));
        a.appendChild(el('span', 'sr-only', ' – ' + job.title + ' (opnast í nýjum glugga)'));
        more.appendChild(a);
        det.appendChild(more);
      }
      btn.addEventListener('click', function () {
        var now = btn.getAttribute('aria-expanded') !== 'true';
        btn.setAttribute('aria-expanded', String(now));
        det.hidden = !now;
        if (now) expanded[job.id] = true; else delete expanded[job.id];
      });
      actions.appendChild(btn);
      art.appendChild(det);          /* lýsingin opnast fyrir ofan hnappana */
    } else if (job.detailUrl) {
      actions.appendChild(externalLink(job.detailUrl, 'Nánar um starf', job.title, 'btn-secondary'));
    }

    if (job.applyUrl) actions.appendChild(externalLink(job.applyUrl, 'Sækja um', job.title, 'btn-primary'));
    if (actions.childNodes.length) art.appendChild(actions);

    li.appendChild(art);
    return li;
  }

  function renderList(jobs, level) {
    var ul = el('ul', 'jobs');
    jobs.forEach(function (j) { ul.appendChild(renderJob(j, level)); });
    return ul;
  }

  /* ------------------------------------------------------------------ */
  /* Teikning                                                            */
  /* ------------------------------------------------------------------ */

  /* Virk störf innan þess ramma sem dept-færibreytan setur (ef hún er sett) */
  function scopedJobs(now) {
    return data.jobs.filter(function (j) {
      return F.isActive(j, now) && (!opts.dept || F.groupLabel(j) === opts.dept);
    });
  }

  function setStatus(text) { els.status.textContent = text; }

  function buildSelects(scoped) {
    /* Svið */
    var labels = F.departments(scoped);
    els.dept.textContent = '';
    els.dept.appendChild(option('', 'Allt'));
    labels.forEach(function (l) { els.dept.appendChild(option(l, l)); });
    if (labels.indexOf(state.dept) === -1) state.dept = '';
    els.dept.value = state.dept;

    /* Röðun: aðeins það sem gögnin bera uppi */
    var names = { newest: 'Nýjustu fyrst', deadline: 'Umsóknarfrestur (næsti fyrst)', title: 'Heiti (A–Ö)' };
    els.sort.textContent = '';
    F.sortOptions(scoped).forEach(function (k) { els.sort.appendChild(option(k, names[k])); });
    state.sort = F.effectiveSort(scoped, state.sort);
    els.sort.value = state.sort;

    /* Tímabil: aðeins ef einhver dagsetning er til */
    state.field = F.rangeField(scoped);
    var legend = els.fPeriod.querySelector('legend');
    legend.textContent = 'Veldu tímabil';
    var hint = state.field === 'deadline' ? 'umsóknarfrestur' : 'auglýst';
    $('fromLabel').textContent = 'Frá (' + hint + ')';
    $('toLabel').textContent = 'Til (' + hint + ')';
  }

  function render() {
    applyAppearance();
    if (!data) return;

    var now = Date.now();
    var scoped = scopedJobs(now);
    var any = scoped.length > 0;

    els.stale.hidden = !F.isStale(data.fetchedAt, now);
    if (!els.stale.hidden) {
      els.stale.textContent = 'Upplýsingarnar voru síðast uppfærðar ' + F.updatedLabel(data.fetchedAt) +
        ' og kunna að vera úreltar.';
    }

    /* Valmyndir miðast við þau störf sem eru til núna */
    buildSelects(scoped);

    var showFilters = any && !!opts.filters;
    var showSearch = any && !!opts.search;
    els.filters.hidden = !(showFilters || showSearch);
    els.fSearch.hidden = !showSearch;
    els.fDept.hidden = !(showFilters && !opts.dept);
    els.fSort.hidden = !showFilters || els.sort.options.length < 2;
    els.fPeriod.hidden = !(showFilters && state.field);
    els.bar.hidden = false;          /* stöðulínan flytur líka „engin störf“ */

    /* Falin stýring má ekki halda síu virkri */
    var effective = {
      q: showSearch ? state.q : '',
      dept: showFilters && !opts.dept ? state.dept : '',
      from: showFilters && state.field ? state.from : '',
      to: showFilters && state.field ? state.to : '',
      field: state.field
    };

    els.results.textContent = '';
    uid = 0;

    if (!any) {
      setStatus('Engin laus störf eru auglýst sem stendur.');
      els.status.classList.add('is-empty');
      els.reset.hidden = true;
      return;
    }
    els.status.classList.remove('is-empty');

    var prepared = data.prepared.filter(function (p) {
      return !opts.dept || F.groupLabel(p.job) === opts.dept;
    });
    var found = F.sortJobs(F.filterPrepared(prepared, effective, now), state.sort);

    els.reset.hidden = !F.hasActiveFilter(effective);

    if (!found.length) {
      setStatus('Engin störf fundust sem passa við leitina.');
      els.status.classList.add('is-empty');
      return;
    }
    setStatus(F.countLabel(found.length));

    if (opts.groups) {
      F.groupJobs(found).forEach(function (g) {
        var sec = el('section', 'group');
        var hid = 'grp-' + (++uid);
        sec.setAttribute('aria-labelledby', hid);
        var h2 = el('h2', 'group-title', g.label);
        h2.id = hid;
        h2.appendChild(el('span', 'group-count', ' (' + g.jobs.length + ')'));
        sec.appendChild(h2);
        sec.appendChild(renderList(g.jobs, 3));
        els.results.appendChild(sec);
      });
    } else {
      els.results.appendChild(renderList(found, 2));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Villur og hleðsla                                                   */
  /* ------------------------------------------------------------------ */
  function showError(text) {
    data = null;
    els.results.textContent = '';
    els.filters.hidden = true;
    els.bar.hidden = true;
    els.stale.hidden = true;
    els.errorText.textContent = text;
    els.error.hidden = false;
    setStatus('');
    els.root.removeAttribute('aria-busy');
    postHeight();
  }

  function load() {
    els.error.hidden = true;
    els.root.setAttribute('aria-busy', 'true');
    setStatus('Hleð störfum…');
    els.status.classList.remove('is-empty');

    return global.fetch(DATA_URL, { cache: 'no-cache', credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('http');
        return res.json();
      })
      .then(function (doc) {
        var v = N.validateDocument(doc);
        if (!v.ok) throw new Error('invalid');
        data = { jobs: v.jobs, prepared: F.prepare(v.jobs), fetchedAt: v.fetchedAt };
        els.root.removeAttribute('aria-busy');
        render();
      })
      .catch(function () {
        showError('Ekki tókst að birta laus störf úr Opus Futura í augnablikinu. Vinsamlegast reyndu aftur síðar.');
      });
  }

  /* ------------------------------------------------------------------ */
  /* Hæð send á foreldrasíðu (embed.js)                                  */
  /* ------------------------------------------------------------------ */
  var lastHeight = 0;

  function postHeight() {
    if (!inIframe) return;
    var h = Math.ceil(els.wrap.getBoundingClientRect().height) + 1;
    if (h === lastHeight || h < 2) return;
    lastHeight = h;
    try {
      global.parent.postMessage({ type: 'laus-storf:height', id: frameId, height: h }, '*');
    } catch (e) { /* hunsum */ }
  }

  /* ------------------------------------------------------------------ */
  /* Atburðir                                                            */
  /* ------------------------------------------------------------------ */
  els.q.addEventListener('input', function () { state.q = els.q.value; render(); });
  els.dept.addEventListener('change', function () { state.dept = els.dept.value; render(); });
  els.sort.addEventListener('change', function () { state.sort = els.sort.value; render(); });
  els.from.addEventListener('change', function () { state.from = els.from.value; render(); });
  els.to.addEventListener('change', function () { state.to = els.to.value; render(); });
  els.filters.addEventListener('submit', function (e) { e.preventDefault(); });

  els.reset.addEventListener('click', function () {
    state.q = ''; state.dept = ''; state.from = ''; state.to = '';
    els.q.value = ''; els.from.value = ''; els.to.value = '';
    render();
    els.q.focus();
  });

  els.retry.addEventListener('click', load);

  /* theme=auto bregst við því að notandinn skipti um stillingu */
  if (darkMq.addEventListener) darkMq.addEventListener('change', render);
  /* Frestir geta runnið út meðan síðan er opin */
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });

  /*
   * Kóðasmiðurinn (sami uppruni) sendir nýjar stillingar án þess að síðan
   * endurhlaðist. Aðeins frá foreldrasíðu á sama uppruna.
   */
  global.addEventListener('message', function (e) {
    if (e.origin !== global.location.origin || e.source !== global.parent) return;
    var d = e.data;
    if (!d || d.type !== 'laus-storf:options' || typeof d.options !== 'object') return;
    opts = cfg.parse(d.options);
    state.sort = opts.sort;
    render();
  });

  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(postHeight).observe(els.wrap);
  else global.addEventListener('resize', postHeight);

  if (!inIframe) document.documentElement.classList.add('top-level');
  state.sort = opts.sort;
  applyAppearance();
  load();
})(typeof globalThis !== 'undefined' ? globalThis : window);
