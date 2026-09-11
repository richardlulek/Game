# Separat fasadkorrigering efter patch 3

Appliceras ovanpå den uppdaterade patch 3 med förortshus och fasadstruktur.
Installera inte hela patch 3 igen.

Lägg patchfilen i projektroten och kör:

```sh
git apply --check patch-3-fasadkorrigering.patch
git apply patch-3-fasadkorrigering.patch
npm run build
```

Om kontrollen misslyckas: avbryt och kontrollera installerad patchversion eller
lokala ändringar. Använd inte tvångsapplicering.

- Centrumhusets låga gårdsflygel får samma fönsterskala och fasadmaterial som
  huvudbyggnaden, med sockel, fasadindelning och takavslut.
- Den täckande bottenvåningspanelen på bostäder/kontor får fönster i stället för
  en slät vägg. Butikernas befintliga skyltfönster behålls.
- Hörntornet får fönster per våning, karmar, mittposter, bleck, våningsband,
  sockel och takgesims. Fönstren följer de tio cylinderfasetternas riktningar.
  Tornets fönster är mörka; ingen ny belysning läggs till.
- Detaljerna sitter i husmodellen och ingår även i fastighetskortens rendering.
  Tornets detaljer använder tre instansierade materialgrupper och behålls i
  låg detaljnivå. När fönster stängs av för modellen döljs även torndetaljerna.

Byggt med TypeScript/Vite. Nio riktade tester godkända, inklusive fönstrens
placering utanför tornets väggar och höjdlinjering med huvudhusets våningar.
Visuellt speltest och prestandamätning återstår. Kontrollera särskilt de två
husen från referensbilden i fastighetskorten och från flera kameravinklar.

Ingen ändring av ekonomi, sparformat, beroenden eller tomtens byggnadsplacering.
