# Att släppa en version

Ordningen i sin helhet, så att den går att följa utan att minnas något.
Gäller både första lanseringen och varje patch.

## Grenmodellen

```
main        ──●────────────●──────────────●──   v2.0.0   v2.0.1   v2.1.0
               ↑            ↑              ↑    taggat = det som ligger på Steam
dev         ───┴──●──●──●───┴──●──●────────┘
                                    ↑
hotfix/x                            └── grenas FRÅN main när något brådskar
```

- **`main` är det som är live.** Den rörs bara av en merge från utvecklings-
  grenen, och varje merge taggas. Taggen är sanningen om vad som byggdes och
  laddades upp — behöver du veta vad en spelare kör, checka ut taggen.
- **Utvecklingsgrenen** är där allt arbete sker.
- **`hotfix/<namn>`** grenas från `main` när en akut rättning ska ut utan att
  dra med halvfärdigt arbete. Merge:as till både `main` och utvecklingsgrenen.

**Att batcha en patch är att välja när du merge:ar.** Det som ligger på
utvecklingsgrenen den dagen går ut tillsammans. Vill du hålla något utanför
omgången får det ligga på en egen gren tills nästa.

## Versionsnumret

`MAJOR.MINOR.PATCH` — patch för rättningar, minor för nytt innehåll, major för
brytande omtag. Numret står på tre ställen och hålls i synk av ett skript:

```bash
npm run version:check       # felar om de gått isär
npm run version:set 2.1.0   # sätter alla tre
```

## Checklistan

1. **Utvecklingsgrenen grön**

   ```bash
   npx tsc --noEmit && npx eslint src && npx vitest run && npm run build
   ```

2. **De sviter som inte ingår i standardkörningen**

   ```bash
   PLAYTEST=1 npx vitest run    # 30-årssoaken + rekonstruktionsflödet
   ```

   Mätsonderna (`PROBE=1`) körs vid behov — de är verktyg, inte grindar.

3. **Sparfilskontrollen** — det enda steget som kan förstöra för befintliga
   spelare. `npx vitest run src/__tests__/saveCompat.test.ts` laddar en riktig
   sparfil från varje släppt version och spelar en månad på den. Har du ändrat
   något i `GameState`, läs regeln nedan innan du går vidare.

4. **Sätt versionen** → `npm run version:set X.Y.Z`, granska med `git diff`
   (exakt tre rader), commita.

5. **Skriv patchnoten** i `CHANGELOG.md`, commita. Skriv för spelare, inte för
   utvecklare — commitmeddelandena är källan, men noten ska vara kortare och
   på deras språk.

6. **Merge och tagga**

   ```bash
   git checkout main && git merge --no-ff <utvecklingsgren>
   git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin main --tags
   ```

7. **Bygg på Windows-maskinen**

   ```bash
   npm run tauri:build
   ```

   Resultatet: `src-tauri\target\release\property-empire.exe` plus en installer
   under `bundle\`. Kräver Rust, VS Build Tools och WebView2 — se `DESKTOP.md`.

8. **Ladda upp till Steams `beta`-gren** och testa på en **ren maskin**: nytt
   parti, ladda ett gammalt spar, spara, stäng, öppna igen.

9. **Promota `beta` → `default`** och klistra in changelog-posten som patchnot.

## Sparfilsregeln

Migreringen finns i `src/store/persistence.ts` (`SAVE_VERSION`,
`MIN_SAVE_VERSION`, `migrations`). Vid varje ändring i `GameState`:

| Ändring | Åtgärd |
|---|---|
| Nytt **valfritt** fält | Ingen. Det är `undefined` i gamla filer och koden hanterar det. Så gjordes `peak`, `phased`, `emptyMonths`. |
| Fält som **byter form eller betydelse** | Höj `SAVE_VERSION`, lägg en migrering i `migrations`. |
| Fält som **försvinner** | Höj `SAVE_VERSION`, migrering som städar bort det. |
| Höjd `MIN_SAVE_VERSION` | Bara när en gammal fil inte längre går att rädda. **Det ska stå i patchnoten** — spelare förlorar sina partier. |

Höjer du `SAVE_VERSION`: generera en ny fixtur och lägg till den i
`saveCompat.test.ts`. Gamla fixturer tas aldrig bort förrän
`MIN_SAVE_VERSION` passerat dem.

## Om något gått fel efter uppladdning

Steam behåller tidigare builds. I Steamworks går det att peka `default`
tillbaka på föregående build medan rättningen tas fram — snabbare än att
bygga om under press, och spelarna får tillbaka något som fungerar direkt.
