# Fånga trailer-material (körs på din maskin)

Rendering kräver en riktig GPU. I molnmiljön tar en bildruta ~35 sekunder
(mjukvaru-rasterisering, ingen GPU) – på din laptop tar den bråkdelar av en
sekund. Därför körs fångsten lokalt hos dig, och klippningen sker sedan här.

Skriptet styr kameran och UI:t automatiskt och sparar varje bildruta som PNG.
Du behöver inte röra musen medan det kör.

---

## 1 · Förberedelser (engångs)

I projektmappen (`C:\Dev\Game` eller där du har repot):

```bash
git pull
npm install
npm install -D playwright
npx playwright install chromium
```

## 2 · Starta spelet lokalt

```bash
npm run build
npm run preview
```

Låt det fönstret stå kvar. Det servar spelet på `http://127.0.0.1:4173`.

## 3 · Kör fångsten (nytt terminalfönster, samma mapp)

```bash
node store/generators/capture-trailer.cjs
```

Ett webbläsarfönster öppnas och spelar upp sekvensen själv. **Rör inte musen
eller fönstret medan det kör** – musrörelser styr kameran.

Tar ungefär 5–15 minuter beroende på maskin. Du ser en punktrad per tagning:

```
▶ s1-coldopen  (90 rutor) ...... klart – 42s (0.47s/ruta)
▶ s2-reveal   (150 rutor) ......
```

### Om du vill ändra något

```bash
# annat bolagsnamn i verktygsraden (syns i bild)
COMPANY="Northgate Holdings" node store/generators/capture-trailer.cjs

# längre väntan om staden hinner inte byggas på din maskin
BOOT_WAIT=15000 node store/generators/capture-trailer.cjs

# annan port
GAME_URL=http://127.0.0.1:5173 node store/generators/capture-trailer.cjs
```

På Windows PowerShell sätts variabler så här i stället:

```powershell
$env:COMPANY="Northgate Holdings"; node store/generators/capture-trailer.cjs
```

## 4 · Skicka tillbaka rutorna

Rutorna hamnar i `capture/` (ca 1–3 GB som PNG). Zippa den mappen – eller,
om det blir för stort, kör den här raden först så blir det ~50–150 MB:

```bash
# gör om varje tagning till en h.264-fil (kräver ffmpeg)
for d in capture/*/ ; do
  n=$(basename "$d")
  ffmpeg -framerate 30 -i "$d/f%05d.png" -c:v libx264 -crf 16 -pix_fmt yuv420p "capture/$n.mp4"
done
```

Ladda upp zippen (eller mp4-filerna) så klipps trailern ihop mot samma
ljudspår och textkort som ligger i `store/steam/trailer-script.md`.

---

## Vad som fångas

| Tagning | Innehåll | Rutor |
|---------|----------|-------|
| `s1-coldopen` | Nära på ett kvarter, knappt märkbar drift | 90 |
| `s2-reveal` | **Hjältebilden** – utzoomning till hela staden | 150 |
| `s3-drift` | Långsamt svep över skylinen | 120 |
| `s4-overlays` | Kartan växlar Vacancy → Condition → Yield | 120 |
| `s5-portfolio` | Portföljpanelen, mjuk scroll genom korten | 90 |
| `s6-finance` | Balansräkning + riksbanken | 75 |
| `s7-districts` | Distrikt, marknadsandel, rivaler | 90 |
| `s8-company` | Bolagsresan – nivåerna | 90 |
| `s9-timerun` | Klockan på 8× – staden och siffrorna lever | 150 |
| `s10-outro` | Långsam slutdrift över staden | 120 |

Allt fångas i 1920×1080 med grafik på **High** (skuggor + trafik, fotgängare,
fåglar) och FPS-mätaren avstängd.

Stadstagningarna (`city`) fotograferar **bara `<canvas>`-elementet**, så de blir
helt UI-fria utan CSS-trick. Panel-tagningarna (`ui`) fotograferar hela sidan i
**1:1** – ingen inzoomning, så texten blir knivskarp.

> Rörelsen mäts i steg per bildruta, inte i realtid. En långsam maskin ger
> alltså inte hackig video – bara längre fångsttid.

## Om något går fel

Skriptet kontrollerar första rutan i varje tagning och avbryter direkt med ett
tydligt fel i stället för att fånga 15 minuter tomma bilder.

| Meddelande | Åtgärd |
|---|---|
| `Första rutan i "…" ser tom ut` | Staden hann inte byggas – kör med `BOOT_WAIT=20000` |
| `Ingen <canvas> hittades` | Spelet startade inte – kolla att `npm run preview` kör och att `GAME_URL` stämmer |
| `Hittade ingen knapp: "…"` | Knappen har bytt namn i UI:t – hör av dig, så justeras väljaren |

Avbryt när du vill med Ctrl+C; redan fångade tagningar ligger kvar i `capture/`.
