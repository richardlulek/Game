# Steam-butiksgrafik – The Landlord

Capsule-/biblioteksbilder för Steam-butikssidan, byggda med den nya loggan
(Signet-märket + wordmark, samma DejaVu Serif Bold / DejaVu Sans som den
kontursatta loggan i spelet). Alla PNG:er är genererade – se
`../generators/` för att bygga om dem.

| Fil | Storlek | Var den används i Steamworks |
|-----|---------|------------------------------|
| `header-capsule-460x215.png` | 460 × 215 | **Header capsule** – butikssidans topp, sök, önskelista |
| `small-capsule-462x174.png` | 462 × 174 | **Small capsule** – sökträffar, listor, taggsidor |
| `main-capsule-1232x706.png` | 1232 × 706 | **Main capsule** – utvalt/feature på framsidan |
| `library-capsule-600x900.png` | 600 × 900 | **Library capsule** – porträttrutan i spelbiblioteket |
| `library-logo-1280x720.png` | 1280 × 720 | **Library logo** – transparent logga ovanpå library hero |

## Ladda upp

I Steamworks: **Store → Graphical Assets** (capsules) och
**Store → Library Assets** (library capsule/logo). Ladda upp varje fil i
motsvarande fält. `library-logo` är transparent (PNG med alfa) och läggs
ovanpå en mörk hero-bakgrund.

## Saknas ännu (inte krav för att publicera EA-sidan)

- **Library hero** 3840 × 1240 – bred bakgrundsbild (gärna en 3D-render av
  staden). Görs bäst från en riktig in-game-skärmdump.
- **Screenshots** (minst 5, 1920 × 1080) och en **trailer** – dessa måste
  komma från spelet, inte från loggan.
- **Page background** – valfritt.

## Bygga om

Kräver Python med Pillow + fonttools och DejaVu-fonterna:

```bash
python3 store/generators/make_capsules.py   # capsules → store/steam/
python3 store/generators/make_signet.py     # app-ikonen (logo.png)
```
