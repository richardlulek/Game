# Fastighetsimperium

Ett Capitalism-Lab-inspirerat fastighetsspel på svenska i 3D. Förvärva, bygg, förvalta och
dominera marknaden mot AI-konkurrenter – på en levande stadskarta med rullande tid.

## Kom igång

```bash
npm install
npm run dev        # http://localhost:5173
```

## Så spelar du

**Målet:** bygg imperiet och vinn genom **börsnotering** (100 MSEK eget kapital) eller
**monopol** (köp upp alla konkurrenter). Konkurs vid −2 MSEK i kassan.

- **Kartan** är spelet: klicka på en byggnad eller tomt för att välja den.
  - 🟡 Gul ring = till salu · 🔴 Burgundy ring = din · 🟢 Grön ring = byggbar tomt
  - Röd markör på taket = vakant lokal (hyr ut!). Grå hus ägs av andra och kan inte köpas.
- **Tiden rullar**: ► Spela startar klockan (1×/2×/4×), ❚❚ pausar, ⏭ stegar en månad i pausläge.
  Spelet autosparas varje månad medan klockan går.
- **Sidopanelen** visar det valda objektets kort (köp, hyr ut, uppgradera, bygg, sälj) samt
  flikar för portfölj, finans, konkurrenter och händelser.
- **Händelser syns på kartan**: nya händelser får en tillfällig markör över byggnaden –
  klicka på den (eller på en 📍-rad i händelseloggen, eller 📍 på ett portföljkort) så
  glider kameran dit och objektet väljs.
- **Pågående byggen** har byggkran och en stomme som växer månad för månad; fasader
  mörknar när skicket sjunker.
- **Konkurrenterna äger riktiga byggnader** (egna färger på kartan) och köper mer
  medan tiden går – klicka på deras hus för att se vem som äger vad.
- **Läget spelar roll**: närmare stadskärnan ger högre värde och hyrespotential
  (visas som "Läge" på objektkorten).
- **Staden växer**: distriktet Storängen är låst (🔒) tills ditt imperium nått
  30 MSEK i eget kapital (eller år 4) – då öppnar det för exploatering.
- **Marknaden är auktioner**: objekt har utropspris och tidsfrist; konkurrenterna bjuder
  mot dig (🔨-markör när du blir överbjuden). Bjud i omgångar eller köp direkt mot premie.
- **Inkorgen ⚑** samlar beslut med tidsfrist – kontraktsförnyelser, uppköpsbud,
  kommunala markanvisningar, hyresgästdilemman och börsnoteringserbjudandet. Klockan
  pausas automatiskt när nya beslut landar; förfallna beslut löses med standardvalet.
- **Hyresmarknaden**: vakanta lokaler samlar intressenter över tid – välj mellan trygga
  hyresgäster med låg hyra och riskabla med hög. När kontrakt löper ut förhandlar du:
  förnya (+2 %), kräv marknadshyra (risk att de flyttar) eller säg upp.
- **Underhållspolicy** per fastighet (Minimal/Normal/Premium) byter driftkostnad mot
  slitagetakt.
- **Räntebindning**: bind delar av skulden i 3 eller 5 år mot ett litet påslag –
  ränteeventen slår bara mot den rörliga delen.
- **Detaljplan**: varje distrikt tillåter vissa byggtyper. Ansök om planändring
  (2 MSEK, 6 mån, kräver reputation ≥ 40) för att bygga utanför planen.
- **Gentrifiering**: distrikt utvecklas när det byggs och underhålls – utvecklingen
  driver hyror och värden upp eller ner över tid.
- **Uppköp**: lägg bud på konkurrenters enskilda hus (klicka på dem) eller köp hela
  bolag från Konkurrenter-fliken. De kan också lägga bud på dina fastigheter.
- **↻ Nya objekt på marknaden** byter ut utbudet av fastigheter och tomter.
- **Staden lever**: huvudvägar binder ihop distrikten med pendlande trafik, husen har
  procedurella fönsterfasader (ritade på canvas – inga externa 3D-assets) och
  obebyggda tomter blir små parker med träd.

## Kommandon

| Kommando             | Beskrivning                                  |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Startar utvecklingsservern (Vite)            |
| `npm run build`      | Typkollar och bygger för produktion          |
| `npm run preview`    | Förhandsgranskar produktionsbygget           |
| `npm test`           | Kör enhetstesterna en gång (Vitest)          |
| `npm run test:watch` | Kör testerna i watch-läge                    |
| `npm run lint`       | Kör ESLint                                   |
| `npm run format`     | Formaterar koden med Prettier                |

## Arkitektur

```
src/
  engine/      Ren, typad spellogik – inga React- eller Three-beroenden
    types.ts       Domäntyper (Property, Tenant, District, Lot, Competitor, GameState ...)
    city.ts        Stadskartan: distriktszoner + tomtrutor (parcels), deterministisk layout
    data.ts        Konstanter (DISTRICTS, PROP_TYPES, UPGRADES, TENANT_PROFILES, EVENTS)
    format.ts      kr / msek / pct
    random.ts      rnd / pick / newId (+ syncIdCounter)
    property.ts    propMarketValue, propAnnualRent, propAnnualOpex, propNOI ...
    finance.ts     loanTerms, portfolioValue, equityOf, ltvOf
    generators.ts  makeTenant, genListing, genLot (placerar objekt på lediga tomtrutor)
    reducer.ts     Alla spelhändelser (köp, sälj, bygg ...)
    simulation.ts  advanceMonth (månadsloopen)
    initState.ts   Startläge
  store/       Zustand-store (reducer + spelklocka) + localStorage-persistens med versionering
  hooks/       useGameClock – rullande månadsticks med fast tidssteg och autospar
  three/       3D-vyn (React Three Fiber): CityCanvas, ParcelNode, färgpalett
  components/  UI: sidopanelens kort och paneler, klockkontroller, appskalet
  styles/      Designtokens (#800020), kortstilar (S), layoutstilar (L) och global CSS
  __tests__/   Enhetstester för ekonomi, simulering, stadskarta och persistens
```

### Principen: 3D-vyn är bara en renderare

All spellogik ligger i `src/engine/` som rena TypeScript-funktioner utan UI-beroenden.
3D-vyn (`src/three/`) läser `GameState` och ritar den – den äger ingen egen speldata.
Kopplingen är `parcelId`: varje fastighet/tomt refererar en tomtruta på den
deterministiska stadskartan i `engine/city.ts`.

### Spelklockan

`hooks/useGameClock.ts` driver månadsticks med fast tidssteg (ackumulator ovanpå
`requestAnimationFrame`). En dold flik ger ingen "catch-up" – dt klipps – och spelet
autosparas varje månad. Klockans läge (paus/hastighet) bor i Zustand-storen; motorns
`advanceMonth` är oförändrat den enda vägen framåt i tiden.

### Persistens

Spelet sparas i `localStorage` under nyckeln `fastighetsimperium:save`. Sparfiler är
versionerade (`SAVE_VERSION`, nu v3) med migreringar – v2-sparfiler får automatiskt
platser på stadskartan vid laddning.

## Nästa steg

- Balansering: spela några hela partier och justera trösklar (IPO, uppköpspriser,
  intressenttakt, gentrifieringens hastighet).
- Dag/natt-cykel med tända fönster (fönstertexturen kan få emissive-variant).
- Ljud och ambient stadsljud.
- Fler expansionsdistrikt; distriktsutveckling synlig i 3D (zontonen skiftar).
- Riktiga glTF-modeller (t.ex. Kenney City Kit) om lådstilen ska ersättas.
