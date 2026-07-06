# Fastighetsimperium

Ett Capitalism-Lab-inspirerat fastighetsspel på svenska i 3D. Förvärva, bygg, förvalta och
dominera marknaden mot AI-konkurrenter – på en levande stadskarta med rullande tid.

## Kom igång

```bash
npm install
npm run dev        # http://localhost:5173
```

## Så spelar du

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

## Nästa steg (fas 5+)

- Budgivning mot konkurrenter om marknadsobjekt.
- Dag/natt-cykel med tända fönster (fönstertexturen kan få emissive-variant).
- Ljud och ambient stadsljud.
- Fler expansionsdistrikt och distriktsutveckling (gentrifiering).
- Riktiga glTF-modeller (t.ex. Kenney City Kit) om lådstilen ska ersättas.
