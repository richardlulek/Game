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

## Fas 3 — Rivaler 3.0 ✅ (commits 517e9e9…)

* **Balansräkningar** (`rivalFinance.ts`): köp/byggen/påbyggnader/budkrigs-
  vinster belånas (strategiberoende LTV 45–65 %, fonder 0), skulden kostar
  marknadsränta + spread (storlek/strategi) varje månad, equity räknas
  netto och fusioner tar över målets skuld. Räntetäckning < 1 i tre
  månader ⇒ nödförsäljning med skuldnedbetalning. Friska bolag RULLAR
  sina lån – amortering sker bara under press (ICR < 1.8) eller i bust
  (villkorslös amortering nollade hela rivalskulden i 30-årsmätningen).
* **Konjunkturmedvetna strategier** (`strategyBias`): värdebolag är
  kontracykliska (×1.8 köplust i bust, ×0.5 i boom), tillväxt jagar boomen
  och fryser byggen i bust, utdelningsbolag amorterar ×2.2 i bust.
* **Motivdriven M&A** (`pickMerger`): opportunistiskt uppköp av nödställda
  (2 %/mån), fientligt övertagande vid fejd + 3× styrkeövertag (1 %),
  vänskaplig fusion av allierade som utmanar ledaren (0.5 %). Ingen
  konsolidering under 4 aktörer.
* **Nemesis 2.0**: personor har aggression 0–1 (Harborwick 0.9 … Sonny
  Lund 0.3) som styr budkrigsuthållighet (vikchans skalas) och motbuds-
  frekvens. Eskaleringstrappa efter standing: ≤ −40 fler motbud, ≤ −60
  hyresgästvärvning/svartmålning, ≤ −80 allians mot spelaren. Standing
  förfaller 0.3/mån mot neutralt så fejder kan svalna.
* **Balansfix från fas 2**: områdesbruset var asymmetriskt (−0.0025…
  +0.004) och inflaterade hela staden till Exklusivt på 30 år; nu
  väntevärdesneutralt. Mätutfall: centrum ligger kvar på ~1.00 i 30 år,
  tiers sprids (Stable×3, Rising×4) och bara infra-distrikt klättrar.

## Fas 4 — Innehåll & slutspel ⬜

Scenariopaket, milstolpekedjor, slutspelsmål bortom förmögenhet
(stadsbyggnadsarv, dynastins anseende), fler unika byggnader/industrier.

## Fas 5 — Dynasti, prestige & NG+ ⬜

Generationsskiften, prestigesystem som bär mellan spel, New Game+ med
modifierare.

## Fas 6 — EA-paketering ⬜

Tauri-bygge för Steam, achievements, moln-sparfiler, prestandabudget,
onboarding/tutorial-polish, lokalisering (sv/en).
