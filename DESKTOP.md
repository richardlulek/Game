# Desktop-paketering (Tauri → Steam)

Spelet är en webbapp (Vite + React + Three.js). För Steam paketeras det
statiska bygget i ett Tauri-skal (Windows: WebView2/Chromium) och laddas
upp som en Steam-depot. Spelkoden är **skal-agnostisk** – den pratar bara
med skalet via `src/native/index.ts`, så ett framtida byte till Electron
rör inte resten av kodbasen.

## Förutsättningar (engångs, på byggmaskinen)

1. **Rust** – installera via <https://rustup.rs> (`rustup default stable`).
2. **Windows**: WebView2 (finns med i Windows 10/11) + "Desktop development
   with C++" i Visual Studio Build Tools.
   **Linux**: `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev` m.fl.
   **macOS**: Xcode Command Line Tools.
   (Se Tauris förutsättnings-guide för din plattform.)
3. Node-beroenden: `npm install` (hämtar `@tauri-apps/cli`).

## Första gången: generera ikoner

Tauri-bygget kräver ikonfilerna som `tauri.conf.json` pekar på. Generera dem
från en käll-PNG (helst ≥ 1024×1024):

```bash
npm run tauri icon path/to/logo.png
```

Det fyller `src-tauri/icons/` med alla format (.ico/.icns/.png).

## Utveckla mot skalet

```bash
npm run tauri:dev
```

Startar Vite-devservern och öppnar spelet i ett native-fönster med hot reload.

## Bygg en distribuerbar exe

```bash
npm run tauri:build
```

Kör `npm run build` (Vite → `dist/`), buntar det i skalet och producerar:

- **Windows**: `src-tauri/target/release/property-empire.exe` samt en
  installer under `src-tauri/target/release/bundle/`.
- Övriga plattformar: motsvarande under `bundle/`.

> Om scaffoldingen krånglar mot din Tauri-CLI-version kan du regenerera
> Rust-sidan med `npm run tauri init` och sedan återställa `frontendDist`,
> fönster-config och `identifier` i `tauri.conf.json`.

## Ladda upp till Steam (SteamPipe)

1. I Steamworks: skapa app-ID, en **depot** (Windows) och en `beta`-gren.
2. Bygg en `.exe` enligt ovan.
3. Peka en **depot-build** (via `steamcmd` + en `app_build.vdf`) på mappen med
   `.exe` + resurser.
4. Ladda upp till `beta`, testa på en **ren maskin**, promota sedan till
   `default`.
5. Steam sköter patchning – ingen egen auto-updater behövs.

## Steam-features (i tur och ordning)

- **Overlay** (Shift+Tab) – funkar när Steam kör exe:n.
- **Cloud saves** – spelet sparar i `localStorage`. Enklast: Steam Auto-Cloud
  på save-mappen, eller migrera export/import (finns redan i ⚙-menyn) till en
  fil-baserad save via native-bron. *Inte krav för EA, men rekommenderat.*
- **Achievements** – trevligt men inte krav för EA. **Stommen finns redan**:
  frontend-bron `steam.unlock(id)` (`src/native/index.ts`, no-op på webb) →
  Rust-kommandot `steam_unlock` (`src-tauri/src/lib.rs`, loggar bara just nu).
  För att göra det skarpt:
  1. Skapa app-ID + definiera achievements i Steamworks backend.
  2. Ladda ner Steamworks-SDK:t; lägg `steam_api64.dll` bredvid exe:n och
     `steam_appid.txt` (ditt app-ID) i `src-tauri/` för dev.
  3. Lägg `steamworks = "0.11"` i `src-tauri/Cargo.toml`, initiera klienten i
     `run()`, spara den i Tauri-state, pumpa `run_callbacks()` i en tråd.
  4. Byt kroppen i `steam_unlock` mot de riktiga anropen (se kommentaren där).
  5. Koppla `steam.unlock(ACHIEVEMENTS.x)` till spelhändelser (köp första huset,
     nå 50 MSEK, klara kampanjen …). Kandidat-ID:n ligger i `ACHIEVEMENTS`.

### Native saves (klart)

Export/Import i ⚙-menyn använder riktiga "Spara som…/Öppna…"-dialoger på
desktop (webben faller tillbaka på nedladdning). Skrivningen sker i Rust-
kommandona `write_save`/`read_save`. Detta är också grunden för Steam Cloud –
peka Auto-Cloud på mappen dit spelet skriver.

## Prestanda

- Grafikinställningar (⚙ → Graphics: Low/Med/High) låter spelaren anpassa
  efter sin maskin – viktigt för Steams breda hårdvara.
- WebView2 = Chromium, så WebGL beter sig som i Chrome på Windows.

## Byta skal senare (Electron)

Allt native går genom `src/native/index.ts`. För Electron: lägg till en
Electron-implementation av samma bro + ett Electron-byggscript. Spelkoden
står orörd. Motivet till att byta vore buntad Chromium för identisk WebGL på
macOS/Linux/Steam Deck, eller Chromium-flaggor för GPU.
