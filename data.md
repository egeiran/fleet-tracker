# Shipping-dashbord — datakilder og mulighetsrom

Brief til Claude Code-sesjon. Dette er *ikke* en spesifikasjon — det er et kart over hva
som faktisk er mulig med gratis data. Vi (jeg + du) velger retning sammen ut fra dette.

## Rammer

- **Alt skal være gratis**, i hvert fall på lavt volum. Ingen kredittkort, ingen trials
  som ryker etter 14 dager. Hvis en kilde koster penger over en terskel, må terskelen
  være høy nok til at et hobbyprosjekt aldri treffer den.
- **Dyp data slår bred data.** Ett fenomen forklart godt er bedre enn femten KPI-kort
  som hver henter fra en halvdårlig kilde. Heller "ventetid på reden i Trondheimsfjorden,
  riktig beregnet" enn "global skipsfart, omtrentlig".
- Norsk kontekst er en fordel, ikke en begrensning: norske offentlige maritime data er
  uvanlig gode og helt åpne. Det er der kvaliteten ligger.

---

## Tier 1 — bruk disse

### BarentsWatch AIS (Kystverket)

Den beste gratiskilden vi har. Sanntids AIS for norske farvann, kyst- og satellittbasert,
lisensiert under NLOD.

- **Auth:** registrer bruker på barentswatch.no → opprett API-klient på "MyPage" →
  client credentials mot `https://id.barentswatch.no/connect/token` med `scope=ais`,
  `grant_type=client_credentials`. Token i `Authorization: Bearer`-header.
- **Live-stream:** `GET https://live.ais.barentswatch.no/v1/combined` — HTTP-request som
  aldri avsluttes, NDJSON (én JSON per linje). Det finnes også GeoJSON-variant med flere
  felter.
- **Typisk posisjonsmelding:** `mmsi`, `name`, `latitude`, `longitude`, `speedOverGround`,
  `courseOverGround`, `trueHeading`, `rateOfTurn`, `shipType`, `msgtime`.
- **Docs:** `developer.barentswatch.no/docs/AIS/live-ais-api/` og `.../AIS/examples/`.
  Det finnes OpenAPI-spec — hent den og generer klient framfor å skrive typene for hånd.
- **Viktig begrensning:** åpne data inkluderer *ikke* fiskefartøy under 15 m eller
  fritidsbåt under 45 m (personvern). For et shipping-dashbord er det helt greit —
  vi er ute etter last, tank og passasjer uansett.

### Rå AIS-strøm fra Kystverket

`153.44.253.27:5631` over TCP, rå NMEA, **ingen registrering**. Nyttig som backup eller
hvis vi vil parse AIS-meldinger selv (bibliotek: `pyais` i Python, `ais-stream`/`ggencoder`
i JS). Mer jobb, men null friksjon på oppstart.

### Historisk AIS — `hais.kystverket.no`

Nedlasting i **Parquet**, data tilbake til 2006. Dette er nøkkelen til at dashbordet kan
vise *trender* og ikke bare "hva skjer akkurat nå". Parquet + DuckDB gir oss analyse på
millioner av rader lokalt, gratis, uten database-server.

Dette er sannsynligvis det som skiller prosjektet fra et hvilket som helst kartleketøy:
sanntid er lett, historisk sammenligning er verdifullt.

### Kystdatahuset

Kystverkets portal for sjøtrafikkdata: dashbord, API-er og nedlastbare datasett.
Har seilas-/voyage-nivå data, ikke bare rå posisjoner — altså aggregeringen vi ellers
måtte gjort selv.

- Swagger: `https://kystdatahuset.no/ws/swagger/index.html`
- Python-klient på PyPI: `pip install kystdatahuset-python-lib` — har f.eks.
  `get_voyages_for_ships_by_mmsi(mmsi_ids, start_date, end_date)` og hjelpere for
  tids-/geo-batching.
- Auth: login med bruker/passord → JWT. **Verifiser om registrering er selvbetjent**
  før vi baserer arkitektur på dette. Hvis det krever søknad, degrader til Tier 2.
- Biblioteket ber eksplisitt om "sosial" bruk — små tidsvinduer, geografisk filtrering,
  ikke multi-GB-uttrekk. Respekter det.

---

## Tier 2 — supplerende, godt egnet til kryssjekk

### aisstream.io — global AIS

Gratis WebSocket: `wss://stream.aisstream.io/v0/stream`. Gratis API-nøkkel.
Du abonnerer med `BoundingBoxes`, og kan filtrere på `FilterMessageTypes` og
`FiltersShipMMSI`. Dekker posisjon, identitet, havneanløp, lastinfo.

Bruk hvis vi vil ha ett globalt chokepoint (Gibraltar, Malakka, Kanalen) ved siden av
norske data. **Ikke** bruk til å prøve å dekke hele verden — da får vi mye data av
ujevn kvalitet, som er akkurat det vi vil unngå.

### Entur — kollektiv/tog/ferge i Norge

Gratis, **ingen API-nøkkel** — bare `ET-Client-Name`-header med noe identifiserende.

- GTFS-RT: `https://api.entur.io/realtime/v1/gtfs-rt/trip-updates`,
  `/vehicle-positions`, `/alerts` (hele datasettet, oppdateres hvert 15. sekund)
- SIRI Lite (REST) og SIRI 2.0 XML for finere granularitet
- JourneyPlanner (GraphQL) for ruteplan/statiske data
- Docs: `developer.entur.org`

**Den interessante koblingen:** Entur har *planlagte* fergeavganger, AIS har *faktisk*
fartøysposisjon. Å joine de to gir reell punktlighet beregnet fra to uavhengige kilder.
Det er den typen ting som er vanskelig å kjøpe og lett å imponere med.

### MET Norway (api.met.no)

Vær og bølgevarsel, gratis, krever kun identifiserende `User-Agent`.
`locationforecast` for vær, og det finnes havvarsel-produkter (bølgehøyde, strøm).
**Verifiser hvilke ocean-endepunkter som er aktive** — de har blitt endret over tid.

Relevant fordi vær forklarer det AIS viser: hvorfor senket flåten farten, hvorfor ligger
åtte skip i le av en øy.

### OpenSky Network

Gratis flysporing. Bare relevant hvis dashbordet skal være "logistikk" bredt og ikke
"shipping" spesifikt. Anonymt API har lav rate limit; med gratis konto er den bedre.

---

## Tier 3 — vet om, men ikke bruk

- **MarineTraffic / Kpler, VesselFinder, Datalastic, Spire** — alle betalte. Kpler eier
  nå MarineTraffic, FleetMon og Spire Maritime, så konsolideringen har gjort gratistilgang
  dårligere enn den var. Ikke bruk tid her.
- **AISHub** — gratis, men krever at du selv bidrar med en fysisk AIS-mottaker. Utelukket.
- **Containersporing** (Vizion, project44, Terminal49, SeaVantage) — ingen gratis vei inn.
  Hvis dashbordet trenger container-/bookingnivå, må konseptet endres.
- **Fraktrater** (Baltic Dry Index, Freightos FBX) — publiseres, men lisensiert.
  Vi kan lenke til dem, ikke hente dem.

---

## Arkitektur — forslag, ikke fasit

Poenget: AIS er en *strøm*, ikke et request/response-API. Det former alt.

```
BarentsWatch stream  ──►  ingest-worker (langtlevende prosess)
                              │  dedupe, filtrer bbox, downsample
                              ▼
                          SQLite / DuckDB  ◄──  Parquet-arkiv (historisk AIS)
                              │
                              ▼
                          liten API-server  ──►  frontend (kart + charts)
```

- **Ingest må være en langtlevende prosess.** Streamen avsluttes aldri, så serverless
  fungerer ikke. Kjør lokalt eller på en liten alltid-på-instans.
- **Frontend skal aldri snakke direkte med AIS-kilden.** Token lekker, og rå
  meldingsrate dreper nettleseren.
- **DuckDB + Parquet** dekker analysebehovet uten en eneste betalt tjeneste, og leser
  Kystverkets historiske filer direkte.
- **Downsample tidlig.** Et skip til kai sender fortsatt posisjoner. Behold én posisjon
  per fartøy per N sekunder, eller kun ved bevegelse over terskel.
- Kart: MapLibre GL + gratis tiles. Unngå Mapbox — gratis nivå krever kort.

---

## Dashbord-ideer, rangert etter hvor godt datagrunnlaget er

Sortert etter datakvalitet, ikke etter hvor kult det høres ut.

1. **Havneanløp for én norsk havn.** Geofence rundt f.eks. Trondheim havn, utled
   ankomst/avgang fra AIS, bygg anløpslogg. Kryssjekk mot Kystdatahuset hvis vi får
   tilgang — da har vi to uavhengige kilder på samme fenomen, som er sjeldent og sterkt.
2. **Ventetid på reden.** Skip som ligger i ankringsområde med SOG ≈ 0 over tid.
   Direkte proxy for havnekø. Historisk AIS gir baseline å måle mot.
3. **Fergepunktlighet, Entur × AIS.** Planlagt vs. faktisk, to uavhengige kilder.
   Teknisk mest interessant av alle disse.
4. **Fartøysmiks over tid i en led.** Andel tank/last/passasjer gjennom et snitt.
   Enkelt, robust, og faktisk informativt om økonomisk aktivitet.
5. **Utslippsestimat.** CO₂-proxy fra fart, fartøystype og seilt distanse. Merk tydelig
   som *estimat* — vi har ikke motordata.
6. **Ett globalt chokepoint via aisstream** som kontrast til norsk trafikk.

Personlig anbefaling til Claude Code: velg **én** av disse og bygg den ordentlig
— inkludert historisk sammenligning og en ærlig håndtering av manglende data —
framfor å skisse tre.

---

## Fallgruver som vil bite oss

- **Statisk og dynamisk AIS er ulike meldingstyper.** Posisjon (lat/lon/fart) og
  identitet (navn, IMO, destinasjon, dimensjoner) kommer i separate meldinger med ulik
  frekvens. Vi må holde en fartøys-cache og joine på MMSI. Forvent at nye fartøy dukker
  opp i kartet uten navn de første minuttene.
- **`destination`-feltet er fritekst og fylles ut for hånd.** "TRONDHEIM", "TRD",
  "NOTRD", "FOR ORDERS", tomt. Ikke bygg noe kritisk på det uten normalisering.
- **MMSI er ikke en permanent identitet.** Den følger radioinstallasjonen og kan endres
  ved flaggbytte. IMO-nummer er stabilt, men mangler ofte i strømmen.
- **`shipType` er ITU-R M.1371-koder.** Grovt: 60–69 passasjer, 70–79 last, 80–89 tank.
  Legg inn en ordentlig oppslagstabell tidlig, ikke magiske tall spredt i koden.
- **Volumet er stort.** Kystverket mottar i størrelsesorden milliarder AIS-meldinger i
  året fra norske farvann. Vi må filtrere på bounding box i inngangen, ikke i databasen.
- **Satellitt-AIS har hull og forsinkelser** langt til havs. Nær kysten er dekningen god
  (stasjoner rekker 40–60 nautiske mil ut). Hold analysen kystnær og dette blir ikke et
  problem.
- **NLOD krever kildehenvisning.** Legg "Data fra Kystverket / BarentsWatch (NLOD)" i
  footeren fra dag én, ikke som en TODO.

---

## Avklar med meg før dere bygger

- Én havn/fjord eller hele kysten? (Jeg heller mot én, men vil høre argumentet.)
- Sanntid, historisk, eller begge? Begge er dyrere enn det høres ut.
- Skal det kunne kjøre for en fremmed, eller er lokalt godt nok?
- Stack-preferanse? Ellers foreslå én og begrunn kort.

## Første konkrete steg

1. Registrer BarentsWatch-klient, få token, curl `live.ais.barentswatch.no/v1/combined`,
   se på rådataene i fem minutter før noe designes.
2. Last ned én dag historisk Parquet fra `hais.kystverket.no`, åpne i DuckDB, tell
   fartøy per type. Nå vet vi hva vi faktisk har.
3. *Så* velger vi idé.