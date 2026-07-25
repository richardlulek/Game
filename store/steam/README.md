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
| `library-hero-3840x1240.png` | 3840 × 1240 | **Library hero** – bred bakgrund i biblioteket (ren stad, ingen logga) |
| `hero-with-logo-3840x1240.png` | 3840 × 1240 | Presentationsvariant med loggan inbränd (för marknadsföring) |

## Screenshots

`screenshots/` – fem 1920×1080-bilder för butikskarusellen, tagna direkt ur
spelet (staden, portföljen, ekonomin, bolagsresan, distrikten). **Ta om dem
på GPU-hårdvara med grafik på High inför lansering** – se noten nedan.

## Ladda upp

I Steamworks: **Store → Graphical Assets** (capsules) och
**Store → Library Assets** (library capsule/logo). Ladda upp varje fil i
motsvarande fält. `library-logo` är transparent (PNG med alfa) och läggs
ovanpå en mörk hero-bakgrund.

## Inför lansering (ta om på riktig hårdvara)

Skärmdumparna och heron här är tagna under mjukvaru-GL. Inför EA:

- Kör grafik på **High** (skuggor + levande stad: trafik, fotgängare, fåglar).
- Döp om demobolaget "Dev Review Co" till något in-world.
- Ta ett par bilder från ett senare spar så siffrorna ser ut som ett riktigt
  imperium.
- Spela in en **trailer** (30–60 s) – enda tillgången som måste komma från
  live-spel.

## Bygga om heron

```bash
python3 store/generators/make_hero.py   # kräver ig-city-wide.png (in-game-panorama)
```

## Bygga om

Kräver Python med Pillow + fonttools och DejaVu-fonterna:

```bash
python3 store/generators/make_capsules.py   # capsules → store/steam/
python3 store/generators/make_signet.py     # app-ikonen (logo.png)
```
