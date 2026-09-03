# Vakt · flåteintelligens

Ett fullskjerms driftsbilde for containere som spores over sjø, bane og vei. Kartet viser hvor
flåten er, hva som er i bevegelse, hva som står stille og hva som har avvik, med mulighet til å bore
ned i én enhet og spole flåtens siste 24 timer.

Appen kjører i to modus:

- **mockdata** – den seedede flåten fra designprototypen, alt i nettleseren.
- **live** – containerne «rir» på ekte bærere: skip fra Kystverkets AIS via BarentsWatch (med ekte
  24-timers spor) og tog fra Enturs sanntids-API. Veienheter er mock. Sensorfelt (batteri,
  temperatur, dør, støt) er simulert og merket «simulert sensor» i grensesnittet.

## Arkitektur

```
BarentsWatch AIS (strøm + historikk) ─┐
Entur sanntid (tog, polling 15 s)   ──┼─► apps/ingest  Node 22 · Hono · SQLite (node:sqlite)
mock (veienheter)                   ──┘     ├─ 60 faste enheter (slots) med stabile id-er (VKT-xxxx)
                                            ├─ bærer-register, deterministisk tildeling, 24 t spor
                                            └─ GET /api/snapshot · /api/units/:id · /api/health · SSE /api/events
                                                         │  nettleseren snakker direkte med workeren (CORS)
apps/web  Next 16 · React 19 · MapLibre GL 6 ◄── provider: mock | live (snapshot + SSE)
packages/domain  kontrakt + ren logikk (geo, filtrering, gruppering, skipstyper, stedsnavn, simulering)
packages/mock    prototypens seedede flåte
```

Nettleseren snakker aldri direkte med AIS-kilden: BarentsWatch-tokenet lever kun i workeren, og
den rå meldingsraten ville drept nettleseren.

## Kom i gang

Krav: Node 22.13+ og pnpm 10.

```bash
pnpm install
cp .env.example .env        # fyll inn BarentsWatch-nøkler hvis du har dem
pnpm dev                    # web på http://localhost:3000, ingest på http://localhost:8080
```

Uten BarentsWatch-nøkler kjører workeren likevel: tog fra Entur er ekte, sjø og vei er mock, og
header-merket viser «live · sjø utilgj.» når du bytter til live.

### BarentsWatch-tilgang

1. Registrer bruker på [barentswatch.no](https://www.barentswatch.no) → Min side → API-klienter.
2. Opprett en klient **med AIS-scope** (en vanlig klient gir bare scope `api`).
3. Legg `BARENTSWATCH_CLIENT_ID` og `BARENTSWATCH_CLIENT_SECRET` i `.env`.
4. Verifiser: `pnpm ingest:probe` skriver token-status, antall fartøy i utsnittet og antall tog.

### Nyttige kommandoer

| Kommando | Hva |
|---|---|
| `pnpm dev` | web + ingest med hot reload |
| `pnpm test` | Vitest i alle pakker |
| `pnpm e2e` | Playwright-røyktest av web (mock-modus, første gang: `pnpm --filter @vakt/web e2e:install`) |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | kvalitetssjekk og produksjonsbygg |
| `pnpm ingest:probe` | sjekk nøkler og datakilder på under 5 s |

## Grensesnittet

- **Filterskinne** – søk (id, sted, form, booking, last), status, transportform, batteri under 50 %.
- **Kart** – form = transportform (sirkel sjø, rute bane, rombe vei), farge = status. Ruter og haler
  bak enheter i bevegelse, skjermbasert gruppering med hover-liste, «vis hele flåten», stedsnavn.
- **Presisjonssikte** – egendefinert peker med magnetisk lås. Slås av automatisk ved tastaturbruk
  og `prefers-reduced-motion`, og kan settes til presisjon/minimal/av i innstillingene.
- **Avspilling** – spoler siste 24 timer. I live-modus interpoleres posisjoner på ekte spor; segment
  uten historikk (f.eks. tog før workeren startet) tegnes stiplet i tidslinjen.
- **Detaljpanel** – tittel er bærerens eget navn («MS MARION ANITA», «Vy RE11 · tog 834»), med
  kildelinje (Kystverket AIS · MMSI · IMO, eller Entur · kjøretøy-id · linje), simulerte målinger, hendelseslogg
  knyttet til ekte sporpunkter, og «Del sporingslenke» som kopierer en ekte dyplenke `/spor/<id>`.
- **Innstillinger** (tannhjul) – datakilde, sikte, hale, gruppering, cellestørrelse, ruter,
  flåtestørrelse. Lagres i localStorage og speiles i URL-en (`?src=live&trails=all`).

Tastatur: Tab til lista, piltaster mellom enheter, Enter velger, Esc lukker panelet.

## Datakilder og lisens

- **Kystverket / BarentsWatch** – AIS for norske farvann, [NLOD](https://data.norge.no/nlod).
  Åpne data dekker ikke fiskefartøy under 15 m eller fritidsbåter under 45 m.
- **Entur** – sanntidsposisjoner for tog, NLOD. Krever kun identifiserende `ET-Client-Name`.
- **Esri World Dark Gray** – kartfliser uten nøkkel. Sjekk lisensvilkårene før kommersiell bruk.
- Sensordata er simulert. Attribusjon vises nede til høyre på kartet.

## Deploy

**Ingest på Fly.io** (én maskin, SQLite på volum):

```bash
fly launch --config apps/ingest/fly.toml --copy-config --no-deploy
fly volumes create ingest_data --size 1 --region arn
fly secrets set BARENTSWATCH_CLIENT_ID=… BARENTSWATCH_CLIENT_SECRET=… CORS_ORIGINS=https://<web>.vercel.app,http://localhost:3000
fly deploy --config apps/ingest/fly.toml
```

**Web på Vercel**: importer repoet, root directory `apps/web`, sett
`NEXT_PUBLIC_INGEST_URL=https://vakt-ingest.fly.dev`. Google Fonts hentes ved bygg.

Lokalt med Docker: `docker compose up --build` starter workeren på :8080.

## Kjente begrensninger

- Én maskin og én SQLite-fil: ingen høy tilgjengelighet.
- Kun norsk AIS-dekning; sjøenheter ligger langs norskekysten og i Skagerrak.
- Tog-historikk finnes bare fra workeren startet (persisteres på volumet).
- `destination` i AIS er fritekst; bare normaliserte treff vises.

## Demo-sjekkliste

1. `pnpm ingest:probe` → token OK og fartøy i utsnittet.
2. `pnpm dev`, åpne http://localhost:3000 (mock). Tannhjul → «live».
3. Velg en sjøenhet: bærerlinje, ekte spor, hendelser med ekte koordinater.
4. Spill av siste 24 t. Hover en gruppe for medlemslista.
5. «Del sporingslenke» → åpne lenken i ny fane.
