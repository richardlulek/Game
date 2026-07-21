# Masterplan mot Early Access

Sex faser mot Steam Early Access. Status uppdateras per fas; detaljer och
utfall dokumenteras i respektive fas-commits.

## Fas 1 — Makroekonomi 2.0 ✅ (commits 33e077e…9696017)

Riksbanken modellerar inflation (EMA + impulschocker) och sätter styrräntan
med en Taylor-regel; avkastningskurva med lång ränta och inversion
(`centralBank.ts`). Konjunkturen är emergent i stället för timerstyrd:
kreditkvot, byggandel, vakansavvikelse, räntegap och sentiment integreras
till en "hetta" med tröghet och fasutmattning (`cycle.ts`). Systemviktighet:
stor spelare bär systemrisk – och kan bli too big to fail.
Balansutfall: boom 7–11 %, stabilt 53–62 %, bust 27–36 % över 30 år.

## Fas 2 — Staden som organism ✅ (commits 738e713…)

* **Infrastruktur 2.0** (`infrastructure.ts`): invigda projekt består som
  permanent tillgänglighet per distrikt (avtagande 0.7^i), multiplicerar
  hyra/värde/inflyttning. Åtta projekttyper med distriktskrav. Spelaren kan
  medfinansiera (20 % av notan → 25 % kortare byggtid + anseende) eller
  lobba med politisk välvilja (25 % av notan, förbrukar välviljan).
* **Flyttkedjor**: `propertyStandard` (skick/energi/devLevel); färdigställd
  ny bostad ger en puls där hushåll i äldre hus med lägre standard flyttar
  upp (skalad med stadens vakansläge, max 2/puls). Standardmatchning i
  ansökningsflödet: fel standard för distriktets status ⇒ ×0.85.
* **Livscykel/renovräkning**: hus > 40 år slits accelererat (tak ×1.6).
  Gammalt nedgånget bostadshus med hyresgäster ⇒ engångsbeslut:
  totalrenovera (35 % av värdet, skick 95, ålder nollställs, +15 % hyra,
  hyresgästerna ut, rykte −2, press +3; 20 % risk kulturmärkning som
  halverar lyftet) eller avstå.
* **Gentrifiering**: månatlig differentiell drift i districtDev ur
  tillgänglighet + beståndets standard relativt stadssnittet
  (0.0015 × ((access−1)×4 + (std−stadsstd))). Differentiell med avsikt:
  30-årsmätningen visade att en absolut formel inflaterade alla distrikt
  till Exklusivt. Snabb uppgång + stor lågprisstock ⇒ protesthändelser.

Kvarstående balansnotering: districtDev har en långsam stadsvid uppdrift
från äldre källor (rivalpåbyggnader, distrikthändelser) – följ upp i Fas 3.

## Fas 3 — Rivaler 3.0 ⬜

Rivalerna får riktiga balansräkningar (skuld, räntekänslighet), strategier
som reagerar på konjunkturfasen, förvärv/fusioner mellan rivaler, samt
personlighetsdriven aggression mot spelaren (nemesis-bågar fördjupas).

## Fas 4 — Innehåll & slutspel ⬜

Scenariopaket, milstolpekedjor, slutspelsmål bortom förmögenhet
(stadsbyggnadsarv, dynastins anseende), fler unika byggnader/industrier.

## Fas 5 — Dynasti, prestige & NG+ ⬜

Generationsskiften, prestigesystem som bär mellan spel, New Game+ med
modifierare.

## Fas 6 — EA-paketering ⬜

Tauri-bygge för Steam, achievements, moln-sparfiler, prestandabudget,
onboarding/tutorial-polish, lokalisering (sv/en).
