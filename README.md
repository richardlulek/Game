# Fastighetsimperium

Ett Capitalism-Lab-inspirerat fastighetsspel på svenska – nu med 3D-stadskarta och
rullande realtid. Förvärva, bygg, förvalta och dominera marknaden mot AI-konkurrenter:
fastigheter, börs, industrisektorer, forskning, scenarier och M&A.

## 3D-staden och klockan

- **Karta-fliken** visar staden i 3D (React Three Fiber): dina hus (burgundy ring),
  objekt till salu (gul), tomter (grön) och konkurrenternas innehav (egen färg per
  bolag). Klicka på en byggnad för snabbinfo och genvägar till rätt flik; byggen har
  kranar som växer, vägarna har trafik och obebyggda rutor blir parker.
- **Klockan** i verktygsfältet (► Spela, 1×/2×/4×) låter månaderna rulla av sig
  själva med autospar; den pausar automatiskt vid beslut, game over och vinst.
  ⏭ Månad / ×3 / ×12 stegar manuellt som förut.
- Placeringen på kartan sköts av `engine/city.ts` (`placeCity`) – spellogiken är
  orörd och världspoolen förblir abstrakt tills objekt syns på marknaden.

> **Fristående app.** Denna mapp är helt frikopplad från Estera-webbplatsen i repo-roten
> – egen `package.json`, egna beroenden och egen byggkedja. Inget här importeras av eller
> påverkar Estera-plattformen.

## Kom igång

```bash
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
