# Fastighetsimperium

Ett Capitalism-Lab-inspirerat fastighetsspel på svenska. Förvärva, bygg, förvalta och
dominera marknaden mot AI-konkurrenter.

> **Fristående app.** Denna mapp är helt frikopplad från Estera-webbplatsen i repo-roten
> – egen `package.json`, egna beroenden och egen byggkedja. Inget här importeras av eller
> påverkar Estera-plattformen.

## Kom igång

```bash
cd game
npm install
npm run dev        # http://localhost:5173
```

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
  engine/      Ren, typad spellogik – inga React-beroenden
    types.ts       Domäntyper (Property, Tenant, District, Lot, Competitor, GameState ...)
    data.ts        Konstanter (DISTRICTS, PROP_TYPES, UPGRADES, TENANT_PROFILES, EVENTS)
    format.ts      kr / msek / pct
    random.ts      rnd / pick / newId (+ syncIdCounter)
    property.ts    propMarketValue, propAnnualRent, propAnnualOpex, propNOI ...
    finance.ts     loanTerms, portfolioValue, equityOf, ltvOf
    generators.ts  makeTenant, genListing, genLot
    reducer.ts     Alla spelhändelser (köp, sälj, bygg ...)
    simulation.ts  advanceMonth (månadsloopen)
    initState.ts   Startläge
  store/       Zustand-store (wrappar reducern) + localStorage-persistens med versionering
  components/  UI uppbrutet i fristående filer (kort, paneler, diagram ...)
  styles/      Designtokens (#800020), stilobjekt och global CSS
  __tests__/   Enhetstester för ekonomifunktionerna
```

### Spellogiken

All ekonomi ligger i `src/engine/` som rena TypeScript-funktioner utan UI-beroenden, vilket
gör den enkel att testa och vidareutveckla. UI-lagret läser tillstånd från Zustand-storen och
skickar `GameAction`-objekt genom den rena reducern.

### Persistens

Spelet sparas i `localStorage` under nyckeln `fastighetsimperium:save`. Sparfiler är
versionerade (`SAVE_VERSION`) med stöd för migreringar, och id-räknaren synkas vid laddning så
att nya objekt aldrig krockar med sparade.

## Nästa steg

- Kartbaserad vy (distrikt/tomter på en karta, à la Capitalism Lab).
