/*
 * laus-storf-opus-futura — innfellingarskrifta (embed loader).
 *
 * Aukaleið. Mælt er með venjulegum iframe (sjá README og /ritstjorn/), því
 * margar Payload-uppsetningar fjarlægja <script> úr HTML-reitum. Skriftan
 * gerir iframe-inn sjálfvirkt jafnháan innihaldinu.
 *
 *   <script src="https://reykjanesbaer.github.io/laus-storf-opus-futura/embed.js"
 *           data-theme="light"
 *           data-frame="0"
 *           data-title="0"></script>
 *
 * Allar data-* færibreytur eru sendar áfram á vefinn (data-theme → ?theme=…),
 * nema þessar sem stýra aðeins iframe-inum sjálfum:
 *
 *   data-width         1–100% eða 200–2000px, sjálfgefið 100%
 *   data-max-width     1–100%, 200–2000px eða none, sjálfgefið none
 *   data-align         left, center, right, sjálfgefið left
 *   data-height        byrjunarhæð í px (300–5000) þar til vefurinn lætur vita, sjálfgefið 600
 *   data-iframe-title  titill iframe-sins fyrir skjálesara
 *
 * Öryggi: skilaboð frá iframe-inum eru aðeins tekin gild ef sendandinn er
 * glugginn í iframe-inum okkar, uppruninn er sá sami og skriftan kom frá,
 * gerðin er „laus-storf:height“, auðkennið er þessarar innfellingar og hæðin
 * er tala á skynsamlegu bili. Ekkert úr skilaboðunum fer í CSS eða HTML nema
 * sú tala. Margar innfellingar á sömu síðu trufla ekki hver aðra.
 *
 * Sama gildisathugun og í storf/config.js (parseSize, parseHeight); prófin
 * bera þær saman.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script || !script.src) return;

  var MSG_TYPE = 'laus-storf:height';
  var MIN_H = 50, MAX_H = 20000;

  /* Slóð möppunnar sem embed.js er í — vefurinn er á sama stað */
  var base = script.src.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  var origin;
  try { origin = new URL(base).origin; } catch (e) { return; }

  var frameId = 'ls-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  /* Færibreytur sem stýra iframe-inum, ekki vefnum — ekki sendar áfram */
  var FRAME_ATTRS = { 'width': 1, 'max-width': 1, 'align': 1, 'height': 1, 'iframe-title': 1 };

  function attr(name) {
    var v = script.getAttribute('data-' + name);
    return v === null || v === undefined ? null : String(v);
  }

  var params = new URLSearchParams();
  for (var i = 0; i < script.attributes.length; i++) {
    var a = script.attributes[i];
    if (a.name.indexOf('data-') !== 0) continue;
    var key = a.name.slice(5);
    if (FRAME_ATTRS[key] || !/^[a-z][a-z0-9]{0,15}$/.test(key) || key === 'frameid') continue;
    params.set(key, String(a.value).slice(0, 200));
  }
  params.set('frameId', frameId);

  /* ---------- stærðir ---------- */
  function parseSize(raw, allowNone) {
    if (raw === null) return null;
    var v = String(raw).trim().toLowerCase().replace(/\s+/g, '');
    if (allowNone && v === 'none') return 'none';
    var m = /^(\d+(?:\.\d+)?)(%|px)?$/.exec(v);
    if (!m) return null;
    var n = parseFloat(m[1]), unit = m[2] || 'px';
    var lo = unit === '%' ? 1 : 200, hi = unit === '%' ? 100 : 2000;
    return n >= lo && n <= hi ? n + unit : null;
  }

  function parseHeight(raw) {
    if (raw === null) return null;
    var v = String(raw).trim().toLowerCase().replace(/px$/, '');
    if (!/^\d+$/.test(v)) return null;
    var n = parseInt(v, 10);
    return n >= 300 && n <= 5000 ? n : null;
  }

  var width = parseSize(attr('width'), false) || '100%';
  var maxWidth = parseSize(attr('max-width'), true) || 'none';
  var align = attr('align');
  align = align && /^(left|center|right)$/i.test(align.trim()) ? align.trim().toLowerCase() : 'left';
  var startHeight = parseHeight(attr('height')) || 600;

  var css = 'display:block;border:0;width:' + width + ';' +
    (maxWidth === 'none' ? '' : 'max-width:min(' + maxWidth + ',100%);') +
    'height:' + startHeight + 'px;' +
    (align === 'center' ? 'margin-left:auto;margin-right:auto;' :
      align === 'right' ? 'margin-left:auto;margin-right:0;' : 'margin-left:0;margin-right:auto;') +
    'color-scheme:normal';

  var iframe = document.createElement('iframe');
  iframe.src = base + '?' + params.toString();
  iframe.title = (attr('iframe-title') || 'Laus störf hjá Reykjanesbæ').slice(0, 200);
  iframe.loading = 'lazy';
  iframe.style.cssText = css;

  script.parentNode.insertBefore(iframe, script);

  /* ---------- hæð ---------- */
  window.addEventListener('message', function (event) {
    if (event.source !== iframe.contentWindow) return;      /* aðeins iframe-inn okkar */
    if (event.origin !== origin) return;                    /* aðeins uppruni vefsins */
    var d = event.data;
    if (!d || typeof d !== 'object') return;
    if (d.type !== MSG_TYPE) return;
    if (d.id !== frameId) return;                           /* ekki önnur innfelling á síðunni */
    var h = typeof d.height === 'number' ? d.height : NaN;
    if (!isFinite(h)) return;
    h = Math.round(h);
    if (h < MIN_H || h > MAX_H) return;
    iframe.style.height = h + 'px';
  });
})();
