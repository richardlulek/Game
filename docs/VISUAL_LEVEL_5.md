# Patch 5 – sammanhängande hus och stadsrum

Den här patchen läggs efter patch 4. Den samlar modellernas formspråk och
bygger markmiljön mellan stadsdelarna. Spelregler, ekonomi och sparformat ändras inte.

## Husen som en helhet

Bakgrundsbebyggelsen använde tidigare egna färger och enklare former än
spelobjekten. Nya detaljer fick dessutom en ljusare, blåare materialpalett.
Det gjorde att tillbyggnader såg påklistrade ut och att hus kunde byta karaktär
när de blev spelobjekt.

| Husfamilj | Förändring |
| --- | --- |
| Centrum | Gemensam beräkning av huvudvolym, flygel och hörntorn. Bakgrundshus får samma tornfönster och våningsband. Tornets puts följer huvudfasaden; karmarnas färg härleds från putsen. |
| Förort | Samma fönster, trapphus och balkongdelar används för bakgrund och spelobjekt. Gavlar följer väggens färg. Fönstrens placering behålls även vid låg detaljnivå. |
| Villor | Garage får sockel, takavslutning, port med indelning och handtag samt sidofönster. Samma garage används i båda renderingarna. Flygeln får fasadfönster; bakgrundsvillornas stora blå entréblock ersätts med en proportionerad dörr och skärmtak. |
| Innerstad | Funkisens burspråk delas mellan bakgrund och spelobjekt. Den indragna takvåningen får fönster och takkant även i bakgrunden. Burspråkens karmar följer fasadens färg. |
| Finans | Bakgrundstornens podium, avsatser och vridna topp följer samma volymdata som spelobjekten. Fasadindelningen följer respektive volym. |
| Industri och hamn | Fasadstrukturens färger följer husets väggmaterial. Industrihallarnas bakgrundstak följer samma uppdelning i takhuvar som spelobjekten. |

Alla vanliga husfamiljer använder samma beräkning för fasadfärg och skick i
bakgrunden och som spelobjekt. Bostadsfasadernas texturkarmar och gardiner har
fått en mer dämpad palett. Entréernas sten, metall och glas knyts till husets
fasad. Uthyrning, slitage, renovering och kvällsbelysning får fortsatt påverka
utseendet. Bakgrunden är fortfarande sammanslagen geometri och har inte alla
spelobjektens animerade eller tillståndsberoende smådetaljer.

## Gator och tomtanslutningar

- Sammanhängande, sammanslagna trottoarytor längs tomter och vägar. Överlappande
  markplattor förenas för att undvika dubbla ytor vid skarvar.
- Kantsten längs vägkanter och övergångsställen vid verkliga vägkorsningar med
  trottoar på båda sidor. Kantstenen lämnar öppningar för passager och infarter.
- Sänkta infarter skapas utifrån riktiga fastigheters reserverade parkerings-
  och lastplatser. Tomma tomter får inte påhittade infarter.
- Asfalt, stenläggning, grus och gräs har små delade texturer i världsskala,
  med mipmaps för avståndsvyer.
- Låga tomtmurar vid villor och förortshus klipps mot byggnader, planteringar,
  entrégångar och parkeringsplatser. Gatuvända sidor lämnar en grindöppning.
- Kontaktskuggor följer de faktiska huskropparna i förortskvarter i stället för
  att mörka ned hela gården. Ljusets skuggförskjutning och avståndsdis justeras.

## Mellan stadsdelarna

Placeringen härleds från den aktiva kartan och de närmaste stadsdelarna:

| Övergång | Utförande |
| --- | --- |
| Centrum–innerstad | Stenlagda små vistelseytor, bänkar, belysning och gatuträd. |
| Centrum–finans | Boulevardkaraktär med regelbundet placerade gatuträd och stenlagda platser. |
| Centrum–förort | Parkmark med öppna gräsytor, träddungar och grusade vistelseytor. |
| Kulle–förort | Naturmark, dungar och en liten balansbana av trä där det finns fri yta. |
| Finans–industri | Servicepräglad grönska och små tekniska skåp med sockel och ventilationsdetaljer. |
| Hamnen | Kajpromenad längs tillgänglig kustmark med räcke, stenlagda vistelseytor och bänkar. |

Vistelseytor ansluts till en trottoar via en fri gångväg. Vägarna binder samman
stråken mellan stadsdelarna. Antalet och den exakta placeringen anpassas till
kartans fria mark; systemet reserverar vägbanor, tomter, landmärken, huvudkontor,
expansionsmark, megaprojekt och befintlig infrastruktur. Infrastrukturens
placeringscache följer nu även byten av genererad karta.

Den nya offentliga miljön använder högst elva instansierade materialgrupper.
Högst 450 nya träd och 30 vistelseytor tillåts. Låg grafik minskar vegetationen.
Kvällsläget tänder de nya lampornas ljusmaterial utan extra punktljus.

## Verifiering och begränsningar

- Produktionsbygge med TypeScript och Vite.
- 120 av 121 riktade tester passerade i den samlade körningen (15 filer): placering på kartfrön 0, 7 och 731,
  fria gångvägar och tomtgränser, riktiga infarter, gemensamma förortsfönster,
  byggnadsvolymer, infrastruktur, tidigare grafik och berörda spelmekaniker.
- Ett befintligt test om slutskick efter etapprenovering föll i den samlade
  körningen men passerade vid separat omkörning tillsammans med filens övriga
  12 tester. Ingen ändring har gjorts i etapprenoveringens spelmekanik.
- På de tre mätkartorna tog planeringen 465–563 ms med samtliga tomter angivna
  som fastigheter. Kartorna fick 17–18 vistelseytor och 368–450 nya träd.
  Mätningen gäller CPU-planering, inte FPS eller GPU-minne.
- Patchens applicering och reversering har kontrollerats mot den levererade patch 4.

Visuell granskning i spel och faktiska FPS-mätningar återstår. Den tillåtna
förhandsvisningen blockerades tidigare i denna arbetsmiljö med
`ERR_BLOCKED_BY_CLIENT`; inga nya spelbilder eller Tauri-körningar intygas.
Produktionsbyggets befintliga varning om stor JavaScript-bundle kvarstår.
Kollisionskontrollerna använder reserverade rektanglar, inte fysisk
fotgängarsimulering. Kartans fria yta styr hur mycket av varje miljö som ryms.
