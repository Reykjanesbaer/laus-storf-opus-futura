/*
 * Laus störf — smíði innfellingarkóða.
 *
 * Kóðasmiðurinn (ritstjorn/) notar þetta og prófin líka, svo kóðinn sem
 * ritstjóri afritar sé nákvæmlega það sem er prófað. Engin DOM-snerting.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./config.js'));
  else root.LausStorfEmbedCode = factory(root.LausStorfConfig);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';

  var IFRAME_TITLE = 'Laus störf hjá Reykjanesbæ';

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /*
   * Slóð í src-eigind. „&“ milli færibreyta er látið óbreytt (eins og í dæmum
   * Payload og HTML5 leyfir þegar nafnið myndar ekki nafngreinda einingu);
   * gildin eru prósentukóðuð af URLSearchParams svo „"“, „<“ og „>“ geta ekki komið fyrir.
   */
  function escapeUrlAttr(s) {
    return String(s).replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E');
  }

  /*
   * Grunnslóð sem fer í kóðann. Í staðbundinni prófun (localhost, file://) er
   * framleiðsluslóðin notuð, svo kóði sem er afritaður þaðan virki á vef bæjarins.
   * `loc` er { protocol, hostname, href } (location eða eftirlíking).
   */
  function resolveBase(loc) {
    var host = loc && loc.hostname ? loc.hostname : '';
    var local = !host || host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1' ||
      /^file:?$/.test(loc && loc.protocol || '') || /\.local$/.test(host);
    if (local) return { base: C.PRODUCTION_BASE, local: true };
    var u = new URL('../', loc.href);
    u.search = '';
    u.hash = '';
    return { base: u.href, local: false };
  }

  /* Slóð á vefinn. layout (valfrjálst) bætir breidd/staðsetningu við beina slóð. */
  function buildUrl(base, opts, layout) {
    var p = new URLSearchParams(C.toQuery(opts));
    if (layout) {
      var d = C.layoutDefaults();
      if (layout.width !== d.width) p.set('width', layout.width);
      if (layout.maxw !== d.maxw) p.set('maxw', layout.maxw);
      if (layout.align !== d.align) p.set('align', layout.align);
    }
    var q = p.toString();
    return base + (q ? '?' + q : '');
  }

  /* Gildir í iframe-kóðanum: width/max-width/margin í style, ekki í slóðinni */
  function iframeStyle(layout) {
    var d = C.layoutDefaults();
    var css = C.sizeCss(layout.width, layout.maxw) + ';height:' + layout.height + 'px;border:0;display:block;';
    var plain = layout.width === d.width && layout.maxw === d.maxw && layout.align === d.align;
    if (!plain) css += C.margins(layout.align);
    return css;
  }

  /* Aðaluppsetning (mælt með): venjulegur iframe án JavaScript */
  function iframeCode(base, opts, layout) {
    var url = buildUrl(base, opts, null);
    return '<iframe\n' +
      '  src="' + escapeUrlAttr(url) + '"\n' +
      '  title="' + IFRAME_TITLE + '"\n' +
      '  loading="lazy"\n' +
      '  style="' + escapeAttr(iframeStyle(layout)) + '">\n' +
      '</iframe>';
  }

  /* Aukaleið: skrifta sem stillir hæðina sjálfkrafa */
  function scriptCode(base, opts, layout) {
    var d = C.layoutDefaults();
    var attrs = C.changed(opts).map(function (kv) { return '  data-' + kv[0] + '="' + escapeAttr(kv[1]) + '"'; });
    if (layout.width !== d.width) attrs.push('  data-width="' + escapeAttr(layout.width) + '"');
    if (layout.maxw !== d.maxw) attrs.push('  data-max-width="' + escapeAttr(layout.maxw) + '"');
    if (layout.align !== d.align) attrs.push('  data-align="' + escapeAttr(layout.align) + '"');
    return '<script\n  src="' + escapeUrlAttr(base + 'embed.js') + '"' +
      (attrs.length ? '\n' + attrs.join('\n') : '') + '>\n</' + 'script>';
  }

  return {
    IFRAME_TITLE: IFRAME_TITLE,
    escapeAttr: escapeAttr,
    resolveBase: resolveBase,
    buildUrl: buildUrl,
    iframeStyle: iframeStyle,
    iframeCode: iframeCode,
    scriptCode: scriptCode
  };
});
