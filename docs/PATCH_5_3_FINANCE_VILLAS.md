# Patch 5.3 – finanskvarter och villastad

Applicera efter patch 5.2. Korrigeringen omfattar vanliga finanstorn och villor,
inklusive deras bakgrundsversioner. Övriga husfamiljer behåller sina modeller.

## Finanskvarteret

- Tornkroppen börjar ovanpå sockelbyggnaden när sådan finns. Tidigare fortsatte
  hela glastornet ned genom sockelbyggnadens volym.
- Sockelbyggnaden har ett eget väggmaterial med glaspartier och entré. Tornets
  huvudfasad behåller texturbaserat glas för att begränsa geometrikostnaden.
- Vertikala fasadlinjer följer respektive volym och dess rotation. Takavslutning
  finns vid avsatserna och på tornets översta del.
- Bakgrundshus och spelobjekt använder samma volymer och detaljberäkning.
- Solpaneler på finanstorn dimensioneras och placeras utifrån den översta
  takvolymen och följer dess rotation.

## Villastaden

- Fönster får bostadsproportioner, karmar, spröjs och bleck. Huvudhus och flygel
  använder samma fönstersystem. Entrézonen reserveras för dörren.
- Sockel, hörnbrädor, takkant och stuprör knyter ihop fasaden.
- Taken följer både husets bredd och djup. Tidigare användes en kvadratisk
  takkonstruktion även på rektangulära huskroppar.
- Den enkla farstukvisten får stolpar, golv och sammanhängande skärmtak i de
  bakgrunds-/standardmodeller som har farstukvist. Detaljerade fastigheter
  behåller det spelstyrda entrésystemet.
- Bakgrundsvillor får samma fönster, takform och skorsten som grundmodellen.
  Det befintliga detaljerade garaget från tidigare patchar behålls.

## Geometri och verifiering

Tunna detaljer använder lösningen från patch 5.2: plana ytor i bakgrund och
översikt/låg grafik, medan närbilder kan visa djup. Skärmtak och farstukvistens
bärande delar behåller volym. Inga nya paket eller ändringar av spelregler och
sparformat behövs.

- 20 riktade tester i fyra filer godkända. Täcker bland annat tornvolymer utan
  överlapp i höjdled, entrézon, tidigare fasader och geometribudget.
- På kontrollvolymerna (90 m torn och tvåvåningsvillor) använder de nya
  bakgrundsdetaljerna 47 546 trianglar mot 58 368 för den tidigare generiska
  fasadindelningen på samma kontrollvolymer. Detta är endast detaljgeometri,
  inte hela scenen eller skuggpass. Det är ingen FPS-mätning.
- TypeScript/Vite-produktionsbygge godkänt.
- Patchens applicering och reversering verifierade mot patch 5.2.
- Centrum, innerstad, förort, hamn och industri har jämförts med föregående
  leverans och deras modellkomponenter är oförändrade.

Visuell kontroll och mätning av hela scenens ritanrop, trianglar och FPS
återstår. Förhandsvisningen har tidigare varit blockerad i arbetsmiljön.
Jämför efter installation samma sparfil, kameravy och grafikinställningar,
både på långt håll och nära ett torn respektive en villa.
