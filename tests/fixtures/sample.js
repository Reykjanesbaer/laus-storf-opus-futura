/*
 * Prófunargögn á OKKAR sniði (data/jobs.json), ekki sniði Opus Futura.
 *
 * Öll störf hér eru uppspuni og heita „Prófun – …“. Þau eru eingöngu notuð í
 * prófum og í staðbundnum þjóni (`npm run dev`); build-site.js afritar þau
 * aldrei í birtingu og þau mega aldrei sjást á framleiðsluvefnum.
 *
 * Dagsetningar eru reiknaðar út frá `nowMs` svo sýnidæmið sé alltaf „í dag“.
 */
'use strict';

var D = require('../../storf/dates.js');
var N = require('../../storf/normalize.js');

function addDays(ymd, n) {
  var p = ymd.split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return d.toISOString().slice(0, 10);
}

function sampleJobs(nowMs) {
  var today = D.todayInIceland(nowMs);
  var day = function (n) { return addDays(today, n); };

  return [
    {
      id: 'prof-almenn', title: 'Prófun – Almenn umsókn', department: 'Almenn umsókn', isGeneral: true,
      employmentType: null, location: null, publishedAt: day(-380), deadline: day(120),
      summary: 'Prófunartexti: almenn umsókn fyrir þau sem vilja starfa hjá sveitarfélaginu.',
      description: [
        { t: 'p', x: 'Prófunartexti. Hér er lengri lýsing á almennri umsókn sem sýnir hvernig „Nánar um starf“ opnast.' },
        { t: 'h', x: 'Hæfniskröfur' },
        { t: 'ul', items: ['Fyrsta atriði prófunarlista', 'Annað atriði prófunarlista'] }
      ],
      detailUrl: null, applyUrl: 'https://example.org/prof/almenn'
    },
    {
      id: 'prof-menntasvid-1', title: 'Prófun – Starfsmaður grunnskóla', department: 'Menntasvið',
      isGeneral: false, employmentType: 'Fullt starf', location: 'Grunnskólinn Prófun',
      publishedAt: day(-13), deadline: day(0),
      summary: 'Prófunartexti: grunnskóli leitar að starfsmanni. Frestur rennur út í dag og starfið á því enn að sjást.',
      description: null, detailUrl: 'https://example.org/prof/grunnskoli', applyUrl: 'https://example.org/prof/grunnskoli/saekja'
    },
    {
      id: 'prof-menntasvid-2', title: 'Prófun – Leikskólakennari', department: 'Menntasvið',
      isGeneral: false, employmentType: 'Fullt starf', location: 'Leikskólinn Prófun',
      publishedAt: day(-3), deadline: day(20),
      summary: 'Prófunartexti: leikskóli leitar að leikskólakennara.',
      description: [
        { t: 'p', x: 'Prófunartexti: Leikskólinn leitar að kennara til starfa.' },
        { t: 'h', x: 'Helstu verkefni' },
        { t: 'ul', items: ['Kennsla og umönnun barna', 'Samstarf við foreldra'] },
        { t: 'ol', items: ['Skref eitt', 'Skref tvö'] }
      ],
      detailUrl: 'https://example.org/prof/leikskoli', applyUrl: 'https://example.org/prof/leikskoli/saekja'
    },
    {
      id: 'prof-menntasvid-utrunnid', title: 'Prófun – Útrunnið starf', department: 'Menntasvið',
      isGeneral: false, employmentType: null, location: null,
      publishedAt: day(-30), deadline: day(-1),
      summary: 'Prófunartexti: frestur rann út í gær, starfið á ekki að sjást.',
      description: null, detailUrl: null, applyUrl: 'https://example.org/prof/utrunnid'
    },
    {
      id: 'prof-umhverfi-1', title: 'Prófun – Verkefnastjóri viðhalds', department: 'Umhverfis- og framkvæmdasvið',
      isGeneral: false, employmentType: 'Fullt starf', location: null,
      publishedAt: day(-24), deadline: day(0),
      summary: null,
      description: [{ t: 'p', x: 'Prófunartexti sem er notaður sem útdráttur þegar enginn samantekt fylgir starfinu.' }],
      detailUrl: null, applyUrl: 'https://example.org/prof/verkefnastjori'
    },
    {
      id: 'prof-umhverfi-2',
      title: 'Prófun – Mjög langur starfstitill sem á að vefjast um nokkrar línur á þröngum skjá og sýna að uppsetningin brotnar ekki þótt orðin séu mörg og óþjál: Sérfræðingur í eignaumsýslu og framkvæmdaeftirliti',
      department: 'Umhverfis- og framkvæmdasvið', isGeneral: false, employmentType: 'Hlutastarf',
      location: 'Þjónustumiðstöð, Fjölnota-ofurlöng-staðsetning-án-bila-Prófunarvegur-1234567890',
      publishedAt: day(-2), deadline: day(30),
      summary: 'Prófunartexti. ' + new Array(12).join('Löng samantekt sem á að klippast eftir þrjár línur í listanum. '),
      description: null, detailUrl: 'https://example.org/prof/langt', applyUrl: 'https://example.org/prof/langt/saekja'
    },
    {
      id: 'prof-velferd-1', title: 'Prófun – Starfsmaður í stuðning', department: 'Velferðarsvið',
      isGeneral: false, employmentType: 'Hlutastarf', location: 'Búsetukjarni',
      publishedAt: day(-6), deadline: day(7),
      summary: 'Prófunartexti: aðeins ytri tengill á nánari upplýsingar, engin umsóknarslóð.',
      description: null, detailUrl: 'https://example.org/prof/studningur', applyUrl: null
    },
    {
      id: 'prof-velferd-2',
      title: 'Prófun <img src=x onerror=alert(1)> & <script>alert(2)</script>',
      department: 'Velferðarsvið', isGeneral: false, employmentType: null, location: null,
      publishedAt: day(-1), deadline: null,
      summary: 'Prófun á öryggi: <b>feitletrun</b> og <a href="javascript:alert(3)">tengill</a> eiga að birtast sem texti.',
      description: [{ t: 'p', x: '<img src=x onerror=alert(4)> á að birtast sem texti.' }],
      detailUrl: null, applyUrl: 'https://example.org/prof/oryggi'
    },
    {
      id: 'prof-ospurt', title: 'Prófun – Starf án sviðs', department: null,
      isGeneral: false, employmentType: null, location: null,
      publishedAt: day(-1), deadline: day(14),
      summary: 'Prófunartexti: starf sem hefur ekkert svið skráð.',
      description: null, detailUrl: null, applyUrl: 'https://example.org/prof/ospurt'
    }
  ];
}

/* Skjal eins og samstilling skrifar það (útrunnin störf eru höfð með til að prófa vafrann) */
function sampleDocument(nowMs) {
  var now = nowMs === undefined ? Date.now() : nowMs;
  var jobs = sampleJobs(now);
  var fetched = new Date(now).toISOString().replace(/\.\d+Z$/, 'Z');
  return N.buildDocument(jobs, { source: 'opusfutura', fetchedAt: fetched });
}

module.exports = { sampleJobs: sampleJobs, sampleDocument: sampleDocument, addDays: addDays };
