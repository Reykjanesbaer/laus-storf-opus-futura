/*
 * Laus störf — stillingar, gildisathugun, litir og stærðir.
 *
 * Ein skrá sem þrír aðilar nota svo sjálfgefin gildi og gildisathugun séu
 * skilgreind á einum stað: vefurinn sjálfur (storf.js), kóðasmiðurinn
 * (ritstjorn/) og prófin. embed.js er viljandi sjálfstæð (ein beiðni) og er
 * borin saman við þessa skrá í prófunum.
 *
 * Allar stillingar eru færibreytur í slóðinni. Ógild gildi (utan bils,
 * óþekkt orð, röng gerð) falla á sjálfgefið gildi — aldrei villa.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LausStorfConfig = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Slóðin sem kóðasmiðurinn setur í innfellingarkóða (eina framleiðsluslóðin) */
  var PRODUCTION_BASE = 'https://reykjanesbaer.github.io/laus-storf-opus-futura/';

  /* --------------------------------------------------------------------
   * Stillingar á vefnum sjálfum. Hver lína: sjálfgefið + hvernig gildi er athugað.
   * ------------------------------------------------------------------ */
  var SPEC = {
    theme:    { def: 'auto',   one: ['auto', 'light', 'dark'] },
    accent:   { def: '1D4D91', color: true },
    bg:       { def: '',       color: true, empty: true },
    bgdark:   { def: '',       color: true, empty: true },
    radius:   { def: 6,        num: [0, 24], heil: true },
    frame:    { def: 1,        bit: true },
    title:    { def: 1,        bit: true },
    intro:    { def: 1,        bit: true },
    search:   { def: 1,        bit: true },
    filters:  { def: 1,        bit: true },
    groups:   { def: 1,        bit: true },
    dates:    { def: 1,        bit: true },
    desc:     { def: 1,        bit: true },
    deadline: { def: 1,        bit: true },
    sort:     { def: 'newest', one: ['newest', 'deadline', 'title'] },
    dept:     { def: '',       str: 100 },
    spacing:  { def: 'compact', one: ['compact', 'normal'] },
    view:     { def: 'list',   one: ['list', 'cards'] }
  };

  var KEYS = Object.keys(SPEC);
  var COLOR_KEYS = ['accent', 'bg', 'bgdark'];
  var BG_FALLBACK = { bg: 'FFFFFF', bgdark: '1B2024' };

  /* „1D4D91“, „#1d4d91“ og „%231D4D91“ → „1D4D91“; annars null */
  function parseColor(raw) {
    if (raw === null || raw === undefined) return null;
    var v = String(raw).trim().replace(/^(#|%23)/i, '');
    return /^[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : null;
  }

  function cleanStr(raw, max) {
    return String(raw).replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮﻿]/g, '')
      .replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function defaults() {
    var o = {};
    KEYS.forEach(function (k) { o[k] = SPEC[k].def; });
    return o;
  }

  /* Eitt gildi athugað; skilar sjálfgefnu ef það stenst ekki */
  function check(key, raw) {
    var s = SPEC[key];
    if (!s) return undefined;
    if (raw === null || raw === undefined) return s.def;
    if (typeof raw === 'object') return s.def;
    if (s.color) {
      if (s.empty && String(raw).trim() === '') return '';
      return parseColor(raw) || s.def;
    }
    if (s.str) return cleanStr(raw, s.str);
    var v = String(raw).trim().toLowerCase();
    if (s.num) {
      if (!/^\d+(\.\d+)?$/.test(v)) return s.def;
      var n = parseFloat(v);
      if (s.heil) n = Math.round(n);
      return n >= s.num[0] && n <= s.num[1] ? n : s.def;
    }
    if (s.bit) return v === '1' ? 1 : v === '0' ? 0 : s.def;
    return s.one.indexOf(v) !== -1 ? v : s.def;
  }

  /* Færibreytur úr query-streng eða hlut (t.d. frá kóðasmiðnum) */
  function reader(source) {
    if (typeof source === 'string') {
      var q = new URLSearchParams(source);
      return function (k) { return q.get(k); };
    }
    if (source === undefined || source === null) {
      var g = typeof globalThis !== 'undefined' && globalThis.location ? globalThis.location.search : '';
      var q2 = new URLSearchParams(g);
      return function (k) { return q2.get(k); };
    }
    return function (k) { return Object.prototype.hasOwnProperty.call(source, k) ? source[k] : undefined; };
  }

  function parse(source) {
    var get = reader(source);
    var o = {};
    KEYS.forEach(function (k) { o[k] = check(k, get(k)); });
    return o;
  }

  /* Aðeins það sem víkur frá sjálfgefnu, í fastri röð (til að smíða slóð) */
  function changed(o) {
    var out = [];
    KEYS.forEach(function (k) {
      if (o[k] !== undefined && o[k] !== SPEC[k].def) out.push([k, String(o[k])]);
    });
    return out;
  }

  function toQuery(o) {
    var p = new URLSearchParams();
    changed(o).forEach(function (kv) { p.set(kv[0], kv[1]); });
    return p.toString();
  }

  /* --------------------------------------------------------------------
   * Stærð og staðsetning (umgjörð iframe-sins; á við beina slóð þegar
   * síðan er ekki sjálf í iframe).
   * ------------------------------------------------------------------ */
  var SIZE = {
    width:    { def: '100%',  pct: [1, 100], px: [200, 2000], none: false },
    maxWidth: { def: 'none',  pct: [1, 100], px: [200, 2000], none: true }
  };
  var ALIGN = ['left', 'center', 'right'];
  var HEIGHT = { def: 1000, min: 300, max: 5000 };

  /* „80%“, „480px“, „480“ (= px) eða „none“. Utan marka → null. */
  function parseSize(raw, kind) {
    var s = SIZE[kind];
    if (raw === null || raw === undefined || typeof raw === 'object') return null;
    var v = String(raw).trim().toLowerCase().replace(/\s+/g, '');
    if (s.none && v === 'none') return 'none';
    var m = /^(\d+(?:\.\d+)?)(%|px)?$/.exec(v);
    if (!m) return null;
    var n = parseFloat(m[1]), unit = m[2] || 'px';
    var lim = unit === '%' ? s.pct : s.px;
    return n >= lim[0] && n <= lim[1] ? n + unit : null;
  }

  function parseHeight(raw) {
    if (raw === null || raw === undefined || typeof raw === 'object') return null;
    var v = String(raw).trim().toLowerCase().replace(/px$/, '');
    if (!/^\d+$/.test(v)) return null;
    var n = parseInt(v, 10);
    return n >= HEIGHT.min && n <= HEIGHT.max ? n : null;
  }

  function layoutDefaults() {
    return { width: SIZE.width.def, maxw: SIZE.maxWidth.def, align: 'left', height: HEIGHT.def };
  }

  /* Stærðarstillingar úr query-streng eða hlut; ógilt → sjálfgefið */
  function parseLayout(source) {
    var get = reader(source), d = layoutDefaults();
    var a = get('align');
    return {
      width: parseSize(get('width'), 'width') || d.width,
      maxw: parseSize(get('maxw'), 'maxWidth') || d.maxw,
      align: a && ALIGN.indexOf(String(a).toLowerCase()) !== -1 ? String(a).toLowerCase() : d.align,
      height: parseHeight(get('height')) || d.height
    };
  }

  function margins(align) {
    if (align === 'center') return 'margin-left:auto;margin-right:auto;';
    if (align === 'right') return 'margin-left:auto;margin-right:0;';
    return 'margin-left:0;margin-right:auto;';
  }

  /* width/max-width sem CSS. max-width er aldrei breiðara en 100%. „none“ sleppir því. */
  function sizeCss(width, maxWidth) {
    var w = parseSize(width, 'width') || SIZE.width.def;
    var m = parseSize(maxWidth, 'maxWidth') || SIZE.maxWidth.def;
    var css = 'width:' + w;
    if (m !== 'none') css += ';max-width:min(' + m + ',100%)';
    return css;
  }

  /* --------------------------------------------------------------------
   * Litir og birtuskil (WCAG 2.2 AA: 4,5:1 texti, 3:1 stjórntæki)
   * ------------------------------------------------------------------ */
  var AA = 4.5, UI = 3;

  function rgb(h) { var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hex(c) {
    return c.map(function (v) {
      var s = Math.round(Math.max(0, Math.min(255, v))).toString(16).toUpperCase();
      return s.length === 1 ? '0' + s : s;
    }).join('');
  }
  function luminance(c) {
    var a = c.map(function (v) {
      var s = v / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrast(a, b) {
    var la = luminance(rgb(a)), lb = luminance(rgb(b));
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function mix(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
  }

  /* Sami litur, ljósari eða dekkri, þar til hann nær markinu á þessum bakgrunni */
  function readable(color, bg, target) {
    var goal = target || AA;
    if (contrast(color, bg) >= goal) return color;
    /* Í átt að því af svörtu/hvítu sem hefur meiri birtuskil við bakgrunninn (ekki bara
       „dökkur → ljósara“: á skærrauðu er svart betra en hvítt) */
    var towards = contrast('FFFFFF', bg) >= contrast('000000', bg) ? 'FFFFFF' : '000000';
    for (var t = 0.05; t <= 1.0001; t += 0.05) {
      var c = mix(color, towards, t);
      if (contrast(c, bg) >= goal) return c;
    }
    return towards;
  }

  var INK_DARK = '1F2937', INK_LIGHT = 'E8ECEF';

  /*
   * Allir litir vefsins út frá stillingum og því hvort þemað er dökkt. Texti,
   * jaðrar og áherslulitur eru reiknaðir út frá bakgrunninum, svo hvaða
   * bakgrunnslitur sem ritstjóri velur gefur læsilegan texta.
   */
  function palette(o, dark) {
    var bg = (dark ? o.bgdark : o.bg) || (dark ? BG_FALLBACK.bgdark : BG_FALLBACK.bg);
    var light = contrast(bg, INK_LIGHT) > contrast(bg, INK_DARK);
    /* Sjálfgefinn texti, dekktur/ljósaður ef bakgrunnurinn er á mörkunum (t.d. skærrauður) */
    var ink = readable(light ? INK_LIGHT : INK_DARK, bg, 7);
    var accent = o.accent;
    return {
      bg: bg,
      ink: ink,
      muted: readable(light ? 'A9B3BA' : '4B5563', bg, AA),
      line: mix(bg, ink, 0.16),
      soft: mix(bg, ink, 0.05),
      control: readable(mix(bg, ink, 0.5), bg, UI),
      accent: accent,
      onAccent: contrast('FFFFFF', accent) >= contrast('111827', accent) ? 'FFFFFF' : '111827',
      accentText: readable(accent, bg, AA),
      scheme: light ? 'dark' : 'light'
    };
  }

  /* Birtuskil hnappa (texti á áherslulit); kóðasmiðurinn varar við ef undir 4,5 */
  function buttonContrast(accent) {
    var p = palette({ accent: accent, bg: '', bgdark: '' }, false);
    return contrast(p.onAccent, accent);
  }

  return {
    PRODUCTION_BASE: PRODUCTION_BASE,
    SPEC: SPEC,
    KEYS: KEYS,
    COLOR_KEYS: COLOR_KEYS,
    BG_FALLBACK: BG_FALLBACK,
    SIZE: SIZE,
    ALIGN: ALIGN,
    HEIGHT: HEIGHT,
    parseColor: parseColor,
    defaults: defaults,
    check: check,
    parse: parse,
    changed: changed,
    toQuery: toQuery,
    parseSize: parseSize,
    parseHeight: parseHeight,
    layoutDefaults: layoutDefaults,
    parseLayout: parseLayout,
    margins: margins,
    sizeCss: sizeCss,
    contrast: contrast,
    readable: readable,
    mix: mix,
    palette: palette,
    buttonContrast: buttonContrast
  };
});
