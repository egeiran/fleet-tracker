# Handoff: Vakt — Flåtekart (fleet intelligence map)

## Oversikt
Ett fullskjerms driftsbilde for sporing av lastbærere/enheter i Nord-Europa. Operatøren skal på ett blikk se hvor flåten er, hva som er i bevegelse, hva som står stille og hva som har avvik — og kunne bore ned i en enkelt enhet uten å miste kartkonteksten.

Kjernen består av fire deler:
1. **Kart** med enhetsmarkører, ruter/haler og skjermbasert gruppering (clustering).
2. **Filterskinne** til venstre (søk, status, transportform, batteri).
3. **Avspillingslinje** nederst — spoler flåtens siste 24 timer.
4. **Presisjonssikte** — en egendefinert musepeker over kartet som erstatter systempekeren, med magnetisk lås på enheter og grupper.

## Om designfilene
Filene i denne pakken er **designreferanser laget i HTML** — prototyper som viser tilsiktet utseende og oppførsel, ikke produksjonskode som skal kopieres rett inn. Oppgaven er å **gjenskape designet i målkodebasens eksisterende miljø** (React, Vue, SwiftUI, native osv.) med dens etablerte mønstre og biblioteker. Finnes det ikke noe miljø ennå, velg det rammeverket som passer prosjektet best og implementer designet der.

Kartlaget er bygget på **MapLibre GL JS 4.7.1** med rasterfliser fra Esri (`World_Dark_Gray_Base` + `World_Dark_Gray_Reference`). Selve kartteknologien kan byttes (Mapbox GL, MapLibre native, Leaflet) så lenge man har: rasterbakgrunn med justerbar metning/lysstyrke, GeoJSON-linjelag med `line-dasharray` og `line-gradient` (krever line metrics), DOM-markører, og `project()`/`unproject()` mellom skjermpiksler og koordinater.

## Fidelitet
**High-fidelity (hifi).** Farger, typografi, spacing, easing og interaksjonsdetaljer i filene er endelige og skal gjenskapes pikselnært. Alle tallverdier under er hentet direkte fra prototypen. Dataene er mock — modell og feltnavn er veiledende, ikke et API-kontrakt.

---

## Skjermer / visninger

Designet er **én skjerm** (ingen ruting) med fire flytende glasspaneler over kartet. Rot: `position: fixed; inset: 0; display: flex; flex-direction: column; background: #08090A; overflow: hidden;` — typografi `Archivo` med `Helvetica, sans-serif` som fallback.

### 1. Topplinje (header)
Absolutt posisjonert, `left/right: 0; top: 0; height: 54px; padding: 0 18px; z-index: 6`.
- Bakgrunn `rgba(14,17,15,0.52)`, `backdrop-filter: blur(28px) saturate(180%)`, nedre kantlinje `1px solid rgba(232,235,231,0.07)`, skygge `0 12px 34px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)`.
- Logolockup: 8×8 px rute i `#CBF24D` rotert 45°, ordmerke «VAKT» (14px/700, `letter-spacing: .22em`, uppercase), undertittel «flåteintelligens» (JetBrains Mono 9.5px, `.14em`, `#5C645D`).
- Navigasjon: 4 elementer, 12px, `padding: 5px 11px`, `border-radius: 3px`. Aktiv = «Kart» (`background: #CBF24D`, tekst `#0C0E0D`). De tre andre («Bookinger», «Varsler», «Analyse») er `#3E453F` og `cursor: not-allowed` med tooltip «Ikke i denne prototypen» — de er bevisst ute av scope.
- Høyre side (JetBrains Mono 10px, `.1em`, uppercase, `#5C645D`): antall enheter med lime 6px status-prikk (`box-shadow: 0 0 0 3px rgba(203,242,77,0.16)`), antall varsler i `#FF7A52`, og et merke «mockdata» (`border: 1px solid #22271F`, `border-radius: 2px`).

### 2. Filterskinne (venstre panel)
`position: absolute; left: 14px; top: 68px; bottom: 14px; width: 280px; z-index: 5`.
- Glass: `rgba(14,17,15,0.5)`, `blur(30px) saturate(180%)`, `border: 1px solid rgba(232,235,231,0.09)`, `border-radius: 12px`, skygge `0 26px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07)`.
- Kan skjules: `transform: translateX(-104%)` + `opacity: 0`, overgang `.42s cubic-bezier(.2,.8,.2,1)`. Når skjult vises en pille «Filtre + antall» på `left: 14px; top: 68px` (34px høy, mono 10px), og kartinnholdet (legende, kontroller, tidslinje) flytter seg fra `left: 308px` til `left: 14px`.
- **Søk**: 34px høyt felt, `padding: 0 11px 0 31px`, mono 11.5px, `background: rgba(0,0,0,0.34)`, `border: 1px solid rgba(232,235,231,0.11)`, `radius: 8px`. Fokus: kant `rgba(203,242,77,0.55)`, `box-shadow: 0 0 0 3px rgba(203,242,77,0.12)`. Lupeikonet er tegnet av to elementer (8px sirkel + 5px skaft rotert 45°) i `#7C847D`. Søket treffer id, sted, transportform, booking og last.
- **Statusfilter**: 2×2 rutenett i en «tray» (`padding: 3px`, `background: rgba(0,0,0,0.3)`, `radius: 9px`, `gap: 3px`). Knapper 28px, mono 10px uppercase, `radius: 6px`, med antall i høyre kant (`opacity: .55`). Valgt: `background: rgba(203,242,77,0.16)`, tekst `#CBF24D`, `inset 0 0 0 1px rgba(203,242,77,0.4)`. «varsel» bruker i stedet `rgba(255,122,82,0.16)` / `#FF9E80` / `rgba(255,122,82,0.4)`. Uvalgt tekst `#7C847D`, hover `rgba(255,255,255,0.06)`.
- **Transportform**: 1×3 tray, samme knappestil, multiselect. Hver knapp har formikonet (se «Form = transportform» under) tegnet med `border: 1.5px solid currentColor`.
- **Batteribryter**: rad 30px, tekst «Kun batteri under 50 %» (mono 10px uppercase). Bryter 30×17px, `radius: 100px`, knott 12px `#E8EBE7` som flytter `left: 2.5px → 15.5px` på `.25s cubic-bezier(.2,.8,.2,1)`; spor `rgba(255,255,255,0.14)` → `rgba(203,242,77,0.55)`.
- **Resultatlinje**: «N av M enheter» + «Nullstill» (hover `#CBF24D`), `border-top: 1px solid rgba(232,235,231,0.07)`, `background: rgba(0,0,0,0.14)`.
- **Enhetsliste**: scrollende rader, `padding: 7px 9px`, `radius: 7px`, `animation: rowIn .28s`. Formikon (statusfarge) + id (mono 10.5px `#D6DBD6`) + sted (11px `#6B736C`, ellipsis) + meta «form · batteri%» (mono 9px uppercase `#4E554F`). Hover: `background: rgba(255,255,255,0.06)` + `translateX(2px)`; valgt rad `background: #141815`. Hover på rad markerer også enheten på kartet (samme `hover`-tilstand).
- Sortering: varsel → i bevegelse → i ro, deretter id alfabetisk.
- Tom tilstand: «Ingen enheter matcher / disse filtrene», mono 10px, `#4E554F`, `line-height: 1.8`, sentrert.

### 3. Kartflate
- Bakgrunn `#0A0C0B`. Rasterlag: `raster-opacity: 0.62`, `raster-saturation: -0.6`, `raster-contrast: 0.12`, `raster-brightness-max: 0.86`. Stedsnavnlaget (referansefliser, `raster-opacity: 0.5`) er **av** som standard og slås på med ABC-knappen.
- `dragRotate: false`. Startutsnitt: `[[2.6, 51.0], [16.4, 64.2]]`.
- **Innramming (padding)** justeres etter panelene: `top: 86, bottom: 132, left: 322 (40 når skinnen er skjult), right: 372 når detaljpanelet er åpent, ellers 60`.
- **Markører** (DOM-markører, 11×11 px vert med indre wrapper for transform):
  - Form = transportform: **sjø** 11px sirkel (`radius: 50%`), **bane** 10px rute (`radius: 2px`), **vei** 9px rombe (`radius: 1px` + `rotate(45deg)`).
  - Farge = status: i bevegelse `#CBF24D`, i ro `#8A928C`, varsel `#FF7A52`. Alle har `border: 2px solid #0A0C0B` for å skille seg fra kartet.
  - Skala: normal `scale(1)`, hover/valgt `scale(1.5)` + `box-shadow: 0 0 0 5px rgba(203,242,77,.2)` (varsel: `rgba(255,122,82,.22)`), skjult/gruppert `scale(0.4)` + `opacity: 0`, bortfiltrert `opacity: 0.06`. Overgang `.45s cubic-bezier(.2,.8,.2,1)`.
  - Varselenheter pulserer: `@keyframes ping` (scale 1 → 3.4, opacity .5 → 0) `1.9s cubic-bezier(0,.2,.6,1) infinite`.
  - Etikett ved hover: mono 13px, `padding: 3px 7px`, `background: rgba(10,12,11,.94)`, `border: 1px solid #22271F`, plassert `left: 16px; top: -8px`, animeres fra `translateX(-4px)` med `.22s`.
- **Ruter (trails)**: GeoJSON-linjer, ett lag per transportform — sjø heltrukket, bane `line-dasharray: [1.6, 1.3]`, vei `[0.1, 2]` (punktert, tykkere: 1.8 / 3 valgt). Bredde `1.1` normalt, `2.2` for valgt; `line-opacity` `0.24` → `0.95` valgt. `line-cap/join: round`.
- **Hale (wake)**: kort gradientlinje bak enheter i bevegelse, `lineMetrics: true`, `line-gradient` fra `rgba(...,0)` via `0.55 → 0.35` til `1 → 0.95`. Bredde 2.6 (4 når hover/valgt), `line-blur: 0.4`. Halelengde 5 % av ruten, 11 % under avspilling. Ett lag per status (gradienter kan ikke datadrives).
- **Gruppering**: rutenett i **skjermpiksler** (standard 48px celle) — enheter i samme celle vises som én disk. Disk: 34px sirkel, `background: rgba(10,12,11,.88)`, `border: 1px solid #2E352F`, mono 11px `#E8EBE7`. Har cellen et varsel: kant `#FF7A52`, tekst `#FF9E80`, bakgrunn `rgba(38,17,12,.86)`. Grupper slås av ved søk og under avspilling (meningsløst mens flåten flytter seg), og en gruppe som inneholder den valgte enheten løses opp.
  - **Hover på gruppe**: disken `scale(1.16)`, kant til `#CBF24D` (varsel: `#FF7A52`), `box-shadow: 0 0 0 4px rgba(203,242,77,.13)`, `letter-spacing: .02em → .08em`, overgang `.25s`.
  - **Klikk på gruppe**: `fitBounds` på medlemmenes utstrekning, `maxZoom: 9.6`, `duration: 900`. Tette grupper har null utstrekning, så boksen polstres med `max(0.02°, 25 % av bredden)` / `max(0.012°, 25 % av høyden)` — uten dette feiler innrammingen stille.
- **Legende** (nederst, `bottom: 122px`, `pointer-events: none`): mono 9px uppercase `#98A099` med `text-shadow: 0 1px 4px rgba(0,0,0,0.8)`. Forklarer først farge (i bevegelse / i ro / varsel), deretter form (sjø / bane / vei), skilt av en 1×11px strek `rgba(232,235,231,0.14)`.
- **Kartkontroller** (vertikal tray, `top: 68px`, følger skinnen; `top: 112px` når skinnen er skjult): 30×30px knapper, `radius: 7px`, hover `rgba(255,255,255,0.09)` — «vis hele flåten» (10px firkant-outline), «ABC» (stedsnavn av/på, lime når på), «+», «−» (zoom, `duration: 500`).

### 4. Presisjonssikte (musepeker)
Egendefinert peker som erstatter systempekeren over kartet. Systempekeren skjules med `cursor: none !important` på kartlerret og markører når siktet er aktivt.
- **Hårlinjer**: to 190px stubber (1px) sentrert på pekeren, gradient som fader ut mot begge ender (`rgba(203,242,77,0.14)` i midtpartiet). Opasitet: `0.6` normalt, `0.9` ved lås, `0.3` mens museknappen holdes.
- **Sikte**: 46×46px med fire hjørnebraketter (10px, 1px `currentColor`), 3px senterprikk og to 7px tikk over/under. Skala lerpes: `0.86` normalt, `1.26` ved lås, `0.68` ved museknapp nede. Roterer 0° → 45° ved lås. Posisjon lerpes mot målet (faktor 0.4 fritt, 0.26 i lås) — gir en liten, bevisst etterslep-følelse.
- **Magnetisk lås**: låser på markør innenfor 110px av pekeren, eller på gruppedisk innenfor 130px. Fargen følger målet: lime, `#B9C1BA` for enheter i ro, `#FF7A52` ved varsel. Ved lås spilles én `lockSweep`-ring (`scale .55 → 1.9`, `opacity .85 → 0`, `.5s cubic-bezier(.2,.8,.2,1)`).
- **Koordinatutlesning**: to linjer mono 9px (`.13em`, uppercase) — grader med N/S og Ø/V (3 desimaler) + `z <zoom> · <antall> i sikte`. Vises **kun** ved lås eller mens museknappen holdes, oppdateres maks hver 70 ms, plasseres `+26/+16` fra siktet og vender når den nærmer seg kartkanten. Skjules helt når gruppelista vises.
- **Gruppeliste ved hover**: diskré panel, `min-width: 156px`, `padding: 9px 10px 10px`, `background: rgba(10,12,11,0.86)`, `border: 1px solid rgba(232,235,231,0.1)`, `radius: 8px`, `blur(18px) saturate(160%)`, skygge `0 16px 34px rgba(0,0,0,0.5)`, innfading `.16s`. Overskrift «N enheter i gruppen» (mono 8.5px, `.18em`, `#5C645D`), deretter opptil 6 rader: formikon i statusfarge + id (mono 9.5px `#C9CFC9`) + transportform (8.5px `#5C645D` uppercase). Er det flere: «+N flere · klikk for å zoome». Panelet ligger `+34/+22` fra siktet og vender opp/til siden når kartkanten eller tidslinjen (128px sone nederst) er i veien. Det må ligge **over** kartchromen (z-index 5) og ikke klippes.
- Siktet skjules når pekeren forlater kartet eller vinduet mister fokus.
- Tre nivåer (prop `reticle`): `presisjon` (alt), `minimal` (uten hårlinjer), `av` (vanlig systempeker).

### 5. Avspillingslinje (tidslinje)
Sentrert nederst over kartet, `width: 468px`, `padding: 12px 18px 13px`, samme glass som skinnen, `radius: 12px`, `z-index: 3`.
- Spill/pause: 32px lime sirkel, tegn `▶`/`❚❚` (mono 10px/600, `#0C0E0D`). Hover `scale(1.07)` + `box-shadow: 0 0 0 6px rgba(203,242,77,0.14)`.
- Overskrift «Avspilling · siste 24 t» (mono 9px, `.18em`, `#5C645D`); ved avspilling fades hintet «grupper av» inn i lime (`opacity .85`).
- Høyre side: klokke (mono 13px `#E8EBE7`) + relativ tid «−N t» / «nå» i lime.
- Spor: 3px `rgba(255,255,255,0.13)`, utfylt `linear-gradient(90deg, rgba(203,242,77,0.35), #CBF24D)`, 5 tikk (1×9px `rgba(255,255,255,0.16)`), knott 13px `#E8EBE7` med `box-shadow: 0 0 0 5px rgba(203,242,77,0.18), 0 2px 6px rgba(0,0,0,0.6)`. Overgang `.12s linear`. En usynlig `input[type=range]` (0–100, steg 0.5) ligger over sporet for tastatur/dra (`cursor: ew-resize`).
- Aksemerker: «−24 t / −18 / −12 / −6 / nå» (mono 8.5px, `.14em`, `#4E554F`).
- Avspilling: `t += 0.5` hver 40 ms fra 0 til 100, stopper på 100. Å dra i sporet pauser avspillingen.

### 6. Detaljpanel (enhet valgt)
`right: 14px; top: 68px; bottom: 122px; width: 340px; z-index: 4`, glass som over, `animation: panelIn .34s cubic-bezier(.2,.8,.2,1)` (fra `translateX(20px)`).
- Topp: id (mono 14px/500, `.05em`), sted (12px `#8A928C`, `text-wrap: pretty`), lukk «✕» (`#5C645D`, hover `#FF7A52`). Tre merkelapper (mono 9px uppercase, `padding: 4px 8px`, `radius: 2px`): status (statusfarge på tonet bakgrunn), transportform og booking (`#101413` / `#8A928C`).
- Målinger: 2×2 rutenett, `padding: 12px 16px`, skillelinjer `#151816`. Nøkkel mono 9px `.14em` `#4E554F`, verdi mono 14px `#E8EBE7`. Felt: Temperatur (°C), Batteri (%), Dør (`ÅPEN` ved varsel, ellers `lukket`), Last.
- Hendelseslogg: tidslinje med `border-left: 1px solid #1B201C`, `padding-left: 19px`. Hver hendelse: 8px prikk i hendelsesfarge med `border: 2px solid #0A0C0B` plassert `left: -4.5px`, klokkeslett (mono 9.5px lime), tekst (12px `#D6DBD6`), sted (mono 9px `#5C645D`).
- Bunn: «Del sporingslenke» — full bredde, `padding: 9px`, `#CBF24D` på `#0C0E0D`, `radius: 3px`, hover `translateY(-1px)`. Etter klikk: «Lenke kopiert ✓» med `rgba(203,242,77,0.14)` / `#CBF24D` i 2 s. Kopierer `https://vakt.demo/spor/<id>`.
- Å velge en enhet gjør `easeTo` til posisjonen: `zoom: max(nåværende, 6.4)`, `offset: [-160, 0]` (kompenserer for panelet), `duration: 1250`, easing `1 - (1-t)³`.

---

## Interaksjoner og oppførsel

| Handling | Resultat |
|---|---|
| Klikk markør | Velger enhet, åpner detaljpanel, kartet easer til enheten (offset for panelet) |
| Klikk listerad | Samme som markørklikk |
| Hover markør/rad | Etikett, `scale(1.5)`, rute vises, siktet låser magnetisk |
| Hover gruppedisk | Disk vokser + får ring, diskré medlemsliste ved siktet |
| Klikk gruppedisk | `fitBounds` på medlemmene (maxZoom 9.6, 900 ms) → gruppen løses opp |
| Statusfilter | Enkeltvalg (alle/bevegelse/i ro/varsel), nullstiller valgt enhet |
| Transportform | Multiselect |
| Batteribryter | Kun enheter under 50 % |
| Søk | Filtrerer på id/sted/form/booking/last; slår av gruppering |
| «Nullstill» | Tilbakestiller alle filtre og valg |
| Skjul skinne (‹) | Skinnen glir ut, «Filtre»-pille dukker opp, kartinnhold og innramming flytter seg |
| Spill av | Spoler siste 24 t, grupper av, haler blir lengre |
| Dra i sporet | Pauser avspilling, flytter flåten til det tidspunktet |
| ABC | Stedsnavnlag av/på (setter ny kartstil, lagene installeres på nytt etter `idle`) |
| Vis hele flåten | `fitBounds` til startutsnittet, fjerner valg |
| Zoom ut under 5,4 | Ruter skjules automatisk (modus «fra zoom») |

Bevegelses­prinsipp: alt panel-/markørrelatert bruker `cubic-bezier(.2,.8,.2,1)` (rask start, myk landing) på 200–450 ms. Kartbevegelser er lengre (900–1250 ms). Siktet er det eneste som ikke bruker CSS-overgang — det lerpes per animasjonsramme for å føles direkte.

## Tilstand

Komponent-tilstand:
- `status: "all" | "moving" | "idle" | "alert"`
- `modes: string[]` — «sjø» | «bane» | «vei»
- `lowBatt: boolean`
- `q: string` — søketekst
- `sel: string | null` — valgt enhets-id
- `hover: string | null` — enhets-id under peker (fra både kart og liste)
- `t: number` — 0–100, tidsposisjon (100 = nå)
- `playing: boolean`
- `labels: boolean` — stedsnavnlag
- `rail: boolean` — filterskinne synlig
- `copied: boolean` — kopi-bekreftelse (2 s)
- `zoom: number` — for zoom-avhengige ruter

Utenfor React-tilstand (bevisst, for å unngå re-render 60 ganger i sekundet): pekerens posisjon/skala/rotasjon, hvilken gruppe som er hovret, og markørenes DOM-stiler. Markører og grupper oppdateres imperativt fra én `syncMap()` som kalles på kartbevegelse (rAF-strupet), ved tilstandsendring og under avspilling.

Konfigurerbare parametre (var tweaks i prototypen — bør bli props/innstillinger):
- `reticle`: `presisjon` | `minimal` | `av`
- `wake`: hale av/på
- `clustering`: gruppering av/på
- `clusterPx`: 28–96 px cellestørrelse
- `trails`: `fra zoom` | `valgt` | `alle` | `av`
- `fleetSize`: 12–320 enheter

## Datamodell (mock)
Hver enhet: `id` («BLDR-0917»), `status`, `mode`, `path` (koordinatliste), `p` (andel av ruten fullført), `batt`, `temp`, `booking`, `cargoLabel`, `place`, `events[] { time, label, place, tone }`.

Posisjon beregnes som `posAt(path, p * (0.32 + 0.68 * t/100))` — tidsskruen skalerer altså framdriften langs ruten. I en ekte implementasjon erstattes dette av faktiske posisjonshistorikker; API-et bør kunne svare med posisjonsspor per enhet for et tidsvindu, ikke bare siste posisjon. Rutene i prototypen genereres deterministisk (seedet PRNG, seed `20260902`) mellom 18 nav i Norge/Sverige/Danmark/Tyskland/Nederland/Belgia.

## Design-tokens

**Farger**
| Rolle | Verdi |
|---|---|
| Bakgrunn (app) | `#08090A` |
| Bakgrunn (kart) | `#0A0C0B` |
| Glasspanel | `rgba(14,17,15,0.5)` – `0.56` |
| Panelkant | `rgba(232,235,231,0.09)` |
| Skillelinje | `rgba(232,235,231,0.07)` / `#151816` / `#1B201C` / `#22271F` |
| Tekst primær | `#E8EBE7` |
| Tekst sekundær | `#D6DBD6` / `#C9CFC9` |
| Tekst dempet | `#8A928C` / `#7C847D` / `#6B736C` |
| Tekst svakest | `#5C645D` / `#4E554F` / `#3E453F` |
| Aksent / i bevegelse | `#CBF24D` (hover `#E2FF8C`) |
| Varsel | `#FF7A52` (lys `#FF9E80`, `#FFB49B`) |
| Advarsel (logg) | `#F2C14E` |
| Nøytral / i ro | `#8A928C` (kart), `#B9C1BA` (sikte) |
| Mørk tekst på lime | `#0C0E0D` |

**Typografi** — `Archivo` 400/500/600/700 for grensesnittstekst; `JetBrains Mono` 400/500/600 for alle data, id-er, koordinater og etiketter (uppercase + `letter-spacing` .06–.18em). Skala: 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 13, 14 px. Mono i store bokstaver med sperret spacing er den viktigste bæreren av «hightech»-uttrykket — ikke bytt den mot en vanlig sans.

**Spacing** — 2, 3, 5, 6, 7, 9, 11, 13, 14, 16, 18, 22, 26 px. Paneler 12–18px indre luft, 14px avstand til skjermkant.

**Radius** — 2 (merkelapper), 3 (knapper), 6/7 (chips), 8 (felt/småpanel), 9 (tray/pille), 12 (store paneler), 50% (prikker/sirkler).

**Skygger**
- Header: `0 12px 34px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)`
- Store paneler: `0 26px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07)`
- Tray/pille: `0 14px 38px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)`
- Gruppeliste: `0 16px 34px rgba(0,0,0,0.5)`
- Fokusring: `0 0 0 3px rgba(203,242,77,0.12)`; aktiv markør `0 0 0 5px rgba(203,242,77,.2)`

**Glass** — `backdrop-filter: blur(18–30px) saturate(160–180%)` med `-webkit-`-prefiks. Faller glass bort på plattformen, bruk `rgba(14,17,15,0.9)` som solid fallback.

**Easing** — grensesnitt `cubic-bezier(.2,.8,.2,1)`; puls `cubic-bezier(0,.2,.6,1)`; kartkurve `1 - (1-t)³`.

## Assets
Ingen bilder, ingen ikonbibliotek. Alle «ikoner» er rene CSS-primitiver (firkanter, sirkler, romber, streker) — det er et bevisst valg og bør beholdes; bytt dem ikke mot et ikonsett.

Eksterne avhengigheter:
- MapLibre GL JS 4.7.1 (JS + CSS)
- Google Fonts: Archivo, JetBrains Mono
- Esri rasterfliser (`Canvas/World_Dark_Gray_Base` og `.../World_Dark_Gray_Reference`) — ingen nøkkel kreves, men **sjekk lisensvilkårene før produksjon**; bytt eventuelt til egne vektorfliser med tilsvarende mørk, avmettet stil.
- Attribusjon vises nede til høyre (mono 9px, `rgba(8,9,10,0.7)`, lenker `#6B736C`).

## Tilgjengelighet — må løses i implementasjonen
Prototypen dekker ikke dette, og det er kjent gjeld:
- Egendefinert peker + `cursor: none` gjør kartet musavhengig. Kartet trenger tastaturnavigasjon (piltaster/tab mellom enheter), og siktet må slås av automatisk ved tastaturbruk eller `prefers-reduced-motion`.
- Filterknapper og bryter er `<button>`/klikkbare `<div>` uten `aria-pressed`/`role="switch"` — sett riktige roller og tilstander.
- Statusfarge må ikke stå alene: formen bærer transportform, men status bør også ha tekst i lister og paneler (det gjør den i detaljpanelet).
- Varselpulsen og haleanimasjonen bør stoppe ved `prefers-reduced-motion: reduce`.
- Kontrast: `#4E554F` på mørk bakgrunn er under AA for småtekst — vurder å heve de svakeste gråtonene ett hakk i produksjon.

## Filer
- `Fleet Map.dc.html` — hele designet (markup, stiler og logikk i én fil). Kartoppsett, gruppering, sikte og mockdata ligger i klassen nederst i filen.
- `support.js` — kjøretidsstøtte for prototypeformatet. **Ikke** en del av designet; trengs bare for å åpne HTML-filen lokalt.

Åpne `Fleet Map.dc.html` direkte i en nettleser for å se og prøve designet, inkludert avspilling og siktet.
