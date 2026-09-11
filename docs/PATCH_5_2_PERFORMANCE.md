# Patch 5.2 – billigare fasadgeometri

Appliceras efter patch 5.1.

Din mätning visade 3 232 → 3 170 ritanrop och 884 000 → 2 497 000
trianglar. Ritanropen minskade cirka 1,9 %, men trianglarna ökade cirka
182,5 %. Patch 5.1 använde för många kompletta boxar för tunna fasaddetaljer.
Instansiering och sammanslagning minskade inte antalet trianglar per detalj.

## Korrigering

- Bakgrundsfasadernas kosmetiska detaljer använder två trianglar i stället
  för tolv. Planet ligger på samma yttersida som den tidigare boxen, med
  samma färg, storlek, placering och utåtriktade normal.
- Burspråkens utskjutande byggnadsvolymer behåller kompletta boxar.
- Spelobjekt behåller tredimensionella karmar och detaljer vid närbild med
  normal grafik. Vid översiktsvy eller låg grafik används samma förenkling
  som i bakgrunden. Den befintliga kamerans LOD-växling används.
- Glas och lysande fönsterytor använder två trianglar även vid närbild.
- Inga ytterligare materialgrupper eller ritanrop läggs till av lösningen.
- Förortshusen, fasadernas fönsterindelning och spelmekaniken ändras inte.

Kompromissen är att tunna bakgrundsdetaljer och detaljer i låg grafik inte
längre har egen sidotjocklek. Volymgivande burspråk behålls. Korrigeringen
återgår inte till de tidigare stora fönstertexturerna.

## Mätning

Geometrikontroll av de nya fasaddelarna på 118 bakgrundshus på standardkartan:

| Omfattning | Patch 5.1 | Patch 5.2 |
| --- | ---: | ---: |
| Trianglar i de kontrollerade fasaddelarna | 706 464 | 118 384 |
| Minskning | | 83,2 % |

Detta är en beräkning av geometri, utan skuggpass. Den omfattar inte hela
scenen, alla spelobjekt, mark, träd eller äldre torngeometri. Siffrorna är
inte direkt jämförbara med din scenmätning och är ingen FPS-mätning.

## Verifiering

- 17 tester i tre filer godkända. Kontrollerar bland annat yttersidans läge,
  normalriktning, bibehållen burspråksvolym, geometribudget och fasadplacering.
- TypeScript/Vite-produktionsbygge godkänt.
- Patchens applicering och reversering verifierade mot patch 5.1.
- Visuell kontroll, hela scenens triangelantal och FPS återstår. Förhandsvisningen
  har tidigare varit blockerad i arbetsmiljön.

Mät efter installation med samma sparfil, kamera, grafikinställning och
skugginställning som tidigare. Notera ritanrop, trianglar och gärna bildtid
eller FPS. Kontrollera både översikt och närbild. De cirka 3 000 ritanropen
kan fortfarande vara en separat flaskhals; den här korrigeringen åtgärdar
främst den kraftiga ökningen av fasadtrianglar.
