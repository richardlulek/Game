# Patch 4 — hus, förvaltning och livet mellan byggnaderna

Separat tillägg efter den uppdaterade patch 3 och
`patch-3-fasadkorrigering.patch`. Ingen ändring av ekonomi, sparformat,
beroenden eller kartans tomtindelning. Gränssnittets nya texter följer spelets
befintliga engelska språk.

## Innehåll

### Hus och entréer

- Innerstadens släta balkongband ersätts med grunda burspråk med front- och
  sidofönster, karmar, mittposter, bleck och våningsavslut. En eller två rader
  väljs deterministiskt efter byggnadens bredd och befintliga seed.
- Tegelhusens takkupor får glasade öppningar mot gatan. Funkishusets indragna
  takvolym får fönster och en avslutande takskiva.
- Detaljerade bostadsentréer får högt placerade lobbyfönster och brevlådor.
  Butikernas varudisplayer används inte längre för bostäder.
- Porttelefon, entrélampa och en nummerplåt tillkommer. Numret är fastighetens
  befintliga id; det införs inget nytt adressregister.
- Fönster på en sliten, uthyrd butik täcks inte längre med brädor. Vakanta,
  slitna lokaler kan fortsatt vara igenbommade.

### Närmiljö och användning

- Upp till två parkerings-/lastplatser, ett cykelställ och en avfallsgrupp per
  detaljvisad fastighet. De placeras bara där hela ytan ryms och lämnar fri
  passage till byggnader och gångvägar. Parkering ansluter till en gatusida.
- Tomter som saknar utrymme får färre eller inga sådana objekt. Täta centrumhus
  får ingen parkering genom byggnaden. Platsantal är visuell dekor, inte en
  ny hyresintäkt eller parkeringskapacitet i ekonomin.
- Uthyrning aktiverar cyklar och parkerade bilar. Industriella lastplatser kan
  ha en stillastående servicebil. Under arbeten används den reserverade platsen
  för material och ett kort byggstängsel, utan att stänga entréns gångväg.
- Befintliga planteringar får varierade buskhöjder. Distriktens befintliga
  materialpaletter behålls. Det tillkommer inga nya trädarter eller årstider.

### Förvaltning som syns

- Arbetenas uttryck härleds från verkliga beställningar och återstående månader.
  Marknadsföring och smarta system startar inte en byggarbetsplats.
- Mindre arbeten får en verktygslåda där det finns plats. Fasadrenovering,
  totalrenovering och påbyggnad får ställningar med en fri mittentré.
  Avslutande arbeten har mindre ställningsyta.
- Etapprenovering visar verkligt etappnummer och en arbetare. Den framställs
  inte som successiv fasadmålning när arbetet gäller byggnadens insida.
- Fasadprojekt visar en växande färdig sockeldel. Slitage sitter i sockeln;
  slutligt förbättrat skick och fasadmaterial följer simulationens resultat.
  Detta är ingen fullständig simulering av lager av färg över varje fasadyta.
- Avbrutna/avslutade arbeten tar bort arbetsmarkeringarna. Kortens cache nycklas
  även på arbetenas återstående månader så projektskyltarna kan uppdateras.

### Stadsliv, kväll och fastighetsvy

- Boende, besökare och arbetare skiljs genom kläder och mindre attribut.
  De går längs beräknade entrérutter. Den gamla fria promenaden som kunde gå
  genom ett hus när en säker rutt saknades tas bort.
- Boende kan fortsätta röra sig vid en uthyrd fastighet under arbeten. Maximalt
  två lokala personer. Ingen extra person visas om en säker gångväg saknas.
- Entrélampor kompletterar tidigare kvällsbelysning. Vissa burspråksfönster lyser
  i kvällsläget vid uthyrning. Ingen extra punktljuskälla tillkommer.
- Välj en fastighet och `Inspect property`. Lägena `Building`, `Entrance` och
  `Courtyard` samt rotationsknappar ger olika utsnitt. `Overview` går tillbaka.
  Förortens gårdsläge riktas mot den gemensamma gårdens centrum.
- Utsnittet för hela huset baseras på modellens mått. Manuella kamerarörelser
  avbryter den automatiska förflyttningen; Reduce motion hoppar direkt till målet.

## Avgränsning och prestanda

Närmiljö, projektdetaljer och lokala personer är begränsade till det visade
kvarteret. Burspråk och takförbättringar hör till de interaktiva husmodellerna
och kan visas på fastighetskorten. Bakgrundsstadens sammanslagna modeller
behåller föregående patchs arkitektur. Signatur- och berättelsebyggnader har
fortsatt sina egna modeller och får inte den generiska närmiljön/fastighetsvyn.

Low behåller reserverade markytor, cykelställ och avfallsgrupper men utelämnar
parkerade fordon, cyklar, lokala personer och små entrédetaljer. Burspråkens
fönster behålls. Reduce motion döljer lokala personer. Heatmaps stänger av
närmiljö och detaljerade entréer enligt befintlig styrning.

Nya gårdsobjekt använder som mest sex instansierade materialgrupper per
fastighet. Burspråken använder högst fyra. Planering sker när underlaget ändras,
inte varje bildruta. Kameran mäter modellen en gång per ny inspektionsbegäran.

Planeringskontroll av 1 344 tomter (klassiska kartan och genererad karta med
seed 731, inklusive expansionsmark) gav 1 766 placerade funktionsytor, varav
350 parkerings- och 32 lastplatser, utan överlapp med reserverade hinder,
gångvägar, planteringar eller andra nya funktionsytor. Detta beskriver möjliga
placeringar, inte antal samtidigt synliga objekt i ett spelparti.

CPU-tid i en lokal Node-körning: medel 0,115 ms/tomt, p95 0,568 ms och max
3,806 ms. Det mäter bara markplaneringen, inte Three-rendering eller FPS.

## Verifiering

- TypeScript/Vite-produktionsbygget godkänt.
- 105 riktade tester godkända i 13 testfiler. Täcker bland annat projektstatus,
  uthyrning, etapprenovering, markplacering, kamerageometri och tidigare grafik.
- Patchens applicering och reversering verifierad i ett isolerat Git-index
  mot föregående leverans med patch 3 och den separata fasadkorrigeringen.
- Befintlig varning om stor JavaScript-bundle kvarstår.

Visuell QA kunde inte genomföras: den tillåtna förhandsvisningen blockerades
av webbläsarmiljön (`ERR_BLOCKED_BY_CLIENT`). Inga spelbilder, touchinteraktioner,
Tauri-körningar eller faktiska FPS-mätningar är därför godkända i denna leverans.
Kameran har ingen kollisionsundvikning mot grannhus; inspektionsvinklar kan
behöva justeras i täta kvarter. Marktestet använder reserverade rektanglar,
inte exakt kollision mot varje ornament i modellen.

## Kontroll i spelet

1. Besök ett funkishus och ett tegelhus i Innerstaden. Kontrollera burspråk och
   takkupor från båda sidor samt på fastighetskortet.
2. Inspektera ett förortskvarter och en industritomt. Kontrollera cykelställ,
   avfall, eventuella parkeringar och att gångvägar möter entréerna.
3. Jämför en vakant butik, en uthyrd butik och en bostadsentré.
4. Beställ underhåll, fasadrenovering och etapprenovering på olika fastigheter.
   Följ månadsskiften samt avslut/avbrott; kontrollera att entréerna hålls fria.
5. Prova alla tre kameravyer och rotation på låga och höga hus. Avbryt en
   kameraförflyttning genom att dra på kartan.
6. Jämför Daylight/Evening, Low/High, Reduce motion och kartans heatmaps.
7. Slå på FPS-mätaren och jämför samma kvarter, kamera och kvalitet före/efter
   patchen på den enhet där spelet faktiskt ska användas.
