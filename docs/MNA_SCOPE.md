# Scope: M&A 2.0 — förvärv som process, inte knapp

> **STATUS: GENOMFÖRD.** Alla sex batchar implementerade och pushade
> (commits bf28e40…, en per batch). Se MASTERPLAN.md och testerna
> `mnaDeals/mnaDiligence/mnaHostile/mnaIntegration/mnaPartial`.
> Avvikelser från scopen: skatteklausul i DD utelämnad (covenanter täcks
> av lik-i-garderoben), aktiebetalning kräver notering (som designat).

## Varför

Dagens M&A är en **knapp**: välj rival, dra ett reglage 130–150 % av equity,
klicka, klart. Allt händer på en gång och inget kan gå fel. Det som gör M&A
till spelmaterial i verkligheten — förhandlingen, osäkerheten om vad man
faktiskt köper, finansieringsvalet, motbud, integrationssmärtan — saknas
helt. Samtidigt finns redan all infrastruktur som behövs: riktiga
balansräkningar med skuld och ICR (fas 3), motivdriven rival-M&A
(`pickMerger`), personor med aggression, standing/relationer, börsen med
ägarandelar, förvärvsvärderingen (`mna.ts`) och aktivistfonden som redan
kan ta över SPELAREN. M&A 2.0 knyter ihop dem till spelets tredje pelare
vid sidan av förvaltning och stadsbyggnad.

Designprincip: **varje affär är en berättelse i tre akter** — jakten
(underrättelser, närmande), affären (förhandling, finansiering, motbud)
och efterspelet (integration, synergier som ska FÖRTJÄNAS). Värderingen i
`mna.ts` blir löftet; integrationen avgör om löftet infrias.

---

## Batch 1 — Förhandlingen (kärnloopen)

Budet blir en dialog i rundor i stället för ett omedelbart köp.

1. **Budprocess** (`mna.ts` + nytt tillstånd `s.pendingDeal`): spelaren
   lägger ett indikativt bud → målbolagets ägare svarar nästa månadsskifte:
   *accepterar / kontrar / avvisar*. Svaret styrs av premien mot ägarens
   egen värdering (NAV + ägarpremie), personans aggression (Harborwick
   kräver mer, Sonny Lund säljer inte till fienden), standing (fiender
   kräver +15 %, vänner −5 %) och läget (ICR-pressade och bust-drabbade
   ägare mjuknar — fas 3-datat blir spelbart).
2. **Förhandlingsrundor**: max 3 kontringar (mönstret från budkrigen /
   `nextBidRound`). Avbruten förhandling kostar standing och kyler
   möjligheten i N månader (`dealCooldowns`).
3. **Finansieringsval** vid accept: kontant / banklån (villkor från rating
   & LTV som idag) / **aktiebetalning** (post-IPO: säljaren tar aktier —
   ingen kassa men utspädning och en ny storägare) / **earn-out** (20–30 %
   av priset betalas efter 24 mån bara om förvärvade beståndets NOI håller
   målet — billigare men binder framtiden).
4. UI: förhandlingskort i förvärvspanelen med rundhistorik och ägarens
   repliker (personacitat).

*Beroenden:* pendingDecision-mönstret, personor, standing, loanTerms.
*Storlek:* M. *Tester:* svarslogik per persona/standing/ICR; earn-out
utfaller rätt; cooldown.

## Batch 2 — Underrättelser & due diligence

Vad köper du egentligen?

5. **Investmentbanken som rådgivare**: månadsarvode ger *deal pipeline* —
   en flik som visar rivalernas ICR, skuldsättning, fas 3-stress och
   skvaller ("Ladder Capital har missat räntetäckningen två månader") —
   dagens dolda `icrBadMonths`-data blir underrättelser att agera på.
6. **Due diligence** (kostnad ~0.5 % av budet, 2 mån): avslöjar målets
   *verkliga* böcker — dolda skickproblem (skick visas idag som snitt),
   kulturmärkta hus, svaga hyresgäster nära default, covenanter i
   skulden. Utan DD: 25 % risk för **lik i garderoben**-händelser efter
   tillträdet (nedskrivning 5–15 % av NAV, presshetta).
7. `acquisitionValuation` får ett *osäkerhetsintervall* (±10 % utan DD,
   exakt med) — värderingen visar ärligt vad man inte vet.

*Storlek:* M. *Tester:* DD avslöjar seedade dolda fel; lik-i-garderoben
bara utan DD; pipeline listar ICR-stress korrekt.

## Batch 3 — Fientliga uppköp via börsen

När ägaren säger nej finns en annan väg — aktieägarna.

8. **Smygköp & budplikt**: ägarandelar i målbolaget (finns redan i
   `stocks`) blir strategiska: ≥ 10 % toehold pressar styrelsen (−5 % på
   accepttröskeln), ≥ 30 % utlöser **budplikt** — du MÅSTE lägga bud på
   resten (svensk regel; gör smygandet till ett risktagande).
9. **Fientligt bud**: erbjudande direkt till aktieägarna över börskurs.
   Styrelsen försvarar sig personadrivet: **white knight** (allierad rival
   lägger motbud — relationssystemet), återköp som driver kursen, eller
   kapitulation. Fientlig seger: −standing hos alla, presshetta, och
   integrationen (batch 4) blir dyrare.
10. **Rivalerna använder samma vapen mot dig**: post-IPO kan en
    kapitalstark rival (eller fonderna) lägga publikt bud på DITT bolag —
    aktivistmekanikens `takeoverPressure` växer till riktiga bud med
    försvarsval (återköp, vit riddare via allierad rival, utdelningsfest).
11. **Motbud på dina affärer**: pågående förhandling kan väcka en rivals
    konkurrerande bud på samma mål (budkrig om BOLAG) — pickMerger-motiven
    återanvänds.

*Storlek:* L (störst i scopen — delas i 3a spelarens attack / 3b
försvaret+rivalernas attack om det behövs).
*Tester:* budpliktströskeln; white knight kräver allians; rivalbud på
spelarens mål; spelarförsvar.

## Batch 4 — Integrationen (efterspelet)

Synergier ska förtjänas, inte klickas fram.

12. **Integrationsfas** 6–12 mån per förvärv (`s.integrations[]`):
    engångskostnad (~2 % av priset) + månatlig friktion. Under fasen:
    förvärvade hyresgäster −10 nöjdhet (kulturkrock), churn-risk på
    nyckelhyresgäster, förvaltningskapaciteten (orgLoad) belastas dubbelt.
13. **Synergirealisering**: värderingens synergital (`mna.ts`) blir ett
    MÅL som realiseras gradvis — takten styrs av en integrationspoäng ur
    stabsnivåer/chefstalang (executives) och om köpet var vänligt (100 %)
    eller fientligt (70 %). UI: integrationskort med "realiserat X av Y".
14. **Avbruten integration**: sälja vidare inom 12 mån ger rea-stämpel
    (−10 % pris, −rykte) — flipping av bolag ska kosta.

*Storlek:* M. *Tester:* synergier landar gradvis och når målet vid full
poäng; kulturkrocken syns och klingar av; fientlig rabatt på realiseringen.

## Batch 5 — Partiella affärer & konkurrensvakten

Alla affärer är inte hela bolag.

15. **Divisionsköp**: köp en rivals HELA distriktsbestånd eller
    industrigren i ett paket (paketpremie ~5 % över summan, en
    förhandling i stället för N budgivningar). Rivalen använder likviden
    enligt sin strategi — distriktsbolag renodlar gärna.
16. **Byteshandel**: föreslå hus-mot-hus-byten (+utjämning i kontanter).
    Värdering via `propMarketValue` + bådas distriktsöverlappssynergier —
    affärer där BÅDA vinner bygger standing (+8) och kan tina fejder.
17. **Konkurrensmyndigheten**: förvärv som ger > 45 % marknadsandel i ett
    distrikt (eller > 35 % av staden — `playerMarketShare` finns) prövas:
    3 mån fördröjning, krav på avyttring i det dominerade distriktet,
    eller stopp. Knyter an till DOMINANCE_SUPERVISED_SHARE och gör
    monopolvägen till ett medvetet regulatoriskt spel.
18. **Sälj egna paket som bolag**: knoppa av 3+ egna hus till ett
    "dotterbolag" och sälj till rival/fonderna (säljsidans M&A — samma
    värderingsmotor speglad; kompletterar spinoffs för industrier).

*Storlek:* L. *Tester:* paketpris och likvidanvändning; bytesvärdering;
konkurrensprövningens trösklar; avknoppningsförsäljning.

## Batch 6 — Mätsele, balans & liv

19. **30-årsmätsele** utökas: antal affärer per typ (vänlig/fientlig/
    division/byte), premienivåer, integrationsutfall (realiserade
    synergier / nedskrivningar), budpliktsutlösningar, konkurrensingrepp.
    Balansmål: 3–8 spelarrelevanta M&A-händelser per decennium; fientliga
    köp dyrare men snabbare; DD lönar sig i väntevärde.
20. **Tidningen** rapporterar affärsrykten som rör kurser (insiderfrestelse
    → skandalrisk), och `pickMerger`-affärer mellan rivaler får förspel i
    pressen i stället för att landa som blixt från klar himmel.
21. Masterplan/SYSTEMS.md uppdateras; scenariot **The Last Empires** får
    progress-koppling till egna genomförda affärer.

*Storlek:* S–M.

---

## Sammanfattning

| Batch | Innehåll | Storlek | Bygger på |
|---|---|---|---|
| 1 | Förhandling i rundor, finansieringsval, earn-out | M | personor, standing, budkrig |
| 2 | Deal pipeline, due diligence, lik i garderoben | M | fas 3-ICR, mna.ts |
| 3 | Fientliga bud, budplikt, försvar, rival-motbud | L | börsen, relationer, aktivist |
| 4 | Integration: gradvisa synergier, kulturkrock | M | mna.ts, executives, orgLoad |
| 5 | Divisionsköp, byten, konkurrensvakt, egna avknoppningar | L | selling, cycle, spinoffs |
| 6 | Mätsele, balans, press-rykten | S–M | playtest30 |

Ordningen är vald så att varje batch är spelbar för sig: redan efter
batch 1 är M&A en process med motstånd i stället för en knapp. Batch 3
och 5 är de tunga; de kan delas eller senareläggas utan att helheten
faller. Sparfältsmässigt är allt additivt (`pendingDeal`, `integrations`,
`dealCooldowns` m.fl. som optionella fält) — inga migreringar krävs.
