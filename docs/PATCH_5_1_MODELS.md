# Patch 5.1 – centrum, innerstad, hamn och industri

Appliceras efter patch 5. Den här korrigeringen ersätter de fyra områdenas
stora fasadtexturer med geometriska fönster och sammanhängande fasadindelning.
Förortshusens modellkomponent och gemensamma förortsdelar är oförändrade.

## Förändringar

- Centrum: smalare stående fönster, karmar, spröjs och bleck i gemensamma
  fönsteraxlar. Gesimser och gårdsflygel följer samma materialfamilj som
  huvudbyggnaden och tornet. Det gamla extra bottenvåningsbandet tas bort.
- Innerstad: tegelhus och funkis får skilda fönsterproportioner. Funkisens
  utskjutande fönsterpartier och balkongräcken följer samma fönsteraxlar som
  resten av fasaden. Takkupornas färger samordnas och takvåningen får egna
  proportionerade fönster. Det gamla genomgående butiksbandet tas bort från
  hus som inte ska ha en sådan fasad.
- Hamn: magasinsfasader med regelbundna fönster i flera våningar, synlig
  fasadindelning, bleck och sockel. De enkla bakgrundsportarna ersätts med
  inramade portar med indelning och skärmtak.
- Industri: hallfasader med högt placerade fönster, panelindelning, sockel,
  takkant och detaljerade portar samt personalentré där bredden medger det.
  Logistikterminalernas huvudhall får samma hallfasadsystem; befintliga
  lastkajer, portar och kontorsdel behålls.

Bakgrundshus och spelobjekt använder samma nya beräkning för respektive
fasadfamilj. Detaljerade fastigheter behåller spelinformation och entréer
från det befintliga entrésystemet. De nya fasaderna reserverar utrymme för
entréerna. Ägarstatus, ekonomi och sparformat ändras inte.

Stadshusens fönstergeometri ligger kvar när uthyrning eller kvällsläge ändras;
en del rutor får ljusmaterial i kvällsläget när huset är bebott. Bakgrundshusen
är fortfarande statiska och motsvarar inte varje tillståndsberoende detalj
på ett spelobjekt. Energiinstallationer och övriga specialmodeller omfattas
inte av denna fasadkorrigering.

## Verifiering

- TypeScript/Vite-produktionsbygge godkänt.
- 42 tester i sex filer godkända, inklusive nya kontroller av fasader åt alla
  fyra väderstreck, fri entrézon, oförändrad fönsterplacering vid ljusbyte,
  låga takvåningar och skillnaden mellan magasin och produktionshall.
- Förortshusens komponent jämförd med patch 5: identisk.
- Applicering och reversering verifierade mot levererad patch 5.

Visuell granskning i spelet och GPU/FPS-mätning återstår. Den tillåtna
förhandsvisningen har tidigare varit blockerad i arbetsmiljön. Fler riktiga
fasaddelar innebär mer geometri än de gamla texturerna; bakgrundsdelar slås
samman och spelobjekt använder materialgrupper med instansiering, men detta
är inte en verifierad prestandagaranti. Befintlig varning om stor JS-bundle
kvarstår.
