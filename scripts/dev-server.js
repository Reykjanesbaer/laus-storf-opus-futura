#!/usr/bin/env node
/*
 * Laus störf — staðbundinn þjónn til prófunar.
 *
 *   node scripts/dev-server.js [--port 8080] [--root <mappa>] [--fixture]
 *
 * Þjónar skránum eins og GitHub Pages myndi gera, undir slóðinni
 * /laus-storf-opus-futura/ (til að prófa að allt virki undir undirslóð) og
 * líka í rót. Með --fixture er /data/jobs.json búið til úr UPPSPUNNUM
 * prófunargögnum (tests/fixtures/sample.js) — aldrei notað í framleiðslu.
 * Án --fixture er data/jobs.json lesið úr möppunni ef hún er til.
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');

var TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8'
};

var BASE_PATH = '/laus-storf-opus-futura';

function createServer(o) {
  o = o || {};
  var root = path.resolve(o.root || path.join(__dirname, '..'));
  var fixture = !!o.fixture;
  var fixtureDoc = o.fixtureDoc;        /* fall sem skilar skjali, fyrir próf */

  return http.createServer(function (req, res) {
    var url = new URL(req.url, 'http://localhost');
    var p = decodeURIComponent(url.pathname);
    if (p === BASE_PATH) { res.writeHead(301, { location: BASE_PATH + '/' }); res.end(); return; }
    if (p.indexOf(BASE_PATH + '/') === 0) p = p.slice(BASE_PATH.length);

    if (p === '/data/jobs.json' && (fixture || fixtureDoc)) {
      /* fixtureDoc (próf) má skila hlut, texta (hrátt svar), null (404) eða kasta (500) */
      var doc;
      try { doc = fixtureDoc ? fixtureDoc() : require('../tests/fixtures/sample.js').sampleDocument(Date.now()); }
      catch (e) { res.writeHead(500); res.end('villa'); return; }
      if (doc === null) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Fannst ekki'); return; }
      res.writeHead(200, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' });
      res.end(typeof doc === 'string' ? doc : JSON.stringify(doc));
      return;
    }

    if (p.slice(-1) === '/') p += 'index.html';
    var file = path.join(root, p);
    if (file.indexOf(root + path.sep) !== 0) { res.writeHead(403); res.end('Bannað'); return; }

    fs.readFile(file, function (err, buf) {
      if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Fannst ekki'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(buf);
    });
  });
}

module.exports = { createServer: createServer, BASE_PATH: BASE_PATH };

if (require.main === module) {
  var args = process.argv.slice(2);
  var port = 8080, root, fixture = false;
  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--port') port = +args[++i];
    else if (args[i] === '--root') root = args[++i];
    else if (args[i] === '--fixture') fixture = true;
  }
  createServer({ root: root, fixture: fixture }).listen(port, '127.0.0.1', function () {
    console.log('Þjónn á http://127.0.0.1:' + port + '/  (og /laus-storf-opus-futura/)' +
      (fixture ? '  — UPPSPUNNIN PRÓFUNARGÖGN' : ''));
  });
}
