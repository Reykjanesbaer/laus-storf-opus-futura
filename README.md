# laus-storf-opus-futura

Laus störf hjá Reykjanesbæ — sjálfstæð, innfellanleg samantekt á auglýstum störfum.
Störfin koma úr Opus Futura, en útlitið, leitin, síurnar og framsetningin eru okkar eigin.
Engin þjónusta, enginn gagnagrunnur og enginn netþjónn: bara statískar skrár á GitHub Pages
og ein GitHub Actions-keyrsla sem sækir störfin á 30 mínútna fresti.

**Vefurinn:** <https://reykjanesbaer.github.io/laus-storf-opus-futura/>
**Forskoðun og kóðasmiður:** <https://reykjanesbaer.github.io/laus-storf-opus-futura/ritstjorn/>
**Innfellingarskrifta:** <https://reykjanesbaer.github.io/laus-storf-opus-futura/embed.js>

> **Umsóknir fara ekki í gegnum þessa síðu.** Hnappurinn „Sækja um“ vísar á opinbera umsóknarferlið
> í Opus Futura, með slóðinni sem kemur frá Opus Futura sjálfu. Vefurinn tekur ekki við umsóknum,
> safnar engum upplýsingum um umsækjendur og geymir engan gagnagrunn.

---

## Staða gagnatengingar við Opus Futura

Við sannprófun 27. október 2026 svaraði opinbera JSON-slóðin:

```json
{ "workplace": "Reykjanesbær", "jobs": [] }
```

`jobsPath` í [`scripts/opus-mapping.json`](scripts/opus-mapping.json) hefur verið staðfest sem `jobs`.
**Rétt byggður tómur listi** er gild staða: þá sýnir vefurinn „Engin laus störf eru auglýst sem stendur.“
Þetta er ólíkt 404, ógildu JSON eða bilun á þjónustunni, sem eiga áfram að vera villur.

**Ólokið:** Opus Futura skilaði engri virkri auglýsingu við sannprófun. Ekki var hægt að sannreyna
heiti og gögn reita inni í staki úr `jobs`. Þess vegna eru `fields.*` áfram óútfylltir.
Ef `jobs` verður ekki tómt áður en þau hafa verið staðfest, stöðvast samstilling með
`MAPPING_UNCONFIGURED` frekar en að birta uppdiktaðar auglýsingar eða falsa tómstöðu.

Til að klára vörpun þegar störf birtast:

1. Farðu í **Actions → Skoða JSON frá Opus Futura → Run workflow** eða keyrðu `npm run inspect`.
2. Staðfestu raunverulega reiti starfsauglýsinga og fylltu út `scripts/opus-mapping.json`, sérstaklega
   `title`, `id`, `detailUrl` og `applyUrl` ef þeir eru tiltækir.
3. Keyrðu `npm run sync`, staðfestu að umsóknarslóðir virki, og prófaðu áður en ný vörpun er birt.

**Óstaðfest hönnunaratriði** (vinnuumhverfið hafði heldur ekki aðgang að `reykjanesbaer.is`; hönnunin byggist á HTML-uppbyggingu síðunnar
sem fékkst afhent, ekki á stílblöðunum): litir, bil og leturstærðir eru nálgun. Þeir eru allir CSS-breytur efst í
[`storf/storf.css`](storf/storf.css), svo hægt er að stilla þá nákvæmlega eftir stílblaði vefsins (aðallitur: `accent`).

---

## Hvað verkefnið gerir

- Sýnir núverandi störf úr Opus Futura í okkar eigin viðmóti, flokkuð eftir sviði (flokkar eru búnir til úr gögnunum, ekki föstum lista;
  „Almenn umsókn“ kemur fyrst).
- Leit (**Leitarorð**), flokkasía (**Eftir tegund**), tímabilssía (**Veldu tímabil**), röðun, **Hreinsa síur** og fjöldi („5 laus störf“, „1 laust starf“) —
  allt jafnóðum, án þess að hlaða síðuna aftur.
- Sýnir umsóknarfrest („Umsóknarfrestur til 26. október 2026“) og fellir útrunnin störf burt. Frestur án tíma gildir út allan daginn að íslenskum tíma
  (`Atlantic/Reykjavik`).
- **Nánar um starf**: lýsing í okkar viðmóti ef hún er í gögnunum, annars ytri slóð á auglýsinguna.
- **Sækja um**: opinbera slóðin frá Opus Futura, óbreytt.
- Sjálfstæður kóðasmiður fyrir ritstjóra með lifandi forskoðun.
- Innfelling með venjulegum iframe (virkar í Payload án JavaScript) eða með skriftu sem stillir hæð sjálfkrafa.

## Gagnauppspretta: Opus Futura

JSON-ið er sótt af
`https://workplace.opusfutura.com/embed/jobs/27xzaq995vs8e5631z5babkh.json`
(slóðin er skráð í [`scripts/sync-jobs.js`](scripts/sync-jobs.js); hægt er að yfirskrifa hana með GitHub-breytunni `OPUS_FEED_URL`).
Iframe Opus Futura er **ekki** notað og engar skriftur eða rekjarar frá þjónustuaðilanum eru hlaðnir. Opus Futura er eingöngu gagnaveita og vettvangur umsókna.

Gesturinn talar aldrei við Opus Futura: störfin eru sótt á GitHub-þjóni við birtingu og vistuð í `data/jobs.json`, sem er hluti af birtum vef.
Þess vegna þarf hvorki CORS-haus frá þjónustuaðilanum né skilja gestir eftir sig slóð á þriðja aðila.

## Sjálfvirk samstilling

Vinnuflæðið [`deploy.yml`](.github/workflows/deploy.yml) er **ein** keyrsla sem gerir allt:
próf → vefur settur saman → störf sótt og staðfest → birting á GitHub Pages.
Það keyrir:

| Hvenær | Hvers vegna |
| --- | --- |
| á 30 mínútna fresti (`7,37 * * * *`) | ný og lokuð störf birtast sjálfkrafa |
| við hverja breytingu á `main` | kóðabreytingar fara í loftið |
| handvirkt (**Run workflow**) | strax, t.d. eftir að starf er auglýst |

Það er viljandi **ekki** tvö vinnuflæði (eitt sem vistar gögn og annað sem birtir): commit frá `GITHUB_TOKEN` kveikir ekki á öðrum vinnuflæðum,
svo slíkt fyrirkomulag bilar hljóðlega. Gögnin eru ekki vistuð í repóinu; þau fara beint í birtingarmöppuna.

**Staðfesting.** [`scripts/sync-jobs.js`](scripts/sync-jobs.js) sækir JSON-ið (https eingöngu, tímamörk, endurtekningar, stærðarmörk), þýðir það með
vörpuninni og hreinsar hvert starf með [`storf/normalize.js`](storf/normalize.js): heiti og auðkenni verða að vera til,
vefslóðir verða að vera https án notandanafns, tvítekin auðkenni eru felld burt, dagsetningar eru lesnar (ógild snið eru hafnað, ekki túlkuð),
HTML í lýsingum er brotið niður í öruggar blokkir, útrunnin störf eru felld burt. Skjalið er aðeins skrifað ef allt stenst, og skrifað í tímabundna skrá
sem er svo endurnefnd — hálfskrifað skjal verður aldrei birt.

**Þegar eitthvað bilar — hvað verður um vefinn:**

| Staða | Hvað gerist |
| --- | --- |
| Opus Futura svarar ekki / skilar skemmdu JSON / sniðið hefur breyst, **tímasett keyrsla** | Keyrslan endar með villu og **birtir ekkert**. Vefurinn sem er í birtingu núna helst óbreyttur. |
| Sama, en keyrsla vegna kóðabreytingar eða handvirk | Síðustu birtu störf eru sótt af vefnum og birt aftur með kóðabreytingunni. `fetchedAt` er óbreytt, svo vefurinn sýnir „Upplýsingarnar voru síðast uppfærðar … og kunna að vera úreltar“ eftir 12 klst. |
| Sama, og síðustu gögn nást ekki (netvilla) | Keyrslan endar með villu og **birtir ekkert** — störfin hverfa ekki. |
| Sama, og engin fyrri gögn eru til (fyrsta birting, 404) | Vefurinn er birtur án gagna og sýnir villuskilaboð með „Reyna aftur“. |
| Rétt svar án starfa | Skjalið er gilt og tómt; vefurinn sýnir „Engin laus störf eru auglýst sem stendur.“ |
| Meira en helmingur færslna stenst ekki staðfestingu, eða stöðureitur vantar | Telst villa (sniðið hefur líklega breyst), **ekki** „engin störf“. |

Tómur listi vegna villu er því aldrei birtur sem „engin laus störf“. Villuboð í skrám innihalda aðeins kóða og tölur, aldrei efni úr svarinu.

> **Athugið: GitHub slekkur á tímasettum vinnuflæðum** í opinberum repóum eftir 60 daga án virkni. Þá hætta störfin að uppfærast og vefurinn sýnir
> „kunna að vera úreltar“. Lagfæring: opnaðu **Actions**, veldu „Birta á GitHub Pages“ og smelltu á **Enable workflow**. Hver breyting á `main` núllstillir niðurtalninguna.

### Vörpun á gagnasniði Opus Futura

[`scripts/opus-mapping.json`](scripts/opus-mapping.json) segir hvar hver reitur er. Slóðir eru með punktum (`department.name`, `links.0.href`);
listi af slóðum þýðir „fyrsta ekki-tóma gildi“; `null` þýðir „reiturinn er ekki til“.

| Reitur | Lýsing | Skylda |
| --- | --- | --- |
| `jobsPath` | Hvar listinn af störfum er í JSON-inu (`""` ef JSON-ið sjálft er listinn) | já |
| `fields.title` | Heiti starfs | já |
| `fields.id` | Auðkenni (ef það vantar er slóð starfsins notuð; aldrei búið til úr heiti) | já, nema slóð sé skráð |
| `fields.department` | Svið/flokkur (texti eða hlutur með `name`/`title`) | nei |
| `fields.employmentType`, `fields.location` | Tegund starfs, staðsetning | nei |
| `fields.publishedAt`, `fields.deadline` | Dagsetningar: `YYYY-MM-DD`, ISO-tími, eða `D.M.YYYY` | nei |
| `fields.summary` | Stutt lýsing (ef hún vantar er útdráttur úr lýsingu notaður) | nei |
| `fields.description` + `descriptionFormat` | Löng lýsing, `"html"` eða `"text"` | nei |
| `fields.detailUrl`, `fields.applyUrl` | Slóð á auglýsingu og umsókn — **aðeins það sem kemur frá Opus Futura** | nei |
| `fields.isGeneral`, `generalApplication.path` | Boolean sem merkir almenna umsókn. Annars þekkist hún á sviðsheitinu „Almenn umsókn“ | nei |
| `statusFilter` | `{ "path": …, "activeValues": [...] }` ef JSON-ið inniheldur líka óvirk störf | nei |
| `allowedUrlHosts` | Leyfð lén fyrir vefslóðir, t.d. `["opusfutura.com"]` (tómt = allar https-slóðir) | nei |

Reglur sem vörpunin og kóðinn fylgja:

- **Engar umsóknarslóðir eru búnar til.** Sé engin `applyUrl` í gögnunum birtist enginn „Sækja um“-hnappur.
- Ef `statusFilter` er notað og stöðureitur vantar á færslu telst það frávik frá sniðinu, ekki „óvirkt starf“.
- Mælt er með að setja `allowedUrlHosts` þegar raunverulegu lénin eru staðfest.
- [`tests/fixtures/generic-mapping.json`](tests/fixtures/generic-mapping.json) er **uppspunnið** dæmi um útfyllta vörpun (ekki snið Opus Futura) sem prófin nota.

## Uppbygging

```
index.html              Vefurinn sjálfur (það sem innfellingar vísa á)
embed.js                Innfellingarskrifta með sjálfvirkri hæð (aukaleið)
ritstjorn/
  index.html            Forskoðun og kóðasmiður fyrir ritstjóra
  ritstjorn.css|js
storf/
  storf.css             Útlit (CSS-breytur efst)
  storf.js              Teikning og atburðir (aðeins DOM)
  config.js             Færibreytur, gildisathugun, litir og birtuskil
  dates.js              Dagsetningar, íslenskt tímabelti, „útrunnið“
  normalize.js          Hreinsun og staðfesting á störfum (vafri og samstilling)
  filters.js            Leit, síur, röðun, flokkun, textar
  embed-code.js         Smíði innfellingarkóða (kóðasmiður og próf)
  fonts/                Plus Jakarta Sans (sjálfhýst, SIL OFL)
scripts/
  sync-jobs.js          Sækir og staðfestir störf → data/jobs.json
  opus-mapping.json     Vörpun frá gagnasniði Opus Futura (ÓÚTFYLLT)
  lib/provider.js       Vörpunarvél og skoðun á byggingu JSON
  reuse-live-data.js    Notar síðustu birtu gögn ef samstilling mistekst
  build-site.js         Setur saman birtingarmöppuna (_site/)
  dev-server.js         Staðbundinn þjónn (með --fixture: uppspunnin prófunargögn)
data/                   jobs.json er búið til við birtingu (ekki í repóinu)
tests/                  Einingapróf (node:test) og vafrapróf (tests/e2e)
.github/workflows/      deploy.yml · test.yml · inspect-feed.yml
.nojekyll
```

Engir pakkar og ekkert build-skref. Vafrakóðinn er venjulegt HTML, CSS og JavaScript.

## Birting á GitHub Pages

Einu sinni, í repóinu `Reykjanesbaer/laus-storf-opus-futura`:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.** (Ekki „Deploy from a branch“.)
2. **Settings → Actions → General → Workflow permissions**: „Read repository contents“ nægir; vinnuflæðið biður sjálft um `pages: write` og `id-token: write`.
3. Staðfestu vörpun reita áður en raunverulegar auglýsingar birtast (sjá [Staða gagnatengingar](#staða-gagnatengingar-við-opus-futura)).
4. Settu kóðann í `main` (eða keyrðu **Actions → Birta á GitHub Pages → Run workflow**). Slóðin birtist í yfirliti keyrslunnar.

Valfrjálsar GitHub-breytur (**Settings → Secrets and variables → Actions → Variables**): `OPUS_FEED_URL` (önnur slóð á JSON) og
`PAGES_BASE_URL` (ef vefurinn er á eigin léni; notað til að sækja síðustu gögn ef samstilling mistekst).

Allar slóðir í kóðanum eru afstæðar og virka undir `/laus-storf-opus-futura/`; kóðasmiðurinn finnur grunnslóðina úr slóð síðunnar
(í staðbundinni prófun notar hann framleiðsluslóðina í kóðanum sem hann sýnir).

## Innfelling

### 1. iframe — mælt með

Virkar alls staðar þar sem HTML er leyft og krefst **engrar** JavaScript. Límdu í HTML-/Code-blokk í Payload:

```html
<iframe
  src="https://reykjanesbaer.github.io/laus-storf-opus-futura/?theme=light&frame=0&title=0"
  title="Laus störf hjá Reykjanesbæ"
  loading="lazy"
  style="width:100%;height:1000px;border:0;display:block;">
</iframe>
```

Kóðasmiðurinn býr kóðann til; `src` inniheldur aðeins þær stillingar sem víkja frá sjálfgefnu.

**Um fasta hæð.** iframe án skriftu getur ekki stillt hæðina sjálfur — það þarf samvinnu frá síðunni sem hann er á. Hæðin er því föst (sjálfgefið 1000 px,
stillanleg í kóðasmiðnum). Bætist við fleiri störf en passa birtist **skrunstika inni í rammanum** og ekkert klippist af. Veldu hæð sem rúmar flest störf,
og notaðu hnappinn „Nota hæð forskoðunar“ í kóðasmiðnum til að sjá hvað núverandi störf þurfa. Viljirðu að hæðin fylgi innihaldinu nákvæmlega skaltu nota skriftuna.

### 2. Skrifta — sjálfvirk hæð (aukaleið)

```html
<script
  src="https://reykjanesbaer.github.io/laus-storf-opus-futura/embed.js"
  data-theme="light"
  data-frame="0"
  data-title="0">
</script>
```

Skriftan býr til iframe þar sem hún stendur og stillir hæðina eftir innihaldi (vefurinn sendir hæðina með `postMessage` þegar `ResizeObserver` greinir breytingu).
Margar innfellingar á sömu síðu trufla ekki hver aðra.

**Öryggi skilaboða.** Skilaboð eru aðeins tekin gild ef: sendandinn er glugginn í iframe-inum sem skriftan bjó til, uppruninn er sá sami og skriftan kom frá,
gerðin er `laus-storf:height`, auðkenni innfellingarinnar stemmir og hæðin er tala á bilinu 50–20000. Ekkert annað úr skilaboðunum fer í CSS eða HTML.

> **Athugið:** margar Payload-uppsetningar fjarlægja `<script>` úr ritlinum. Ef ekkert birtist skaltu nota iframe-leiðina.

Allar `data-*` eigindir fara áfram sem færibreytur (`data-theme` → `?theme=`), nema þær sem stýra aðeins iframe-inum:

| Eigind | Gildi | Sjálfgefið |
| --- | --- | --- |
| `data-width` | `1`–`100%` eða `200`–`2000px` | `100%` |
| `data-max-width` | `1`–`100%`, `200`–`2000px` eða `none` | `none` |
| `data-align` | `left`, `center`, `right` | `left` |
| `data-height` | byrjunarhæð í px (300–5000) þar til vefurinn lætur vita | `600` |
| `data-iframe-title` | titill iframe fyrir skjálesara | „Laus störf hjá Reykjanesbæ“ |

Tala án einingar er px; gildi utan marka falla á sjálfgefið.

### 3. Bein slóð

`https://reykjanesbaer.github.io/laus-storf-opus-futura/?view=cards&accent=2760AB` — sömu færibreytur gilda þegar vefurinn er opnaður beint.

## Stillingar

Allar stillingar eru færibreytur í slóðinni. Ógild gildi (utan bils, óþekkt orð) falla á sjálfgefið gildi — aldrei villa.

| Færibreyta | Gildi | Sjálfgefið | Lýsing |
| --- | --- | --- | --- |
| `theme` | `auto`, `light`, `dark` | `auto` | Þema. `auto` fylgir stillingu notandans í stýrikerfinu |
| `accent` | hex án `#` | `1D4D91` | Áherslulitur (hnappar, tenglar, fyrirsagnir). Texti er sjálfkrafa lagaður svo hann nái AA |
| `bg` | hex án `#` | hvítur | Bakgrunnur í ljósu þema |
| `bgdark` | hex án `#` | `1B2024` | Bakgrunnur í dökku þema |
| `radius` | `0`–`24` | `6` | Hornarúnnun í px |
| `frame` | `0`, `1` | `1` | Rammi og bakgrunnur (`0` = gegnsætt, fellur inn í síðuna) |
| `title` | `0`, `1` | `1` | Sýna titilinn „Laus störf“ (er áfram fyrir skjálesara ef `0`) |
| `intro` | `0`, `1` | `1` | Inngangstexti |
| `search` | `0`, `1` | `1` | Leit („Leitarorð“) |
| `filters` | `0`, `1` | `1` | Síur: „Eftir tegund“, „Veldu tímabil“, „Röðun“ |
| `groups` | `0`, `1` | `1` | Fyrirsagnir sviða |
| `dates` | `0`, `1` | `1` | Auglýsingardagur |
| `desc` | `0`, `1` | `1` | Samantekt og „Nánar um starf“-lýsing |
| `deadline` | `0`, `1` | `1` | Umsóknarfrestur |
| `sort` | `newest`, `deadline`, `title` | `newest` | Upphafsröðun. Ef gögnin hafa ekki dagsetningarnar er næsta nothæfa röðun notuð |
| `dept` | heiti sviðs, t.d. `Menntasvið` | allt | Sýnir aðeins það svið (felur sviðasíuna). Heitið verður að vera eins og í gögnunum |
| `spacing` | `compact`, `normal` | `compact` | Bil milli starfa |
| `view` | `list`, `cards` | `list` | Listi (líkist vef bæjarins) eða spjöld |
| `width` | `1`–`100%` eða `200`–`2000px` | `100%` | Breidd — aðeins þegar vefurinn er opnaður beint (í iframe ræður iframe-inn) |
| `maxw` | eins og `width`, eða `none` | `none` | Hámarksbreidd — aðeins beint |
| `align` | `left`, `center`, `right` | `left` | Staðsetning — aðeins beint |

Litir taka sex stafa hex með eða án `#` (`%23` í slóð). Dæmi:

```
?theme=dark
?frame=0&title=0&intro=0
?dept=Velfer%C3%B0arsvi%C3%B0&view=cards
?accent=2760AB&bg=F7F9FB&radius=0
?search=0&filters=0&groups=0&dates=0
```

## Kóðasmiður

Opnaðu [`/ritstjorn/`](https://reykjanesbaer.github.io/laus-storf-opus-futura/ritstjorn/).

1. **Forskoðunin er vefurinn sjálfur** í iframe — ekki eftirlíking. Hún sýnir raunveruleg störf og breytist um leið og þú breytir stillingu.
   Skiptu milli „Eins og iframe-kóðinn“ (föst hæð, með innri skrunstiku) og „Hæð eftir innihaldi“.
2. Stilltu **Útlit** (þema, litir, hornarúnnun, rammi, titill), **Efni** (hvað er sýnt, röðun, svið) og **Uppsetning** (framsetning, bil, breidd, hámarksbreidd, staðsetning, hæð).
   Ógilt inntak er merkt með texta og ekki notað.
3. Veldu flipa: **iframe (mælt með)**, **Skrifta** eða **Slóð**. Kóðinn birtist í heild.
4. **Afrita kóða**, og límdu í Payload. **Endurstilla sjálfgefin gildi** núllstillir allt.
5. Stillingarnar eru líka í slóð ritilsins svo hægt sé að deila þeim.

Varað er við áherslulit sem nær ekki lesanlegum texta á hnöppum (birtuskil undir 4,5:1).

## Aðgengi

Stefnt er að WCAG 2.2 AA:

- `lang="is"`, merkingarbært HTML, rétt fyrirsagnaröð (`h1` → sviðaheiti `h2` → störf `h3`; án sviða verða störfin `h2`). Titillinn er áfram `h1` fyrir skjálesara þótt hann sé falinn.
- Allar stýringar hafa sýnilegt `<label>`; ytri tenglar eru merktir með tákni og „(opnast í nýjum glugga)“ fyrir skjálesara; tenglatexti inniheldur heiti starfsins.
- Fjöldi og „Engin störf fundust …“ eru tilkynnt með `role="status"` (`aria-live="polite"`); villur með `role="alert"`; hleðsla með `aria-busy`.
- Allt nást með lyklaborði, sýnilegur fókushringur (3 px), engin lyklagildra.
- Birtuskil eru reiknuð út frá bakgrunni: hvaða bakgrunnslit og áherslulit sem ritstjóri velur gefur texta ≥ 4,5:1 og jaðra á stjórntækjum ≥ 3:1 (sannreynt í prófum á 288 samsetningum: 12 bakgrunnar × 12 áherslulitir × tvö þemu).
- Snertifletir ≥ 24 px; engin lárétt skrun frá 320 px; virðir `prefers-reduced-motion` og `prefers-color-scheme`.

Hluti af þessu er sannreyndur sjálfvirkt (`tests/e2e`); handvirk skjálesaraprófun hefur ekki farið fram.

## Öryggi og persónuvernd

- **Allt frá Opus Futura er ótraust.** Texti fer í DOM með `textContent`/`createElement`, aldrei `innerHTML`. HTML í lýsingum er brotið niður í fáar blokkir
  (málsgreinar, millifyrirsagnir, listar) — engin tög, engar eigindir, engir tenglar. Prófað með skaðlegum texta (`<img onerror>`, `<script>`, `javascript:`).
- Vefslóðir verða að vera **https** án notandanafns/lykilorðs; annað er fellt burt bæði við samstillingu og aftur í vafranum. Ytri tenglar nota `rel="noopener noreferrer"`.
- Strangt CSP (`default-src 'none'; script-src 'self'; …`, ekkert `unsafe-inline`); engar beiðnir fara út fyrir okkar eigin uppruna (prófað).
- Aðeins það sem þarf til að sýna auglýsingu er birt (heiti, svið, dagsetningar, lýsing, slóðir). Annað úr svari Opus Futura er hent og aldrei skrifað í logga.
- Engin rekjun, engar vafrakökur, engin vistun. Vefurinn safnar ekki upplýsingum um umsækjendur og hleður hvorki iframe né skriftum frá Opus Futura. Letrið er sjálfhýst (engin beiðni til Google).
- Gesturinn fer til Opus Futura **aðeins** þegar hann smellir sjálfur á „Sækja um“ eða „Nánar um starf“ (ytri slóð).
- `noindex` er á vefnum og kóðasmiðnum svo afritið keppi ekki við vef bæjarins í leitarvélum.

## Bilanaleit

| Einkenni | Líkleg orsök og lagfæring |
| --- | --- |
| Vefurinn segir „Ekki tókst að sækja laus störf“ | `data/jobs.json` vantar eða er skemmt. Skoðaðu síðustu keyrslu í **Actions**. Óútfyllt vörpun gefur kóðann `MAPPING_UNCONFIGURED`. |
| „Engin laus störf eru auglýst sem stendur“ en störf eru auglýst | Samstillingin skilaði tómum lista úr réttu svari. Keyrðu `npm run inspect` og berðu saman við vörpunina (`jobsPath`, `statusFilter`). |
| „… kunna að vera úreltar“ | Samstilling hefur ekki tekist í > 12 klst. Skoðaðu Actions; mögulega hefur GitHub slökkt á tímasettri keyrslu (sjá athugasemd hér að ofan). |
| Tímasett keyrsla endar með villu | Opus Futura óaðgengilegt eða sniðið breytt. Vefurinn helst óbreyttur. Villukóði stendur í skránni (`HTTP_…`, `JSON`, `SHAPE`, `QUALITY`, `TIMEOUT`). |
| `QUALITY` | Of margar færslur stóðust ekki staðfestingu — sniðið hefur líklega breyst. Endurskoðaðu `opus-mapping.json`. |
| Starf vantar „Sækja um“ | Engin gild https-umsóknarslóð var í gögnunum fyrir það starf (eða lénið er ekki í `allowedUrlHosts`). |
| iframe sýnir skrunstiku | Hæðin er of lág fyrir störfin. Hækkaðu hana í kóðasmiðnum, eða notaðu skriftuna. |
| Skriftan sýnir ekkert í Payload | Ritillinn fjarlægir `<script>`. Notaðu iframe-kóðann. |
| Litir „skjóta í gegn“ með `frame=0` í dökku þema | Gegnsær vefur tekur lit síðunnar sem hann er á; veldu `theme=light` eða settu `bgdark` í lit síðunnar. |
| Kóðasmiðurinn sýnir `localhost`-slóð | Í staðbundinni prófun notar hann framleiðsluslóðina viljandi; á vefnum notar hann slóð síðunnar. |

## Prófun staðbundið

Þarf Node 20 eða nýrri. Engar dependencies fyrir einingapróf.

```bash
npm test                 # einingapróf (node:test): dagsetningar, hreinsun, vörpun, samstilling og bilanir,
                         # síur, stillingar, birtuskil, innfellingarkóði, embed.js og skilaboð milli margra iframe
npm run dev              # http://127.0.0.1:8080/ með UPPSPUNNUM prófunargögnum (aldrei í birtingu)
                         # og …/laus-storf-opus-futura/ til að prófa undirslóð
npm run inspect          # lýsir byggingu JSON frá Opus Futura (þarf netaðgang)
npm run sync             # sækir, staðfestir og skrifar data/jobs.json
npm run build            # setur saman _site/ eins og birtingin gerir

# Vafrapróf (Chromium): sími og tölva, aðgengi, öryggi, færibreytur, ástand, innfellingar, kóðasmiður
npm i --no-save playwright && npx playwright install chromium
npm run test:e2e         # skjámyndir fara í _e2e/
```

Prófin nota **uppspunnin** störf („Prófun – …“) og uppspunnið gagnasnið; hvorugt kemst í birtingu (`build-site.js` afritar aðeins það sem vefurinn þarf, og
prófað er að `tests/`, `scripts/` og prófunargögn séu ekki með).

## Útlit

Uppbygging og orðalag eru sótt í núverandi síðu Reykjanesbæjar: flokkar með fyrirsögn (Almenn umsókn fyrst, svo svið í stafrófsröð), dagsetning ofan við heiti,
samantekt og umsóknarfrestur, og síurnar **Eftir tegund**, **Veldu tímabil** og leit. Frávik frá núverandi síðu, að beiðni verkbeiðnar:
leitarreiturinn heitir „Leitarorð“ með texta „Leita að störfum...“; umsóknarfrestur er „Umsóknarfrestur til 26. október 2026“ (ekki „… er til 26.10.26“);
og hnappurinn heitir „Sækja um“. Letrið er Plus Jakarta Sans (sjálfhýst) því Circular XX á reykjanesbaer.is er leyfisskylt.
„Veldu tímabil“ er tvö dagsetningarsvið (frá/til) á auglýsingardegi — eða á umsóknarfresti ef gögnin hafa enga auglýsingardaga; ef hvorug dagsetning er til er sían falin.

## Umsjón

Reykjanesbær — vefstjórn / stafrænar lausnir. Systurverkefni:
[leikskolagjald-reiknivel](https://github.com/Reykjanesbaer/leikskolagjald-reiknivel) (sama uppbygging og kóðasmiður).
Letrið Plus Jakarta Sans er undir SIL Open Font License (sjá [`storf/fonts/OFL.txt`](storf/fonts/OFL.txt)).
