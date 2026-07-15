/* ============================================================
   Månadssimulering – kärnan i spelloopen.
   Logiken är oförändrad från prototypen.
   ============================================================ */

import { fullyOwnedBlocks } from "./blocks";
import { EXPANSION_BLOCKS, PARCELS, districtsWithSpace, emptyParcels, pickFrontierParcel } from "./city";
import { blockInfo, cityProfileById, signatureArea } from "./cityProjects";
import { planTick, rawLandPrice } from "./cityPlan";
import {
  OVERLOAD_COST_PER_PROP,
  nextTier,
  orgLoadOf,
  qualifiesFor,
  tierForLevel,
  unitCount,
} from "./company";
import { DISTRICT_TIERS, maxDevLevel, tierOfDev } from "./districtTiers";
import { esgRatingOf } from "./esg";
import {
  BROKER_FEE,
  applicationRate,
  bestApplication,
  makeApplication,
  satisfactionTarget,
  signContract,
} from "./leasing";
import { DISTRICT_EVENTS, DISTRICTS, EVENTS, MILESTONES, POLITICAL_PARTIES, PROP_TYPES, RARE_EVENTS, UPGRADES } from "./data";
import { SCENARIOS, rivalScenarioProgress, rivalWinsScenario } from "./scenarios";
import { advanceStory, districtLocked, suppressOrganicApplications, unlockedDistrictsFor } from "./story";
import { makeDecision } from "./decisions";
import { INFRA_KINDS, RATE_STEP, cityVacancyRate, movePressure, policyRateTarget, rateAppetite } from "./economyLife";
import {
  ACTIVIST_TAKEOVER_AT,
  CRISIS_MONTHS,
  DOMINANCE_SUPERVISED_SHARE,
  FUNDS,
  FUND_TRIGGER_EQUITY,
  MEGA_PROJECTS,
  SUPERVISION_FEE,
  activistTick,
  districtShareOf,
  fundsActive,
  shouldTriggerCrisis,
} from "./lateGame";
import { amortInfoOf, equityOf, loanTerms, portfolioValue } from "./finance";
import { covenantBreach, creditRatingOf } from "./rating";
import { tickCityEvent } from "./cityEvents";
import { rivalQuote } from "./rivalPersonas";
import { kr, msek } from "./format";
import { calYear, daysInMonth, formatMonthYear } from "./date";
import { pendingWork, propAnnualOpex, propMarketValue, propPotentialRent } from "./property";
import { genListing, genLot, genWorldProperty, makeTenant } from "./generators";
import { seasonOf } from "./season";
import { RESEARCH, monthlyReputation, salariesTotal, wearMult } from "./progression";
import { newId, pick, random01, rnd } from "./random";
import { attractiveness, interestChance, offerAmount, packageOfferAmount, packageStats, pickStrategicSale, rivalSellChance } from "./selling";
import { applyStockNews, executeLimitOrders, maybeListingEvents, priceStocks, quarterlyEarnings, rivalNews, stepSentiment, stepStocksDaily, stockHoldingsValue } from "./stocks";
import { industryAssetValue, makeIndustryAssetFromTemplate, tickHotel, tickEnergy, tickLogistik } from "./industries";
import { INDUSTRY_TEMPLATES } from "./industryData";
import type { GameState, InfraProject, LogEntry, Offer, Tenant } from "./types";

/**
 * Enda kanalen för att ändra spelarens kassa i månadssimuleringen. Ett positivt
 * `delta` är en inbetalning, negativt en utbetalning. Att allt går genom EN
 * funktion gör det lätt att hitta samtliga kassaflöden (sök på `cashflow(`) och
 * ger en enda punkt att logga/spåra från när något inte stämmer i bokslutet.
 *
 * Sätt `CASHFLOW_DEBUG = true` för att få en konsolluppställning per månad över
 * varje flöde och orsak – noll overhead när den är av.
 */
const CASHFLOW_DEBUG = false;
let cashLedger: { reason: string; delta: number }[] = [];

function cashflow(s: GameState, delta: number, reason: string): void {
  s.cash += delta;
  if (CASHFLOW_DEBUG) cashLedger.push({ reason, delta });
}

/** Motsvarigheten för en rivals kassa – samma enda kanal så att hela
 *  ekonomin (spelare + konkurrenter) går att revidera på ett ställe. */
function rivalCashflow(c: { cash: number }, delta: number): void {
  c.cash += delta;
}

/**
 * Stegar fram spelet EN dag och returnerar det nya tillståndet.
 *
 * Kalendern (`s.day`) rullar 1..antal dagar i månaden (riktiga månadslängder
 * med skottår, se engine/date.ts) för ett mjukt, kontinuerligt flöde à la
 * Capitalism Lab. De tunga ekonomiberäkningarna sker fortfarande en gång per
 * månad: när dagen passerar månadens sista dag nollställs `day` och hela
 * `advanceMonth` körs som vanligt. All befintlig ekonomi- och bokslutslogik
 * är därmed orörd – dagsticken lägger bara en finare tidsupplösning ovanpå.
 */
export function advanceDay(state: GameState): GameState {
  // Ett pågående beslut eller en auktion pausar tiden – som för månadssteget.
  if (state.pendingDecision || state.auction) return state;

  const day = (state.day ?? 1) + 1;
  if (day > daysInMonth(state.year, state.month)) {
    // Månadsskifte: kör hela månadssimuleringen och landa på dag 1.
    return { ...advanceMonth(state), day: 1 };
  }
  // Vanlig dag: kalendern rör sig och börskurserna vandrar intradag (feature 3)
  // så marknaden lever i realtid. Fundamenta är oförändrade – månadsstängningen
  // i advanceMonth sätter fortfarande riktningen.
  const stocks = state.stocks && state.stocks.length ? stepStocksDaily(state.stocks) : state.stocks;
  return { ...state, day, stocks };
}

/** Stegar fram spelet en månad och returnerar det nya tillståndet. */
export function advanceMonth(state: GameState): GameState {
  // Ett pågående beslut eller en auktion måste lösas innan spelet går vidare.
  if (state.pendingDecision || state.auction) return state;

  // ────────────────────────────────────────────────────────────────────
  // FASMANIFEST – advanceMonth kör faserna i denna ordning. Sök på fasens
  // rubrik (`── Namn ──`) för att hoppa dit. Ordningen är avsiktlig: NOI
  // ackumuleras i fas 2–6 och landar på kassan i fas 7; rating/covenant och
  // eget kapital räknas SIST (fas 34–37) på färdiguppdaterade siffror.
  //
  //   1  Riksbanken – kvartalsvis räntebesked
  //   2  Fastighetsloopen – slitage, hyresgäster, underhåll, opex → monthlyNOI
  //   3  U1 – ansökningsflödet (pris möter efterfrågan) + flyttkedjor
  //   4  Bolagspolicyn verkställs av cheferna (CFO/förvaltningschef)
  //   5  Bolagets kontor – overhead och överbelastning
  //   6  Industrisektorer – hotell/energi/logistik → monthlyNOI
  //   7  KASSA: monthlyNOI − ränta, sedan skatt/viten/försäkring
  //   8  Politiska val (var 4:e år)
  //   9  Distressed rivalförsäljningar
  //  10  Rivalrace + konkurrerande bud + rivalfusion
  //  11  Stadshändelser + distriktshändelser + infrastruktur
  //  12  Slutspelet – kapitalet slår tillbaka (fonder, fientligt bud)
  //  13  Egen detaljplan – samråd/granskning tickar
  //  14  AI-konkurrenter agerar (portföljer + personligheter)
  //  15  Rivalerna konkurrerar om industriobjekten
  //  16  Bud in/ut på dina & utannonserade fastigheter
  //  17  Börsen + dotterbolag + IPO/uppköpstryck
  //  18  Löner + forskning
  //  19  Områdesutveckling + distriktsöden + helkvarter
  //  20  ESG-betyg + rivalagendor
  //  21  Detaljplaneauktion (kommunen släpper kvarter)
  //  22  Naturlig tillväxt (privata byggherrar förtätar)
  //  23  Beslutshändelse (~6 %)
  //  24  Utgångna listings (hus stannar på kartan) + marknadstillflöde
  //  25  Covenantvakt (rating + bank följer skulden)
  //  26  Bolagsresan – hint när nästa nivå kan nås
  //  27  Bokför månad: logg, equity-historik, statsHistory → advanceStory
  // ────────────────────────────────────────────────────────────────────
  let s: GameState = { ...state };
  let monthlyNOI = 0;
  if (CASHFLOW_DEBUG) cashLedger = [];
  const events: LogEntry[] = [];
  const prevSent = state.marketSentiment ?? 1; // sentiment innan månadens händelser

  // Track previous equity for delta display
  s.prevEquity = equityOf(state);

  // Market cycle management (boom / stable / bust)
  if (!s.marketCycle) {
    s.marketCycle = { phase: "stable", monthsRemaining: 18 };
  }
  s.marketCycle = { ...s.marketCycle, monthsRemaining: s.marketCycle.monthsRemaining - 1 };
  if (s.marketCycle.monthsRemaining <= 0) {
    const cur = s.marketCycle.phase;
    const next: "boom" | "stable" | "bust" = cur === "stable"
      ? (random01() < 0.55 ? "boom" : "bust")
      : "stable";
    const dur = next === "boom" ? 10 + Math.floor(random01() * 14)
              : next === "bust" ? 6 + Math.floor(random01() * 10)
              : 12 + Math.floor(random01() * 12);
    s.marketCycle = { phase: next, monthsRemaining: dur };
    if (next === "boom") {
      s.marketMod = +(s.marketMod * 1.08).toFixed(3);
      s.demandMod = +(s.demandMod * 1.04).toFixed(3);
      events.push({ t: `📈 KONJUNKTURUPPGÅNG! Fastighetsmarknaden stiger (${dur} mån kvar).`, kind: "income" });
    } else if (next === "bust") {
      s.marketMod = +(s.marketMod * 0.92).toFixed(3);
      s.demandMod = +(s.demandMod * 0.96).toFixed(3);
      events.push({ t: `📉 KONJUNKTURNEDGÅNG! Marknaden sviktar (${dur} mån kvar).`, kind: "warn" });
      // Bubbla som spricker: nedgång i ett uppblåst läge → fullskalig kris.
      // (Lugnt läge: kriser avstängda.)
      if (!s.settings?.calmMode && !s.crisisMonthsLeft && shouldTriggerCrisis(s.marketMod, random01())) {
        s.crisisMonthsLeft = CRISIS_MONTHS;
        events.push({
          t: `🚨 FASTIGHETSKRIS! Bubblan spricker: värden faller, kreditmarknaden stänger och covenants skärps. Den som har kassa köper billigt — den som är belånad kämpar för livet.`,
          kind: "warn",
        });
      }
    } else {
      events.push({ t: `📊 Konjunkturen stabiliseras — stabilt läge (${dur} mån).`, kind: "event" });
    }
  }
  const cyclePhaseNow = s.marketCycle.phase;

  // ── Riksbanken: kvartalsvisa räntebesked ─────────────────────────
  // Styrräntan söker sig i 25-punkterssteg mot ett konjunkturstyrt
  // mål. Räntan andas i fastighetsvärdena (rateValueFactor) och i
  // rivalernas köpaptit – räntebindning blir ett riktigt val.
  if (s.month % 3 === 1) {
    const target = policyRateTarget(cyclePhaseNow);
    const diff = target - s.interestRate;
    if (Math.abs(diff) >= RATE_STEP - 0.001) {
      const step = Math.sign(diff) * RATE_STEP;
      s.interestRate = +(s.interestRate + step).toFixed(2);
      events.push({
        t: `🏛️ Riksbanken ${step > 0 ? "höjer" : "sänker"} styrräntan med 25 punkter till ${s.interestRate.toFixed(2)} % — fastighetsvärdena ${step > 0 ? "pressas" : "lyfts"}.`,
        kind: step > 0 ? "warn" : "income",
      });
    }
  }

  // Decrement recession counter
  if ((s.recessionMonthsLeft ?? 0) > 0) {
    s.recessionMonthsLeft = (s.recessionMonthsLeft ?? 0) - 1;
  }

  // Bond interest payments.
  // OBS: alla poster som bokförs i monthlyNOI får INTE också dras direkt
  // från kassan – hela liggaren appliceras en gång via
  // `s.cash += monthlyNOI - interest` längre ned. (Tidigare drogs dessa
  // kostnader dubbelt och industriintäkter räknades dubbelt.)
  for (const bond of s.bonds ?? []) {
    const bondInterest = Math.round((bond.amount * bond.rate) / 100 / 12);
    monthlyNOI -= bondInterest;
  }
  // Maturing bonds: auto-repay if possible, else penalize
  const nowAbsBond = s.year * 12 + s.month;
  const maturingBonds = (s.bonds ?? []).filter((b) => b.matureAbs <= nowAbsBond);
  for (const bond of maturingBonds) {
    if (s.cash >= bond.amount) {
      cashflow(s, -bond.amount, "obligation återbetald");
      events.push({ t: `🏦 Obligation på ${msek(bond.amount)} återbetalad vid förfall.`, kind: "info" });
    } else {
      s.reputation = Math.max(0, s.reputation - 10);
      cashflow(s, -bond.amount * 0.5, "obligation nödlöst i förtid");
      events.push({ t: `⚠️ Obligation på ${msek(bond.amount)} kunde ej återbetalas! Reputation −10.`, kind: "warn" });
    }
  }
  s.bonds = (s.bonds ?? []).filter((b) => b.matureAbs > nowAbsBond);

  // Fixed rate expiry
  const nowAbs = s.year * 12 + s.month;
  if (s.rateMode === "fixed" && s.fixedUntilAbs && nowAbs >= s.fixedUntilAbs) {
    s.rateMode = "variable";
    s.fixedRate = undefined;
    s.fixedUntilAbs = undefined;
    events.push({ t: "🔓 Fast ränteperiod avslutad – tillbaka till rörlig ränta.", kind: "info" });
  }

  // Revolving credit monthly interest (1.5 % / year on used amount)
  if (s.revolving && s.revolving.used > 0) {
    const revInterest = Math.round((s.revolving.used * 0.015) / 12);
    monthlyNOI -= revInterest;
  }

  // Säsongseffekt på bostäder: högre efterfrågan på sommaren, lägre på vintern.
  const seasonName = seasonOf(s.month);
  const season = seasonName === "sommar" ? 1.08 : seasonName === "vinter" ? 0.94 : 1.0;

  // Organisationens kapacitet: fler självförvaltade hus än kontoret klarar
  // ger administrativ merkostnad (längre ned). Inget extra slitage – att
  // förvalta själv i början är en förväntad del av resan, inte ett straff.
  const orgLoad = orgLoadOf(state);

  // Flyttkedjor: stadens vakansläge styr hur lätt hyresgäster flyttar,
  // och de som lämnar kan dyka upp som sökande hos dina andra hus.
  const moveP = movePressure(cityVacancyRate(s));
  const movers: Tenant[] = [];

  s.portfolio = s.portfolio.map((p) => {
    const np = { ...p };

    // Beställda arbeten tickar (även under bygge): betalda vid beställning,
    // effekten landar här när tiden gått. Hyresgästerna har bott kvar och
    // betalat hyra hela vägen – inget av detta rör status/vakans.
    if ((np.pendingWorks ?? []).length > 0) {
      const stillRunning: typeof np.pendingWorks = [];
      for (const w of np.pendingWorks!) {
        const left = w.monthsLeft - 1;
        if (left > 0) {
          stillRunning!.push({ ...w, monthsLeft: left });
          continue;
        }
        switch (w.kind) {
          case "underhåll":
            np.condition = Math.min(100, np.condition + 15);
            events.push({ t: `🔧 Underhåll klart: ${np.typeLabel} i ${np.districtName} (+15 skick).`, kind: "upg" });
            break;
          case "energi": {
            const CLASSES = ["F", "E", "D", "C", "B", "A"] as const;
            const idx = CLASSES.indexOf((np.energyClass ?? "D") as (typeof CLASSES)[number]);
            if (idx < 5) np.energyClass = CLASSES[idx + 1];
            np.condition = Math.min(100, np.condition + 5);
            np.rentMult = +(np.rentMult * 1.03).toFixed(3);
            events.push({ t: `⚡ Energiuppgradering klar: ${np.typeLabel} i ${np.districtName} → klass ${np.energyClass} (+3 % hyra, +5 skick).`, kind: "upg" });
            break;
          }
          case "uppgradering": {
            const u = UPGRADES.find((x) => x.id === w.upgradeId);
            if (u && !np.upgrades.includes(u.id)) {
              np.upgrades = [...np.upgrades, u.id];
              if (u.rentBoost) np.rentMult *= 1 + u.rentBoost;
              if (u.opexCut) np.opexMult *= 1 - u.opexCut;
              if (u.vacancyCut) np.vacancyMult *= 1 - u.vacancyCut;
              if (u.valueBoost) np.valueMult *= 1 + u.valueBoost;
              if (u.condBoost) np.condition = Math.min(100, np.condition + u.condBoost);
              events.push({ t: `🛠️ ${u.name} klar: ${np.typeLabel} i ${np.districtName}.`, kind: "upg" });
            }
            break;
          }
          case "kampanj": {
            if (np.status === "klar" && !suppressOrganicApplications(s, np)) {
              const slotRent = propPotentialRent(np, s) / Math.max(1, np.capacity) / 12;
              const apps = [0, 1, 2].map(() => makeApplication(np, s, nowAbs, slotRent));
              np.applications = [...(np.applications ?? []), ...apps];
              events.push({ t: `📣 Annonskampanjen gav resultat: 3 nya ansökningar till ${np.typeLabel} i ${np.districtName}.`, kind: "upg" });
            }
            break;
          }
          case "ändrad_användning": {
            const t = w.targetType ? PROP_TYPES[w.targetType] : undefined;
            if (t && w.targetType) {
              const value = propMarketValue(np, s); // före typbytet
              np.type = w.targetType;
              np.typeLabel = t.label;
              np.baseRent = Math.round(value * t.rentFactor * 12);
              np.condition = Math.max(60, np.condition - 10);
              events.push({ t: `🏗️ Ombyggnad klar i ${np.districtName}: nu ${t.label}.`, kind: "upg" });
            }
            break;
          }
        }
      }
      np.pendingWorks = stillRunning;
    }

    // Bygge fortskrider
    if (np.status === "bygger") {
      np.buildLeft -= 1;
      if (np.buildLeft <= 0) {
        np.status = "klar";
        if (np.renovation) {
          // Utvecklingsprojekt färdigt.
          if (np.renovation.kind === "lokalanpassning") {
            const target = np.renovation.targetCapacity ?? np.capacity;
            np.capacity = target;
            events.push({
              t: `🔨 Lokalanpassning klar: ${np.typeLabel} i ${np.districtName} har nu ${target} ${target === 1 ? "stor lokal (premiumhyra +10 %)" : "lokaler"}.`,
              kind: "income",
            });
          } else if (np.renovation.kind === "totalrenovering") {
            np.condition = 100;
            np.energyClass = "A";
            np.rentMult = +(np.rentMult * 1.15).toFixed(3);
            np.builtYear = s.year;
            events.push({
              t: `✨ Totalrenovering klar: ${np.typeLabel} i ${np.districtName} – skick 100, energiklass A, +15 % hyrespotential.`,
              kind: "income",
            });
          } else if (np.renovation.kind === "nybyggnation") {
            // Livscykel: rivet & nybyggt hus – nollställd ålder, större och effektivare.
            np.condition = 100;
            np.energyClass = "A";
            np.builtYear = s.year;
            np.area = Math.round(np.area * 1.15);
            np.capacity = Math.min(np.wholeBlock ? 9 : 4, np.capacity + 1);
            np.valueMult = +(np.valueMult * 1.25).toFixed(3);
            np.baseRent = Math.round(np.baseRent * 1.2);
            np.rentMult = 1;
            np.vacancyMult = Math.max(0.6, np.vacancyMult * 0.8);
            // Nybygget reser sig högre – men bara så högt som distriktets
            // status (investeringstaket) tillåter.
            if ((np.devLevel ?? 0) < maxDevLevel(s, np.district)) np.devLevel = (np.devLevel ?? 0) + 1;
            s.reputation = Math.min(100, s.reputation + 2);
            events.push({
              t: `🏙️ Nybyggnation klar: ${np.typeLabel} i ${np.districtName} ersatte det gamla huset – nollställd ålder, +15 % yta, +1 hyresplats, energiklass A.`,
              kind: "income",
            });
          } else {
            np.area = Math.round(np.area * 1.25);
            np.capacity = Math.min(np.wholeBlock ? 9 : 4, np.capacity + 1);
            np.valueMult = +(np.valueMult * 1.2).toFixed(3);
            np.baseRent = Math.round(np.baseRent * 1.25);
            np.condition = Math.max(85, np.condition);
            // Påbyggnad = fler våningar, upp till distriktets investeringstak.
            if ((np.devLevel ?? 0) < maxDevLevel(s, np.district)) np.devLevel = (np.devLevel ?? 0) + 1;
            events.push({
              t: `🏗️ Påbyggnad klar: ${np.typeLabel} i ${np.districtName} – +25 % yta, +1 hyresplats, +20 % värde.`,
              kind: "income",
            });
          }
          np.renovation = undefined;
          s.reputation = Math.min(100, s.reputation + 3);
        } else {
          np.vacancyMult = Math.max(0.6, np.vacancyMult * 0.80); // nyproducerat: 20 % lägre vakans
          s.reputation = Math.min(100, s.reputation + 5);
          events.push({
            t: `🏗️ Nyproduktion klar: ${np.typeLabel} i ${np.districtName}. Reputation +5.`,
            kind: "income",
          });
        }
      }
      return np;
    }
    // Effektiva förvaltningsinstruktioner: fastighetens EGEN förvaltare går
    // före portföljdirektören – men bara så länge förvaltaren är anställd
    // (avslutas förvaltaren gäller direktörens instruktioner igen).
    const gm = s.globalManager;
    const own = np.managed ? np.managerSettings : undefined;
    const effectiveManaged = np.managed || (gm?.active ?? false);
    const effectiveMaintainThreshold = own?.maintainThreshold ?? gm?.minCondition ?? 45;
    const effectiveRentTargetPct = own?.rentTargetPct ?? gm?.rentTargetPct ?? 1.0;
    // Förvaltare: månadskostnad + auto-underhåll med konfigurerbar tröskel.
    // Beställs som pendingWork precis som manuellt underhåll: betalas nu,
    // +15 skick vid nästa månadsskifte – samma regler oavsett vem som beställer.
    if (effectiveManaged) {
      if (np.managed) {
        // per-property manager fee
        const managerCost = Math.max(2000, Math.round(np.tenants.reduce((a, t) => a + t.rent, 0) * 0.03));
        monthlyNOI -= managerCost;
      }
      if (np.condition < effectiveMaintainThreshold && !pendingWork(np, "underhåll")) {
        const maintainCost = Math.round(propMarketValue(np, s) * 0.02);
        if (s.cash >= maintainCost) {
          monthlyNOI -= maintainCost;
          np.capexTotal = (np.capexTotal ?? 0) + maintainCost;
          np.pendingWorks = [...(np.pendingWorks ?? []), { kind: "underhåll" as const, monthsLeft: 1 }];
          events.push({ t: `🔧 Förvaltaren beställde underhåll av ${np.typeLabel} i ${np.districtName} (tröskel ${effectiveMaintainThreshold}) – +15 skick vid månadsskiftet.`, kind: "upg" });
        }
      }
    }
    // Building age extra wear
    const propAge = s.year - (np.builtYear ?? s.year);
    const ageFactor = propAge >= 30 ? 1.4 : propAge >= 15 ? 1.2 : 1.0;
    // Seasonal effect on vacancy for residential
    const seasonFactor = np.type === "bostad" ? season : 1.0;
    // Short-term rental: higher effective rent but higher vacancy, no tenants
    if (np.shortTerm) {
      const shortRent = Math.round((propPotentialRent(np, s) / np.capacity / 12) * 1.3 * (1 - 0.60 * seasonFactor));
      monthlyNOI += shortRent * np.capacity;
      np.totalEarnedRent = (np.totalEarnedRent ?? 0) + shortRent * np.capacity;
      // Wear is higher with short-term rentals
      np.condition = Math.max(10, np.condition - rnd(0.4, 1.0) * wearMult(s) * ageFactor);
      return np;
    }
    // Slitage (långsammare med smart förvaltning, mer med byggnadsålder)
    np.condition = Math.max(10, np.condition - rnd(0.2, 0.7) * wearMult(s) * ageFactor);
    // Zone change countdown
    if (np.pendingZoneChange) {
      if (np.pendingZoneChange.monthsLeft <= 1) {
        const newType = np.pendingZoneChange.targetType;
        const typeDef = { bostad: "Bostadshus", kontor: "Kontor", butik: "Butik", industri: "Industri/Lager" } as Record<string, string>;
        np.typeLabel = typeDef[newType] ?? newType;
        np.type = newType;
        np.pendingZoneChange = undefined;
        events.push({ t: `✅ Omklassning klar: ${np.districtName} är nu ${typeDef[newType]}.`, kind: "upg" });
      } else {
        np.pendingZoneChange = { ...np.pendingZoneChange, monthsLeft: np.pendingZoneChange.monthsLeft - 1 };
      }
    }
    // Hyresgästlogik
    const slotMarketRent = np.capacity > 0 ? propPotentialRent(np, s) / np.capacity / 12 : 0;
    const nextTenants: typeof np.tenants = [];
    for (const t0 of np.tenants) {
      // Nöjdhet (U3): driftar 20 %/mån mot målet som sätts av skick,
      // hyresläge, distriktets öde och kvartersmixen.
      const sat0 = t0.satisfaction ?? 60;
      const sat = Math.round(sat0 + (satisfactionTarget(t0, np, s, slotMarketRent) - sat0) * 0.2);
      const t = { ...t0, satisfaction: sat };
      // Tenant loyalty: consecutiveMonths halves default risk after 24+ months
      const consMonths = (t.consecutiveMonths ?? 0) + 1;
      const loyaltyFactor = consMonths >= 24 ? 0.5 : 1.0;
      const recFactor = (s.recessionMonthsLeft ?? 0) > 0 ? 2.5 : 1.0;
      // Hyresgästernas livscykel: konkursrisken andas med konjunkturen.
      const cycleRisk = cyclePhaseNow === "bust" ? 1.6 : cyclePhaseNow === "boom" ? 0.6 : 1.0;
      // Seasonal effect on default risk for residential
      const effDefaultRisk = t.defaultRisk * loyaltyFactor * recFactor * cycleRisk * (np.type === "bostad" ? (seasonFactor > 1 ? 0.9 : 1.1) : 1.0);
      if (random01() < effDefaultRisk) {
        const evictionCost = Math.round(t.rent * 2);
        monthlyNOI -= evictionCost;
        events.push({ t: `⚠️ ${t.name} i ${np.districtName} gick i konkurs. Vräkningskostnad: ${kr(evictionCost)}.`, kind: "expense" });
        continue;
      }
      // Livscykel: kommersiella hyresgäster expanderar i högkonjunktur
      // (hyr mer yta, +15 % hyra – en gång per hyresgäst).
      if (cyclePhaseNow === "boom" && np.type !== "bostad" && !t.expanded && random01() < 0.01) {
        t.expanded = true;
        t.rent = Math.round(t.rent * 1.15);
        events.push({ t: `📈 ${t.name} expanderar i ${np.districtName} – hyr mer yta (+15 % hyra).`, kind: "income" });
      }
      // Djupt missnöjda lämnar i förtid (U3) – lättare i löst marknadsläge.
      if (sat < 30 && random01() < 0.06 * moveP) {
        movers.push(t);
        events.push({ t: `😟 ${t.name} lämnade ${np.districtName} i förtid – missnöjd (nöjdhet ${sat}).`, kind: "warn" });
        continue;
      }
      // Anchor tenant designation at 36+ consecutive months
      const isAnchor = consMonths >= 36 || !!t.anchorDeal;
      if (t.monthsLeft <= 1) {
        if (effectiveManaged) {
          const rentTargetPct = effectiveRentTargetPct;
          const marketMo = slotMarketRent;
          const baseRent = Math.round(marketMo * t.quality);
          const targetRent = Math.round(baseRent * rentTargetPct);
          const premiumRatio = targetRent / Math.max(1, baseRent);
          // Nöjda hyresgäster stannar; ankare mest av alla (U3/U5).
          // Flyttkedjor: gott om vakanser i staden → lättare att lämna.
          const satMult = Math.max(0.3, Math.min(1.3, sat / 65));
          const stayMult = Math.max(0.5, Math.min(1.3, 2 - moveP));
          const willStay = premiumRatio <= 1.10 && sat >= 30
            ? true
            : random01() < (isAnchor ? 0.65 : 0.40) * satMult * stayMult;
          if (willStay) {
            const newRent = rentTargetPct < 1.0
              ? Math.min(t.rent, targetRent)
              : Math.max(t.rent, targetRent);
            monthlyNOI += t.rent;
            np.totalEarnedRent = (np.totalEarnedRent ?? 0) + t.rent;
            nextTenants.push({ ...t, monthsLeft: t.termTotal, rent: newRent, consecutiveMonths: consMonths, isAnchor });
            events.push({ t: `📄 Förvaltare förnyade avtal med ${t.name} i ${np.districtName}: ${kr(newRent)}/mån.`, kind: "info" });
          } else {
            movers.push(t);
            events.push({ t: `📄 ${t.name} lämnade ${np.districtName} – för hög hyra vid förlängning.`, kind: "info" });
          }
        } else {
          // Pending renewal: player has one month to decide
          const alreadyPending = (s.pendingRenewals ?? []).some(
            r => r.propertyId === np.id && r.tenantId === t.id,
          );
          if (alreadyPending) {
            events.push({ t: `📄 ${t.name} lämnade ${np.districtName} (kontraktet ej förnyat).`, kind: "info" });
            s.pendingRenewals = (s.pendingRenewals ?? []).filter(
              r => !(r.propertyId === np.id && r.tenantId === t.id),
            );
          } else {
            s.pendingRenewals = [
              ...(s.pendingRenewals ?? []),
              { propertyId: np.id, tenantId: t.id, tenantName: t.name, districtName: np.districtName, currentRent: t.rent, termTotal: t.termTotal },
            ];
            nextTenants.push({ ...t, monthsLeft: 1, consecutiveMonths: consMonths, isAnchor });
            monthlyNOI += t.rent;
            np.totalEarnedRent = (np.totalEarnedRent ?? 0) + t.rent;
            events.push({ t: `⏰ Kontrakt med ${t.name} i ${np.districtName} löper ut — förhandla i Hyresgäster-fliken!`, kind: "warn" });
          }
        }
        continue;
      }
      monthlyNOI += t.rent;
      np.totalEarnedRent = (np.totalEarnedRent ?? 0) + t.rent;
      nextTenants.push({ ...t, monthsLeft: t.monthsLeft - 1, consecutiveMonths: consMonths, isAnchor });
    }
    np.tenants = nextTenants;
    // Delegerad uthyrning: förvaltade fastigheter ELLER bolagspolicyn
    // (kräver portföljdirektör) accepterar bästa ansökan som möter
    // kvalitetskravet. Policyn styr även kontraktspaketet.
    const acceptPol = s.policy?.autoAccept;
    const policyAccept = !!acceptPol?.enabled && !!s.globalManager?.active;
    if ((effectiveManaged || policyAccept) && np.status === "klar" && np.tenants.length < np.capacity) {
      // Kvalitetskrav: policyn → egen förvaltare → direktören → 0.8 som
      // golv (en ensam förvaltare ska inte signera vem som helst).
      const minQuality = policyAccept
        ? acceptPol!.minQuality
        : (own?.minTenantQuality ?? gm?.minTenantQuality ?? 0.8);
      const contractKind = policyAccept ? acceptPol!.contract : "standard";
      const app = bestApplication(np, minQuality);
      if (app && !(contractKind === "ankare" && !app.anchorEligible)) {
        const signed = signContract(app.tenant, contractKind);
        np.tenants = [...np.tenants, signed];
        np.applications = (np.applications ?? []).filter((a) => a.id !== app.id);
        events.push({ t: `👔 ${policyAccept ? "Policyn" : "Förvaltaren"} accepterade ansökan i ${np.typeLabel} ${np.districtName}: ${signed.name}, ${kr(signed.rent)}/mån.`, kind: "info" });
      }
    }
    // Inkorgspolicy: avslå ansökningar under kvalitetsgränsen automatiskt.
    if (s.policy?.rejectBelowQuality && s.globalManager?.active && (np.applications ?? []).length > 0) {
      const kept = (np.applications ?? []).filter((a) => a.tenant.quality >= s.policy!.rejectBelowQuality!);
      if (kept.length !== (np.applications ?? []).length) np.applications = kept;
    }
    // Opex dras alltid
    monthlyNOI -= propAnnualOpex(np, s) / 12;
    return np;
  });

  // ── U1: Ansökningsflödet – pris möter efterfrågan ────────────────
  // Utgångna ansökningar rensas, nya strömmar in beroende på utgångshyra,
  // skick, läge och distriktets öde. Bostadskön fyller reglerade hus direkt.
  {
    const nowAbsApp = s.year * 12 + s.month;
    let queueFilled = 0;
    s.portfolio = s.portfolio.map((p) => {
      if (p.status !== "klar") return p;
      const np = { ...p };
      const free = np.capacity - np.tenants.length;
      // Mäklararvode vid vakans (U8).
      if (np.brokerMandate && free > 0) monthlyNOI -= BROKER_FEE;
      // Bostadskön (U6): fyller alla vakanser direkt till reglerad hyra.
      if (np.regulated && free > 0) {
        const slotRent = propPotentialRent(np, s) / np.capacity / 12; // redan −20 %
        for (let i = 0; i < free; i++) {
          const t = makeTenant(slotRent * 12, s.demandMod, np.condition);
          np.tenants = [...np.tenants, { ...t, rent: Math.round(slotRent * t.quality), satisfaction: 68 }];
          queueFilled += 1;
        }
        return np;
      }
      // Ansökningar in/ut. I storyns kapitel 0–2 hålls morfars hus fritt
      // från slumpsökande – de skriptade ansökningarna äger scenen.
      const apps = (np.applications ?? []).filter((a) => a.expiresAbs > nowAbsApp);
      const rate = suppressOrganicApplications(s, np) ? 0 : applicationRate(np, s, season);
      let n = Math.floor(rate) + (random01() < rate - Math.floor(rate) ? 1 : 0);
      // Inkorgen växer inte i det oändliga.
      n = Math.min(n, Math.max(0, free + 3 - apps.length));
      if (n > 0) {
        const slotRent = np.capacity > 0 ? propPotentialRent(np, s) / np.capacity / 12 : 0;
        for (let i = 0; i < n; i++) apps.push(makeApplication(np, s, nowAbsApp, slotRent));
      }
      if (apps !== np.applications) np.applications = apps;
      return np;
    });
    if (queueFilled > 0)
      events.push({ t: `🏛️ Bostadskön tilldelade ${queueFilled} ${queueFilled === 1 ? "lägenhet" : "lägenheter"} i ditt reglerade bestånd.`, kind: "info" });
    // Goodwill: reglerade bostäder bygger sakta reputation.
    const regulatedCount = s.portfolio.filter((p) => p.regulated && p.status === "klar").length;
    if (regulatedCount > 0)
      s.reputation = Math.min(100, +(s.reputation + Math.min(0.5, regulatedCount * 0.05)).toFixed(2));

    // Flyttkedjor: ~40 % av dem som lämnade söker nytt i staden och
    // kan dyka upp som ansökningar hos dina andra lediga hus.
    if (movers.length > 0) {
      let chained = 0;
      s.portfolio = s.portfolio.map((p) => {
        if (p.status === "klar" && movers.length > 0 && random01() < 0.4) {
          if (suppressOrganicApplications(s, p)) return p;
          const room = p.capacity - p.tenants.length + 3 - (p.applications ?? []).length;
          if (room > 0 && p.capacity > p.tenants.length && !p.regulated) {
            const mover = movers.shift()!;
            chained += 1;
            return {
              ...p,
              applications: [
                ...(p.applications ?? []),
                { id: newId(), tenant: { ...mover, monthsLeft: mover.termTotal }, expiresAbs: nowAbsApp + 2 },
              ],
            };
          }
        }
        return p;
      });
      if (chained > 0)
        events.push({ t: `🔄 Flyttkedja: ${chained} hyresgäst${chained === 1 ? "" : "er"} som lämnat söker nu bland dina lediga lokaler.`, kind: "info" });
    }
  }

  // ── Bolagspolicyn verkställs av cheferna ─────────────────────────
  // Ekonomi kräver CFO, skydd/energi kräver förvaltningschef. Utan rätt
  // chef ligger policyn vilande (syns i Policy-panelen).
  {
    const pol = s.policy;
    const hasCfo = (s.staff?.["cfo"] ?? 0) > 0;
    const hasOps = (s.staff?.["forvaltning"] ?? 0) > 0;
    // CFO: automatisk amortering mot mål-LTV, med bibehållen kassabuffert.
    if (pol?.autoAmort?.enabled && hasCfo && s.debt > 0) {
      const portVal = s.portfolio.reduce((a, p) => a + propMarketValue(p, s), 0);
      const ltv = portVal > 0 ? s.debt / portVal : 0;
      if (ltv > pol.autoAmort.ltvTarget && s.cash > pol.autoAmort.cashFloor) {
        const excess = Math.min(
          s.cash - pol.autoAmort.cashFloor,
          s.debt - pol.autoAmort.ltvTarget * portVal,
        );
        const amort = Math.floor(Math.max(0, excess) / 10_000) * 10_000;
        if (amort >= 50_000) {
          cashflow(s, -amort, "auto-amortering (CFO-policy)");
          s.debt = Math.max(0, s.debt - amort);
          events.push({ t: `💼 CFO-policyn amorterade ${kr(amort)} (mål-LTV ${Math.round(pol.autoAmort.ltvTarget * 100)} %).`, kind: "info" });
        }
      }
    }
    // Förvaltningschef: automatisk försäkring av värdefulla fastigheter.
    if (pol?.autoInsure?.enabled && hasOps) {
      let insured = 0;
      s.portfolio = s.portfolio.map((p) => {
        if (p.status !== "klar" || p.insurance) return p;
        if (propMarketValue(p, s) < pol.autoInsure!.minValue) return p;
        insured += 1;
        return { ...p, insurance: true };
      });
      if (insured > 0)
        events.push({ t: `🛡️ Skyddspolicyn försäkrade ${insured} ${insured === 1 ? "fastighet" : "fastigheter"} över värdegränsen.`, kind: "info" });
    }
    // Förvaltningschef: energiuppgradering mot målklassen (en per månad).
    if (pol?.autoEnergy?.enabled && hasOps && s.cash > pol.autoEnergy.cashFloor) {
      const CLASSES = ["F", "E", "D", "C", "B", "A"] as const;
      const COSTS: Record<string, number> = { F: 80_000, E: 120_000, D: 180_000, C: 250_000, B: 350_000 };
      const targetIdx = CLASSES.indexOf(pol.autoEnergy.targetClass);
      const candidates = s.portfolio
        .filter((p) => p.status === "klar" && CLASSES.indexOf((p.energyClass ?? "D") as (typeof CLASSES)[number]) < targetIdx)
        .sort((a, b) => (COSTS[a.energyClass ?? "D"] ?? 150_000) - (COSTS[b.energyClass ?? "D"] ?? 150_000));
      const target = candidates[0];
      if (target) {
        const cur = (target.energyClass ?? "D") as (typeof CLASSES)[number];
        const cost = COSTS[cur] ?? 150_000;
        if (s.cash - cost > pol.autoEnergy.cashFloor) {
          const nextClass = CLASSES[CLASSES.indexOf(cur) + 1];
          cashflow(s, -cost, "auto-energiuppgradering (policy)");
          s.portfolio = s.portfolio.map((p) =>
            p.id === target.id
              ? { ...p, energyClass: nextClass as typeof p.energyClass, condition: Math.min(100, p.condition + 5), rentMult: +(p.rentMult * 1.03).toFixed(3), capexTotal: (p.capexTotal ?? 0) + cost }
              : p,
          );
          events.push({ t: `⚡ Energipolicyn uppgraderade ${target.typeLabel} i ${target.districtName} till klass ${nextClass} (${kr(cost)}).`, kind: "upg" });
        }
      }
    }
  }

  // Städa förhandlingslistan: behåll bara ärenden där fastigheten fortfarande
  // ägs och hyresgästen fortfarande väntar på besked (monthsLeft ≤ 1).
  // Förnyade, uppsagda eller sålda ärenden försvinner därmed automatiskt.
  if ((s.pendingRenewals ?? []).length > 0) {
    s.pendingRenewals = (s.pendingRenewals ?? []).filter((r) => {
      const prop = s.portfolio.find((p) => p.id === r.propertyId);
      const tenant = prop?.tenants.find((t) => t.id === r.tenantId);
      return !!tenant && tenant.monthsLeft <= 1;
    });
  }

  // Global portföljdirektör: månadsarvode
  if (s.globalManager?.active) {
    const gmCost = 15000 + s.portfolio.length * 1500;
    monthlyNOI -= gmCost;
  }

  // ── Bolagets kontor: overhead och överbelastning ────────────────
  {
    const tier = tierForLevel(s.companyLevel ?? 1);
    if (tier.monthlyOverhead > 0) {
      monthlyNOI -= tier.monthlyOverhead;
      if (s.month % 3 === 0)
        events.push({ t: `🏢 Kontorskostnad (${tier.name}): ${kr(tier.monthlyOverhead)}/mån.`, kind: "expense" });
    }
    if (orgLoad.over > 0) {
      const adminCost = orgLoad.over * OVERLOAD_COST_PER_PROP;
      monthlyNOI -= adminCost;
      if (s.month % 3 === 0) {
        events.push({
          t: `⚠️ Organisationen är överbelastad: ${orgLoad.selfManaged} självförvaltade fastigheter men kapacitet för ${orgLoad.cap}. Merkostnad ${kr(adminCost)}/mån – expandera bolaget eller anlita förvaltare.`,
          kind: "warn",
        });
      }
    }
  }

  // ── Industrisektorer – månadsuppdatering ─────────────────────────────────
  {
    const portfolio = s.industryPortfolio ?? [];
    s.industryPortfolio = portfolio.map((asset) => {
      if (asset.status === "bygger") {
        const newLeft = asset.buildLeft - 1;
        if (newLeft <= 0) {
          events.push({ t: `🏗️ ${asset.name} är färdigbyggd!`, kind: "income" });
          return { ...asset, status: "klar" as const, buildLeft: 0 };
        }
        return { ...asset, buildLeft: newLeft };
      }

      // Skickförsämring
      const wear = wearMult(s);
      const newCond = Math.max(10, asset.condition - rnd(0.15, 0.55) * wear);
      let na = { ...asset, condition: newCond };

      // Sektorspecifik tick
      let revenue = 0;
      let opex = 0;
      let tickEvents: LogEntry[] = [];
      if (na.sector === "hotell")    [revenue, opex, tickEvents] = tickHotel(na, s);
      else if (na.sector === "energi")   [revenue, opex, tickEvents] = tickEnergy(na, s);
      else if (na.sector === "logistik") [revenue, opex, tickEvents] = tickLogistik(na, s);

      const netNOI = revenue - opex;
      monthlyNOI += netNOI;
      na = { ...na, monthlyRevenue: revenue, monthlyOpex: opex, totalRevenue: na.totalRevenue + revenue };
      tickEvents.forEach((e) => events.push(e));

      // Kreditera PPA-kontrakt (dekrementera monthsLeft)
      if (na.sector === "energi" && na.energyMeta) {
        na.energyMeta = {
          ...na.energyMeta,
          ppaContracts: na.energyMeta.ppaContracts
            .map((c) => ({ ...c, monthsLeft: c.monthsLeft - 1 }))
            .filter((c) => c.monthsLeft > 0),
        };
      }

      // Kreditera logistikkontrakt (dekrementera monthsLeft)
      if (na.sector === "logistik" && na.logisticsMeta) {
        na.logisticsMeta = {
          ...na.logisticsMeta,
          throughputContracts: na.logisticsMeta.throughputContracts
            .map((c) => ({ ...c, monthsLeft: c.monthsLeft - 1 }))
            .filter((c) => c.monthsLeft > 0),
        };
      }

      return na;
    });

    // Aggregera ägt MW för energisynergi
    s.energyOwnedMW = s.industryPortfolio
      .filter((a) => a.sector === "energi" && a.status === "klar")
      .reduce((sum, a) => sum + (a.energyMeta?.installedMW ?? 0), 0);

    // hotelKing-scenario: räkna månader med hög OCC på alla hotell
    const hotell = s.industryPortfolio.filter((a) => a.sector === "hotell" && a.status === "klar");
    if (hotell.length > 0) {
      const allAbove80 = hotell.every((a) => (a.hotelMeta?.highOccStreak ?? 0) >= 1);
      s.hotelHighOccConsecutiveMonths = allAbove80
        ? (s.hotelHighOccConsecutiveMonths ?? 0) + 1
        : 0;
    }

    // Hotellsynergi: hotell i centrum/kulle ger reputationsbonus
    const hotelRepBonus = s.industryPortfolio
      .filter((a) => a.sector === "hotell" && a.status === "klar" && (a.district === "centrum" || a.district === "kulle"))
      .reduce((sum, a) => sum + (a.hotelMeta?.starRating ?? 0) * 0.05, 0);
    if (hotelRepBonus > 0) s.reputation = Math.min(100, s.reputation + hotelRepBonus);
  }

  // Insurance monthly cost + catastrophe events
  const insuredProps = s.portfolio.filter((p) => p.insurance && p.status === "klar");
  if (insuredProps.length > 0) {
    // Premium: 0.40 % av marknadsvärde per år (min 2 000 kr/mån per fastighet)
    const insCost = insuredProps.reduce(
      (sum, p) => sum + Math.max(2_000, Math.round((propMarketValue(p, s) * 0.004) / 12)),
      0,
    );
    monthlyNOI -= insCost;
    s.insuranceCost = insCost;
  } else {
    s.insuranceCost = 0;
  }
  // Catastrophe: ~1.5% chance per month affects uninsured properties
  if (random01() < 0.015 && s.portfolio.filter((p) => p.status === "klar").length > 0) {
    const uninsured = s.portfolio.filter((p) => !p.insurance && p.status === "klar");
    if (uninsured.length > 0) {
      const victim = pick(uninsured);
      const damage = Math.round(propMarketValue(victim, s) * 0.08);
      monthlyNOI -= damage;
      s.portfolio = s.portfolio.map((p) =>
        p.id === victim.id ? { ...p, condition: Math.max(10, p.condition - 25) } : p,
      );
      events.push({ t: `🔥 Skadehändelse: ${victim.typeLabel} i ${victim.districtName} drabbades (${kr(damage)} i skadekostnader). Teckning av försäkring rekommenderas!`, kind: "warn" });
    }
  }

  // CPI rent indexing at start of each year (month === 1)
  if (s.month === 1 && s.year > 1) {
    const cpiRate = 0.02; // 2 % per år
    let indexCount = 0;
    s.portfolio = s.portfolio.map((p) => ({
      ...p,
      tenants: p.tenants.map((t) => {
        indexCount++;
        return { ...t, rent: Math.round(t.rent * (1 + cpiRate)) };
      }),
    }));
    if (indexCount > 0)
      events.push({ t: `📊 Hyresindex: alla hyror justerade +2 % (KPI-indexering, ${indexCount} kontrakt).`, kind: "income" });
  }

  const effectiveRate = (s.rateMode === "fixed" && s.fixedRate != null) ? s.fixedRate : loanTerms(s).rate;
  const interest = (s.debt * (effectiveRate / 100)) / 12;
  cashflow(s, monthlyNOI - interest, "månadens driftnetto minus ränta");

  // Monthly property tax (22% of positive net income, offset by depreciation + ESG class A bonus)
  {
    const netIncome = monthlyNOI - interest;
    if (netIncome > 0) {
      // Avskrivning 1,3 %/år (var 2 %): 2 %-skölden åt upp nästan hela det
      // skattepliktiga nettot, så effektiv fastighetsskatt låg nära noll.
      const monthlyDepreciation = s.portfolio.reduce((sum, p) => {
        if (p.status !== "klar") return sum;
        return sum + ((p.purchasePrice ?? p.askPrice) * 0.013) / 12;
      }, 0);
      const taxableIncome = Math.max(0, netIncome - monthlyDepreciation);
      const energyACount = s.portfolio.filter(p => p.energyClass === "A" && p.status === "klar").length;
      const taxRate = Math.max(0.10, 0.22 - (energyACount > 0 ? 0.03 : 0));
      const monthlyTax = Math.round(taxableIncome * taxRate);
      if (monthlyTax > 0) {
        cashflow(s, -monthlyTax, "fastighetsskatt");
        s.totalTaxPaid = (s.totalTaxPaid ?? 0) + monthlyTax;
        if (s.month % 3 === 0) {
          events.push({ t: `🏛️ Fastighetsskatt: ${kr(monthlyTax)}/mån (avdrag ${kr(Math.round(monthlyDepreciation))}/mån, skattesats ${Math.round(taxRate * 100)} %).`, kind: "expense" });
        }
      }
    }
  }

  // LTV-covenant (gäller från år 2): banken straffar överkreditering
  if (s.year > 1 && s.debt > 0) {
    const portfolioVal = s.portfolio.reduce((a, p) => a + propMarketValue(p, s), 0);
    if (portfolioVal > 0) {
      const ltv = s.debt / portfolioVal;
      if (ltv > 0.85) {
        const penalty = Math.round((s.debt * 0.015) / 12);
        cashflow(s, -penalty, "vite");
        monthlyNOI -= penalty;
        s.reputation = Math.max(0, s.reputation - 1);
        events.push({ t: `🏦 LTV-VARNING: Skuldkvot ${Math.round(ltv * 100)} % överstiger 85 %! Bankavgift ${kr(penalty)}/mån (rep −1).`, kind: "warn" });
      } else if (ltv > 0.75) {
        const surcharge = Math.round((s.debt * 0.005) / 12);
        cashflow(s, -surcharge, "straffavgift");
        monthlyNOI -= surcharge;
        events.push({ t: `⚠️ Skuldkvot ${Math.round(ltv * 100)} % (gräns 75 %) — räntepåslag ${kr(surcharge)}/mån.`, kind: "expense" });
      }
    }
  }

  // Amorteringskrav i trappa (jfr svenska regler) – formeln delas med
  // Finans-panelen via amortInfoOf. Amortering är ingen kostnad – skuld
  // växlas mot eget kapital – så den rör bara kassan/skulden.
  if (s.debt > 0) {
    const ai = amortInfoOf(s);
    if (ai.monthly > 0) {
      cashflow(s, -ai.monthly, "auto-försäkring (policy)");
      s.debt = Math.max(0, s.debt - ai.monthly);
      if (s.month % 3 === 0) {
        events.push({
          t: `🏦 Amorteringskrav: ${kr(ai.monthly)}/mån (${ai.yearlyPct * 100} % av skulden/år vid LTV ${Math.round(ai.ltv * 100)} %). Amorteringsfritt under 50 % LTV.`,
          kind: "expense",
        });
      }
    }
  }

  // Makrohändelse (lugnt läge: avstängt)
  if (!s.settings?.calmMode && random01() < 0.35) {
    const ev = pick(EVENTS);
    s = ev.apply(s);
    events.push({ t: `📰 ${ev.text}`, kind: "event" });
  }
  // Sällsynt chockhändelse (~3 % per månad; lågkonjunkturer startar här)
  if (!s.settings?.calmMode && random01() < 0.03) {
    const ev = pick(RARE_EVENTS);
    s = ev.apply(s);
    events.push({ t: `🚨 ${ev.text}`, kind: "warn" });
  }

  // ── Politiska val var 4:e år (absolut månad % 48 === 0) ────────
  {
    const absM = s.year * 12 + s.month;
    if (absM % 48 === 0) {
      const party = pick(POLITICAL_PARTIES);
      s = party.apply(s);
      s.electionResult = party.name;
      events.push({ t: `🗳️ KOMMUNALVAL: ${party.name} vann. ${party.desc}`, kind: "warn" });
    }
  }

  // ── Distressed competitor sales ─────────────────────────────────
  for (const comp of s.competitors) {
    if (comp.cash < 0 && (comp.portfolio ?? []).length > 0 && random01() < 0.30) {
      const selling = comp.portfolio[Math.floor(random01() * comp.portfolio.length)];
      const distressedPrice = Math.round(selling.askPrice * rnd(0.75, 0.88));
      const born = s.year * 12 + s.month;
      s.listings = [
        ...s.listings,
        { ...selling, owned: false, askPrice: distressedPrice, listedMonth: born, expiresMonth: born + 2, poolAskPrice: undefined, poolBaseRent: undefined },
      ];
      s.competitors = s.competitors.map((c) =>
        c.name === comp.name ? { ...c, portfolio: c.portfolio.filter((p) => p.id !== selling.id) } : c,
      );
      events.push({ t: `🚨 Nödförsäljning! ${comp.name} tvingas sälja ${selling.typeLabel} i ${selling.districtName} för ${msek(distressedPrice)} (−${Math.round((1 - distressedPrice / selling.askPrice) * 100)} %).`, kind: "warn" });
    }
  }

  // ── Rivalrace: beräkna ledande rivals framsteg ──────────────────
  const leadRival = s.scenarioId && s.scenarioId !== "sandbox" && s.competitors.length > 0
    ? s.competitors.reduce(
        (best, c) =>
          rivalScenarioProgress(c, s.scenarioId!, s) > rivalScenarioProgress(best, s.scenarioId!, s)
            ? c : best,
        s.competitors[0],
      )
    : null;
  const leadProgress = leadRival && s.scenarioId
    ? rivalScenarioProgress(leadRival, s.scenarioId, s) : 0;
  const rivalIsClose = leadProgress > 0.75; // rival within striking distance

  // ── Competing bid on active listing (~12 % chans/mån) ──────────
  if (!s.competingBid && s.competitors.length > 0 && s.listings.length > 0 && random01() < (rivalIsClose ? 0.28 : 0.12)) {
    const target = pick(s.listings.filter((p) => p.status === "klar"));
    if (target) {
      const rival = pick(s.competitors);
      const amount = Math.round(target.askPrice * rnd(1.02, 1.15));
      const absNow = s.year * 12 + s.month;
      s.competingBid = { listingId: target.id, rivalName: rival.name, amount, expiresAbs: absNow + 1, round: 1 };
      const q = rivalQuote(rival.name, "budkrig", absNow);
      events.push({ t: `⚡ BUDGIVNING: ${rival.name} lade ${msek(amount)} på ${target.typeLabel} i ${target.districtName}!${q ? " " + q : ""} Slå budet eller låt dem köpa.`, kind: "warn" });
    }
  } else if (s.competingBid) {
    // Expire competing bid and let rival buy
    const absNow = s.year * 12 + s.month;
    if (absNow > s.competingBid.expiresAbs) {
      const listing = s.listings.find((p) => p.id === s.competingBid!.listingId);
      if (listing) {
        s.listings = s.listings.filter((p) => p.id !== listing.id);
        s.competitors = s.competitors.map((c) =>
          c.name === s.competingBid!.rivalName
            ? { ...c, portfolio: [...(c.portfolio ?? []), listing], units: (c.portfolio ?? []).length + 1 }
            : c,
        );
        const vq = rivalQuote(s.competingBid.rivalName, "vinst", absNow);
        events.push({ t: `🏢 ${s.competingBid.rivalName} köpte ${listing.typeLabel} i ${listing.districtName} för ${msek(s.competingBid.amount)}.${vq ? " " + vq : ""}`, kind: "event" });
      }
      s.competingBid = undefined;
    }
  }

  // ── Rival merger (~2 % chans/mån) ──────────────────────────────
  // Fusioner är numera sällsynta (0,4 %/mån) och sker bara medan det finns gott
  // om aktörer (≥4) – då köper den STARKASTE upp den svagaste. Det håller
  // marknaden mångfaldig i stället för att kollapsa till en enda jätte.
  if (s.competitors.length >= 4 && random01() < 0.004) {
    const ranked = s.competitors.map((c, i) => ({ c, i })).sort((a, b) => a.c.equity - b.c.equity);
    const weakest = ranked[0];       // köps upp
    const buyer = ranked[ranked.length - 1]; // köper
    const ca = buyer.c, cb = weakest.c;
    const merged = {
      ...ca,
      cash: ca.cash + cb.cash,
      portfolio: [...(ca.portfolio ?? []), ...(cb.portfolio ?? [])],
      industries: [...(ca.industries ?? []), ...(cb.industries ?? [])],
      units: (ca.portfolio ?? []).length + (cb.portfolio ?? []).length,
      equity: ca.equity + cb.equity,
      monthlyNOI: (ca.monthlyNOI ?? 0) + (cb.monthlyNOI ?? 0),
    };
    s.competitors = s.competitors.filter((_, i) => i !== buyer.i && i !== weakest.i);
    s.competitors = [...s.competitors, merged];
    const fq = rivalQuote(ca.name, "fusion", s.month);
    events.push({ t: `🤝 FÖRVÄRV: ${ca.name} köper upp krisande ${cb.name}.${fq ? " " + fq : ""}`, kind: "warn" });
    // Det uppköpta bolagets aktie avnoteras: spelarens innehav löses ut
    // till kurs och ev. blankning stängs – annars blir aktien ett zombie-
    // papper utan bolag bakom som driver på ren slump.
    const bStock = s.stocks.find((st) => st.competitorName === cb.name);
    if (bStock) {
      let payout = Math.round(bStock.owned * bStock.price);
      if ((bStock.shortQty ?? 0) > 0) {
        const avg = bStock.shortAvgPrice ?? bStock.price;
        payout += Math.max(0, Math.round(avg * bStock.shortQty! * 1.5) + Math.round(bStock.shortQty! * (avg - bStock.price)));
      }
      if (payout > 0) {
        cashflow(s, payout, "aktieutbetalning vid fusion/avnotering");
        events.push({ t: `💰 Uppköpet löste ut din position i ${cb.name}: +${msek(payout)}.`, kind: "sell" });
      }
      s.stocks = s.stocks.filter((st) => st.id !== bStock.id);
      s.stockOrders = (s.stockOrders ?? []).filter((o) => o.stockId !== bStock.id);
    }
  }

  // ── Stadshändelser: mässa, festival, strejk, elkris ─────────────
  tickCityEvent(s, events);

  // ── Lokala distriktshändelser (~8 % chans/distrikt/mån) ─────────
  if (!s.settings?.calmMode && random01() < 0.08) {
    const ev = DISTRICT_EVENTS[Math.floor(random01() * DISTRICT_EVENTS.length)];
    s = ev.apply(s);
    events.push({ t: `🏘️ Lokalt: ${ev.text}`, kind: "event" });
  }

  // ── Kommunala infrastrukturprojekt ───────────────────────────────
  // Fleråriga byggen som annonseras vid byggstart och permanent lyfter
  // distriktets områdesutveckling vid invigningen – läs tidningen och
  // köp i distriktet innan spårvägen står klar.
  {
    const done: InfraProject[] = [];
    s.infraProjects = (s.infraProjects ?? [])
      .map((pr) => ({ ...pr, monthsLeft: pr.monthsLeft - 1 }))
      .filter((pr) => {
        if (pr.monthsLeft <= 0) {
          done.push(pr);
          return false;
        }
        return true;
      });
    for (const pr of done) {
      s.districtDev = {
        ...(s.districtDev ?? {}),
        [pr.district]: +(((s.districtDev?.[pr.district] ?? 1) + pr.boost).toFixed(3)),
      };
      events.push({
        t: `🎉 INVIGT: ${pr.name} i ${pr.districtName} står klar — området lyfter (+${Math.round(pr.boost * 100)} % områdesutveckling).`,
        kind: "event",
      });
    }
    if ((s.infraProjects ?? []).length === 0 && random01() < 0.015) {
      const kind = pick(INFRA_KINDS);
      const d = pick(DISTRICTS);
      const months = kind.months[0] + Math.floor(random01() * (kind.months[1] - kind.months[0] + 1));
      const boost = +(kind.boost[0] + random01() * (kind.boost[1] - kind.boost[0])).toFixed(3);
      s.infraProjects = [
        { id: newId(), name: kind.name, district: d.id, districtName: d.name, monthsLeft: months, totalMonths: months, boost },
      ];
      events.push({
        t: `🏛️ BYGGSTART: Kommunen bygger ${kind.name.toLowerCase()} i ${d.name} — klart om ~${months} mån. Läget väntas lyfta rejält.`,
        kind: "event",
      });
    }
  }

  // ── Slutspelet: kapitalet slår tillbaka ──────────────────────────
  {
    const eq = equityOf(s);

    // A1 · Institutionella fonder kliver in när spelaren drar ifrån.
    if (eq > FUND_TRIGGER_EQUITY && !fundsActive(s)) {
      const warChest = Math.round(eq * 0.9);
      s.competitors = [
        ...s.competitors,
        ...FUNDS.map((f) => ({
          name: f.name,
          cash: warChest,
          units: 0,
          equity: warChest,
          portfolio: [],
          strategy: f.strategy,
          institutional: true,
        })),
      ];
      events.push({
        t: `🌐 INTERNATIONELLT KAPITAL: ${FUNDS.map((f) => f.name).join(" och ")} etablerar sig i staden med miljardkassor. De bjuder på allt — och de har djupare fickor än banken trodde.`,
        kind: "warn",
      });
    }
    // Fonderna hålls kapitaliserade i nivå med spelaren (rubber band).
    s.competitors = s.competitors.map((c) => {
      if (!c.institutional || c.cash >= eq * 0.4) return c;
      const injection = Math.round(eq * 0.5);
      events.push({ t: `🌐 ${c.name} tar in nytt kapital: +${msek(injection)} från moderfonden.`, kind: "event" });
      return { ...c, cash: c.cash + injection };
    });

    // A2/A3 · Aktivistfonden: efter börsnoteringen straffas död kassa
    // och svag avkastning. Utdelningar (PAY_DIVIDEND) lindrar.
    if (s.ipoActive && !s.gameOver) {
      const annualReturn = (monthlyNOI - interest) * 12;
      const tick = activistTick(s.cash, eq, annualReturn);
      const before = s.takeoverPressure ?? 0;
      s.takeoverPressure = Math.max(0, Math.min(100, before + tick.delta));
      const stake = s.takeoverPressure;
      if (tick.delta > 0 && tick.reason && Math.floor(stake / 10) > Math.floor(before / 10)) {
        events.push({
          t: `🦈 Aktivistfonden Kronfelt Capital äger nu ${Math.round(stake)} % av bolaget (${tick.reason}). Dela ut vinst eller höj avkastningen — vid ${ACTIVIST_TAKEOVER_AT} % tar de över.`,
          kind: "warn",
        });
      }
      if (stake >= ACTIVIST_TAKEOVER_AT) {
        s.gameOver = true;
        events.push({
          t: `🦈 FIENTLIGT ÖVERTAGANDE: Kronfelt Capital når ${ACTIVIST_TAKEOVER_AT} % och röstar bort dig från styrelsen. Imperiet är inte längre ditt.`,
          kind: "warn",
        });
      }
    }

    // B5 · Fastighetskrisen: värdefall följt av långsam återhämtning.
    if ((s.crisisMonthsLeft ?? 0) > 0) {
      const left = s.crisisMonthsLeft!;
      if (left > CRISIS_MONTHS / 2) {
        s.marketMod = +(s.marketMod * 0.972).toFixed(3);
        if (s.month % 2 === 0)
          events.push({ t: `🚨 Krisen fördjupas: fastighetsvärdena faller (marknadsläge ${Math.round(s.marketMod * 100)} %). ${Math.ceil(left)} mån kvar.`, kind: "warn" });
      } else {
        s.marketMod = +(s.marketMod * 1.012).toFixed(3);
      }
      s.crisisMonthsLeft = left - 1;
      if (s.crisisMonthsLeft === 0)
        events.push({ t: `🌅 Krisen är över — kreditmarknaden öppnar igen och priserna bottnar ur. Nu byggs nästa cykel.`, kind: "event" });
    }

    // B4 · Konkurrensverket: tillsyn och tvångsreglering vid dominans.
    {
      let supervised = 0;
      for (const d of DISTRICTS) {
        if (districtShareOf(s, d.id) >= DOMINANCE_SUPERVISED_SHARE) {
          supervised += 1;
          if (random01() < 0.02) {
            const target = s.portfolio.find(
              (p) => p.district === d.id && p.status === "klar" && p.type === "bostad" && !p.regulated,
            );
            if (target) {
              s.portfolio = s.portfolio.map((p) => (p.id === target.id ? { ...p, regulated: true } : p));
              events.push({
                t: `⚖️ KONKURRENSVERKET: Din dominans i ${d.name} leder till tvångsreglering av ${target.typeLabel} (hyra −20 %, bostadskön tar över).`,
                kind: "warn",
              });
            }
          }
        }
      }
      if (supervised > 0) {
        // Efter kassaflödesappliceringen → dras direkt ur kassan.
        cashflow(s, -supervised * SUPERVISION_FEE, "tillsynsavgift");
        if (s.month % 3 === 0)
          events.push({ t: `⚖️ Tillsynsavgift: ${kr(supervised * SUPERVISION_FEE)}/mån (dominans i ${supervised} distrikt).`, kind: "expense" });
      }
    }

    // C6 · Megaprojekt tickar och invigs.
    if ((s.megaActive ?? []).length > 0) {
      const doneMega: NonNullable<GameState["megaActive"]> = [];
      s.megaActive = (s.megaActive ?? [])
        .map((m) => ({ ...m, monthsLeft: m.monthsLeft - 1 }))
        .filter((m) => {
          if (m.monthsLeft <= 0) {
            doneMega.push(m);
            return false;
          }
          return true;
        });
      for (const m of doneMega) {
        const proj = MEGA_PROJECTS.find((x) => x.id === m.projectId)!;
        s.megaCompleted = [...(s.megaCompleted ?? []), proj.id];
        s.districtDev = {
          ...(s.districtDev ?? {}),
          [m.district]: +(((s.districtDev?.[m.district] ?? 1) + proj.devBoost).toFixed(3)),
        };
        s.reputation = Math.min(100, s.reputation + proj.reputation);
        events.push({
          t: `${proj.icon} INVIGNING: ${proj.name} står klar! Hela staden firar — området lyfter och ditt namn skrivs in i historien.`,
          kind: "event",
        });
      }
    }

    // Stadsdelsprojekt tickar och invigs: kvarteret blir EN signaturfastighet
    // och distriktet lyfts permanent.
    if ((s.cityProjects ?? []).length > 0) {
      const doneProjects: NonNullable<GameState["cityProjects"]> = [];
      s.cityProjects = (s.cityProjects ?? [])
        .map((m) => ({ ...m, monthsLeft: m.monthsLeft - 1 }))
        .filter((m) => {
          if (m.monthsLeft <= 0) {
            doneProjects.push(m);
            return false;
          }
          return true;
        });
      for (const m of doneProjects) {
        const profile = cityProfileById(m.profile)!;
        const info = blockInfo(m.blockId)!;
        const area = signatureArea(m.blockId, profile);
        const d = DISTRICTS.find((x) => x.id === m.district)!;
        // Kvarterets mittersta tomt bär fastigheten (3D:n ritar hela kvarteret).
        const cx = info.parcels.reduce((a, p) => a + p.x, 0) / info.parcels.length;
        const cz = info.parcels.reduce((a, p) => a + p.z, 0) / info.parcels.length;
        const center = info.parcels.reduce((a, p) =>
          Math.hypot(p.x - cx, p.z - cz) < Math.hypot(a.x - cx, a.z - cz) ? p : a,
        );
        s.portfolio = [
          ...s.portfolio,
          {
            id: newId(),
            district: m.district,
            districtName: d.name,
            type: profile.type,
            typeLabel: `Signaturkvarter · ${profile.name}`,
            area,
            condition: 100,
            askPrice: Math.round(m.cost * 1.05),
            baseRent: Math.round(m.cost * profile.yieldOnCost),
            purchasePrice: m.cost,
            upgrades: [],
            owned: true,
            rentMult: 1,
            opexMult: 1,
            vacancyMult: 1,
            valueMult: 1,
            tenants: [],
            capacity: Math.min(9, Math.floor(area / 4000) + 4),
            status: "klar",
            buildLeft: 0,
            parcelId: center.id,
            energyClass: "A",
            builtYear: s.year,
            wholeBlock: true,
            signature: profile.id,
            txHistory: [{ type: "nybygg", price: m.cost, month: s.month, year: s.year, party: "Spelaren (stadsdelsprojekt)" }],
          },
        ];
        s.signatureBlocks = [...(s.signatureBlocks ?? []), { blockId: m.blockId, profile: profile.id }];
        s.districtDev = {
          ...(s.districtDev ?? {}),
          [m.district]: +(((s.districtDev?.[m.district] ?? 1) + profile.devBoost).toFixed(3)),
        };
        s.reputation = Math.min(100, s.reputation + profile.reputation);
        events.push({
          t: `${profile.icon} INVIGNING: Signaturkvarteret ${profile.name} i ${d.name} står klart! ${Math.round(area / 1000)} tusen m² slår upp portarna, hela distriktet lyfter och stadens siluett är för alltid förändrad.`,
          kind: "event",
        });
      }
    }
  }

  // ── Egen detaljplan: processerna tickar genom samråd/granskning ──
  if ((s.planProcesses ?? []).length > 0) {
    const remaining: NonNullable<GameState["planProcesses"]> = [];
    for (const proc of s.planProcesses ?? []) {
      // Ett beslut i taget: väntande beslut pausar övriga processer.
      if (s.pendingDecision) {
        remaining.push(proc);
        continue;
      }
      const res = planTick(proc, s, random01);
      if (res.cost > 0) cashflow(s, -res.cost, "detaljplanekostnad");
      events.push(...res.events);
      if (res.decision) s.pendingDecision = res.decision;
      if (!res.done) {
        remaining.push(res.proc);
        continue;
      }
      // Laga kraft: kvarteret öppnas, parktomter undantas och de
      // byggklara tomterna blir spelarens (bokförda till nedlagd kostnad).
      const park = res.proc.parkParcels ?? [];
      s.unlockedBlocks = [...(s.unlockedBlocks ?? []), proc.blockId];
      s.parkParcels = [...(s.parkParcels ?? []), ...park];
      s.ownedPlanAreas = (s.ownedPlanAreas ?? []).filter((b) => b !== proc.blockId);
      const parcels = PARCELS.filter((pc) => pc.blockId === proc.blockId && !park.includes(pc.id));
      const bookValue = res.proc.spent + rawLandPrice(proc.blockId, s);
      const perLot = Math.round(bookValue / Math.max(1, parcels.length));
      const born = s.year * 12 + s.month;
      s.lots = [
        ...s.lots,
        ...parcels.map((pc) => ({
          id: newId(),
          district: proc.district,
          districtName: proc.districtName,
          parcelId: pc.id,
          area: Math.round(pc.w * pc.d * 2),
          price: perLot,
          owned: true,
          listedMonth: born,
        })),
      ];
      s.reputation = Math.min(100, s.reputation + 2);
    }
    s.planProcesses = remaining;
  }

  // ── AI-konkurrenter agerar (riktiga portföljer + personligheter) ─
  // Rivalernas ekonomi värderas med samma formel som spelarens och
  // andas därmed med konjunktur, distriktutveckling och marknadsläge.
  const cyclePhase = s.marketCycle?.phase ?? "stable";
  const spaceDistricts = districtsWithSpace(s);
  // Markbudget för HELA månaden: allt nytt (rivalbyggen, avslöjade annonser,
  // nya tomter) måste rymmas i den realistiska tomtpoolen – inget ägande får
  // hamna utanför kartan. Räknas ned för varje objekt som tar en ledig ruta.
  let landBudget = emptyParcels(s).length;
  const cycleNOI = cyclePhase === "boom" ? 1.10 : cyclePhase === "bust" ? 0.88 : 1.0;
  s.competitors = s.competitors.map((c) => {
    const nc = { ...c, portfolio: [...(c.portfolio ?? [])] };
    const portVal = nc.portfolio.reduce((a, p) => a + propMarketValue(p, s), 0);
    nc.monthlyNOI = Math.round((portVal * 0.06 * cycleNOI) / 12);
    rivalCashflow(nc, nc.monthlyNOI);
    // Rivalernas byggen tickar och färdigställs (kranar på kartan).
    let finishedBuild: string | null = null;
    nc.portfolio = nc.portfolio.map((p) => {
      if (p.status !== "bygger") return p;
      if (p.buildLeft <= 1) {
        finishedBuild = `${p.typeLabel} i ${p.districtName}`;
        return { ...p, status: "klar" as const, buildLeft: 0 };
      }
      return { ...p, buildLeft: p.buildLeft - 1 };
    });
    if (finishedBuild)
      events.push({ t: `🏢 ${nc.name} färdigställde sitt nybygge: ${finishedBuild}.`, kind: "event" });
    // Nybyggnation: kapitalstarka bolag bygger i sina distrikt när det
    // inte är lågkonjunktur – staden växer även utan spelaren.
    const buildChance = nc.strategy === "tillväxt" ? 0.05 : 0.02;
    // Bygg BARA om det finns en ledig tomtruta kvar i budgeten – annars skulle
    // huset hamna utanför kartan (spökägande). Full stad = ingen nyproduktion.
    if (landBudget > 0 && spaceDistricts.size > 0 && cyclePhase !== "bust" && nc.cash > 8_000_000 && random01() < buildChance * rateAppetite(s.interestRate)) {
      // Bygg bara där det finns obebyggd mark – inga hus trängs undan.
      const build = genWorldProperty(s, spaceDistricts);
      const district =
        nc.preferredDistrict && spaceDistricts.has(nc.preferredDistrict)
          ? nc.preferredDistrict
          : build.district;
      const dObj = DISTRICTS.find((d) => d.id === district);
      const cost = Math.round(build.askPrice * 0.85);
      if (nc.cash >= cost) {
        rivalCashflow(nc, -cost);
        nc.portfolio.push({
          ...build,
          district,
          districtName: dObj?.name ?? build.districtName,
          tenants: [],
          status: "bygger",
          buildLeft: PROP_TYPES[build.type].buildMonths,
          parcelId: undefined,
          purchasePrice: cost,
        });
        landBudget -= 1; // rutan är nu ianspråktagen
        events.push({ t: `🏗️ ${nc.name} bygger nytt: ${build.typeLabel} i ${dObj?.name ?? build.districtName} (${msek(cost)}).`, kind: "event" });
      }
    }
    // Investeringsdriven mognad (Fas 2): kapitalstarka rivaler bygger PÅ sina
    // egna hus i heta distrikt (uppåtgående/exklusivt) – deras hus reser sig på
    // kartan, upp till distriktets investeringstak. Stadens skyline mognar
    // därmed av faktiska investeringar, inte av sig själv.
    if (cyclePhase !== "bust" && nc.cash > 5_000_000 && random01() < 0.035 * rateAppetite(s.interestRate)) {
      const idx = nc.portfolio.findIndex((p) => {
        if (p.status !== "klar") return false;
        const tier = tierOfDev(s.districtDev?.[p.district] ?? 1).id;
        return (tier === "uppatgaende" || tier === "exklusivt") && (p.devLevel ?? 0) < maxDevLevel(s, p.district);
      });
      if (idx >= 0) {
        const p = nc.portfolio[idx];
        const cost = Math.round(propMarketValue(p, s) * 0.3);
        if (nc.cash >= cost) {
          rivalCashflow(nc, -cost);
          nc.portfolio[idx] = {
            ...p,
            devLevel: (p.devLevel ?? 0) + 1,
            area: Math.round(p.area * 1.2),
            valueMult: +(p.valueMult * 1.15).toFixed(3),
            capacity: Math.min(p.wholeBlock ? 9 : 4, p.capacity + 1),
            condition: Math.max(85, p.condition),
          };
          events.push({ t: `🏗️ ${nc.name} bygger på sitt hus i ${p.districtName} — kvarteret reser sig.`, kind: "event" });
        }
      }
    }
    // Strategisk försäljning: motivdriven (renodling, renoveringsobjekt,
    // vinsthemtagning i boom) – annonseras öppet så att spelaren och
    // andra rivaler konkurrerar om samma objekt.
    if (random01() < rivalSellChance(nc, cyclePhase as "boom" | "bust" | "stable")) {
      const sale = pickStrategicSale(nc, s, cyclePhase as "boom" | "bust" | "stable");
      if (sale) {
        const selling = nc.portfolio.splice(sale.index, 1)[0];
        rivalCashflow(nc, sale.price);
        const born = s.year * 12 + s.month;
        s.listings = [
          ...s.listings,
          {
            ...selling,
            owned: false,
            askPrice: sale.price,
            listedMonth: born,
            expiresMonth: born + 3 + Math.floor(random01() * 2),
            poolAskPrice: undefined,
            poolBaseRent: undefined,
          },
        ];
        events.push({ t: `🏷️ ${c.name} ${sale.motive}: ${selling.typeLabel} i ${selling.districtName} till salu (${msek(sale.price)}).`, kind: "event" });
      }
    }
    nc.units = nc.portfolio.length;
    // Rivalens industrier tjänar pengar och ingår i det egna kapitalet –
    // samma NOI-logik som spelarens (6 %/år på tillgångsvärdet, förenklat).
    const indVal = (nc.industries ?? []).reduce((a, x) => a + industryAssetValue(x, s), 0);
    if (indVal > 0) rivalCashflow(nc, Math.round((indVal * 0.06 * cycleNOI) / 12));
    nc.equity = nc.cash + indVal + nc.portfolio.reduce((a, p) => a + propMarketValue(p, s), 0);
    return nc;
  });
  // ── Rivalerna konkurrerar om industriobjekten (~5 %/mån) ─────────
  if ((s.industryListings ?? []).length > 0 && s.competitors.length > 0 && random01() < 0.05) {
    const target = pick(s.industryListings!);
    const buyers = s.competitors.filter((c) => c.cash > target.purchasePrice * 1.05);
    if (buyers.length > 0) {
      const buyer = pick(buyers);
      s.industryListings = (s.industryListings ?? []).filter((a) => a.id !== target.id);
      s.competitors = s.competitors.map((c) =>
        c.name === buyer.name
          ? { ...c, cash: c.cash - target.purchasePrice, industries: [...(c.industries ?? []), target] }
          : c,
      );
      const iq = rivalQuote(buyer.name, "industri", s.month);
      events.push({
        t: `🏭 ${buyer.name} förvärvar ${target.name} (${msek(target.purchasePrice)}) – industrimarknaden är inte längre din ensam.${iq ? " " + iq : ""}`,
        kind: "warn",
      });
    }
  }
  // Påfyllnad: nya industriobjekt när marknaden sinar (unika verksamheter –
  // en stad har bara ett Grand Kulle Hotel).
  if ((s.industryListings ?? []).length < 3 && random01() < 0.10) {
    const existing = new Set([
      ...(s.industryListings ?? []).map((a) => a.name),
      ...(s.industryPortfolio ?? []).map((a) => a.name),
      ...s.competitors.flatMap((c) => (c.industries ?? []).map((a) => a.name)),
    ]);
    const fresh = INDUSTRY_TEMPLATES.filter((t) => !existing.has(t.name));
    if (fresh.length > 0) {
      const asset = makeIndustryAssetFromTemplate(pick(fresh), newId(), s);
      s.industryListings = [...(s.industryListings ?? []), asset];
      events.push({ t: `🏭 Ny industri till salu: ${asset.name} (${msek(asset.purchasePrice)}).`, kind: "info" });
    }
  }
  // Konkurrent köper från marknaden med strategi-filtrering – även
  // objekt som andra rivaler just annonserat (rival-till-rival-affärer).
  // Köpaptiten följer räntan: billiga pengar → fler affärer.
  if (s.competitors.length > 0 && s.listings.length > 1 && random01() < (rivalIsClose ? 0.55 : 0.25) * rateAppetite(s.interestRate)) {
    const buyer = pick(s.competitors);
    const avgPrice = s.listings.reduce((a, p) => a + p.askPrice, 0) / s.listings.length;
    const buyable = s.listings.filter((p) => {
      if (p.status !== "klar") return false;
      switch (buyer.strategy) {
        case "distrikt": return p.district === buyer.preferredDistrict;
        case "värde": return p.askPrice < avgPrice * 0.95;
        case "utdelning": return (p.askPrice * 0.06 / 12) / p.askPrice >= 0.004;
        case "tillväxt": default: return true;
      }
    });
    if (buyable.length > 0) {
      const taken = pick(buyable);
      const price = Math.round(taken.askPrice * rnd(0.97, 1.05));
      s.listings = s.listings.filter((x) => x.id !== taken.id);
      s.competitors = s.competitors.map((c) =>
        c.name === buyer.name
          ? {
              ...c,
              cash: Math.max(0, c.cash - price),
              portfolio: [...(c.portfolio ?? []), { ...taken, owned: false, askPrice: price }],
              units: (c.portfolio ?? []).length + 1,
              lastBuy: taken.districtName,
            }
          : c,
      );
      events.push({
        t: `🏢 ${buyer.name} köpte ${taken.typeLabel} i ${taken.districtName} för ${msek(price)}.`,
        kind: "event",
      });
    }
  }

  // ── Inkommande bud på dina fastigheter ──────────────────────────
  // Räkna ner befintliga bud, släng utgångna.
  let offers: Offer[] = (s.offers ?? [])
    .map((o) => ({ ...o, expiresIn: o.expiresIn - 1 }))
    .filter((o) => {
      if (o.expiresIn <= 0) {
        events.push({ t: `⌛ Budet på ${o.propLabel} i ${o.districtName} drogs tillbaka.`, kind: "info" });
        return false;
      }
      // Behåll bara bud på fastigheter du fortfarande äger (paket: alla).
      if (o.propertyIds) return o.propertyIds.every((id) => s.portfolio.some((p) => p.id === id));
      return s.portfolio.some((p) => p.id === o.propId);
    });
  // Nytt bud (~9 %): en rival vill köpa en av dina färdiga fastigheter över marknadsvärde.
  const buyoutCandidates = s.portfolio.filter(
    (p) => p.status === "klar" && !offers.some((o) => o.propId === p.id),
  );
  if (buyoutCandidates.length > 0 && s.competitors.length > 0 && random01() < 0.09) {
    const target = pick(buyoutCandidates);
    const premium = rnd(1.1, 1.4);
    const amount = Math.round(propMarketValue(target, s) * premium);
    offers = [
      ...offers,
      {
        id: newId(),
        kind: "buyout",
        propId: target.id,
        propLabel: target.typeLabel,
        districtName: target.districtName,
        from: pick(s.competitors).name,
        amount,
        expiresIn: 3,
      },
    ];
    events.push({
      t: `📨 ${offers[offers.length - 1].from} bjuder ${msek(amount)} för din ${target.typeLabel} i ${target.districtName}.`,
      kind: "event",
    });
  }

  // ── Bud på utannonserade fastigheter ────────────────────────────
  // Intresset styrs av skick, uthyrningsgrad, avkastning och pris:
  // bra objekt till rätt pris säljer snabbt, liggare blir liggare.
  const listedSingles = s.portfolio.filter(
    (p) => p.status === "klar" && p.forSale && p.forSale.packageId == null,
  );
  for (const p of listedSingles) {
    const existing = offers.filter((o) => o.kind === "listing" && o.propId === p.id);
    if (existing.length >= 2) continue;
    const A = attractiveness(p, s);
    const value = propMarketValue(p, s);
    if (existing.length === 1) {
      // Budkrig: ett bud ligger redan – 25 % chans att en annan aktör
      // bjuder över. Vänta med att svara och priset kan stiga.
      if (random01() < 0.25 && s.competitors.length > 1) {
        const rivalBid = Math.round((existing[0].amount * (1.03 + random01() * 0.05)) / 10_000) * 10_000;
        const from = pick(s.competitors.filter((c) => c.name !== existing[0].from)).name;
        offers = [
          ...offers,
          { id: newId(), kind: "listing", propId: p.id, propLabel: p.typeLabel, districtName: p.districtName, from, amount: rivalBid, expiresIn: 2 },
        ];
        events.push({ t: `💥 Budkrig om ${p.typeLabel} i ${p.districtName}! ${from} bjuder över: ${msek(rivalBid)}.`, kind: "event" });
      }
      continue;
    }
    if (s.competitors.length > 0 && random01() < interestChance(A, p.forSale!.ask, value, s.marketSentiment ?? 1)) {
      const amount = offerAmount(A, p.forSale!.ask, value);
      const from = pick(s.competitors).name;
      offers = [
        ...offers,
        { id: newId(), kind: "listing", propId: p.id, propLabel: p.typeLabel, districtName: p.districtName, from, amount, expiresIn: 3 },
      ];
      events.push({ t: `🏷️ ${from} bjuder ${msek(amount)} på din utannonserade ${p.typeLabel} i ${p.districtName}.`, kind: "event" });
    }
  }
  // Paketbud: institutioner gillar volym (paketpremie på budnivån).
  for (const pkg of s.salePackages ?? []) {
    if (offers.some((o) => o.packageId === pkg.id)) continue;
    const st = packageStats(pkg, s);
    if (s.competitors.length > 0 && random01() < st.chance) {
      const amount = packageOfferAmount(pkg, s);
      const from = pick(s.competitors).name;
      offers = [
        ...offers,
        {
          id: newId(),
          kind: "paket",
          propId: pkg.propertyIds[0],
          propertyIds: pkg.propertyIds,
          packageId: pkg.id,
          propLabel: `${pkg.name} (${pkg.propertyIds.length} fastigheter)`,
          districtName: "paketaffär",
          from,
          amount,
          expiresIn: 3,
        },
      ];
      events.push({ t: `📦 ${from} bjuder ${msek(amount)} på hela ${pkg.name} (${pkg.propertyIds.length} fastigheter).`, kind: "event" });
    }
  }
  s.offers = offers;

  // ── Börsen ──────────────────────────────────────────────────────
  // Sentiment rör sig (påverkat av konjunkturcykeln och månadens
  // makrohändelser), aktier prissätts och utdelning betalas ut.
  const sent = stepSentiment(s.marketSentiment ?? 1, s.marketCycle?.phase);
  const sentReturn = (prevSent > 0 ? sent / prevSent : 1) - 1;
  s.marketSentiment = sent;
  s.sentimentHistory = [...(s.sentimentHistory ?? [prevSent]), sent].slice(-32);
  // Nyhetsstämpel + makroläge som kopplar börsen till den levande ekonomin.
  const stockDate = { day: s.day ?? 1, month: s.month, year: s.year };
  const macro = {
    rateChange: +(s.interestRate - state.interestRate).toFixed(2),
    cyclePhase: s.marketCycle?.phase,
  };
  const market = priceStocks(s.stocks ?? [], sentReturn, s.competitors, macro);
  s.stocks = market.stocks;
  if (market.dividends > 0) {
    cashflow(s, market.dividends, "aktieutdelning");
    s.dividendsReceived = (s.dividendsReceived ?? 0) + market.dividends;
    if (s.month % 3 === 0)
      events.push({ t: `📈 Aktieutdelning inkom: ${kr(market.dividends)}.`, kind: "income" });
  }
  // Kausala rivalnyheter: rivalaktier reagerar på konkurrenternas faktiska månad.
  const rivalResult = rivalNews(s.stocks, s.competitors, stockDate);
  s.stocks = rivalResult.stocks;
  for (const ev of rivalResult.events) events.push({ t: ev, kind: "event" });
  // Bolagsspecifika nyhetshändelser
  const stockNewsResult = applyStockNews(s.stocks, stockDate);
  s.stocks = stockNewsResult.stocks;
  if (stockNewsResult.newsEntry)
    events.push({ t: stockNewsResult.newsEntry, kind: "event" });
  // Dynamisk marknad: nynoteringar, samgåenden och avnoteringar.
  const listingResult = maybeListingEvents(s.stocks, stockDate);
  s.stocks = listingResult.stocks;
  for (const ev of listingResult.events) events.push({ t: ev, kind: "event" });
  // Kvartalsvinster var tredje månad (Q1=3, Q2=6, Q3=9, Q4=12)
  if (s.month % 3 === 0) {
    const earnings = quarterlyEarnings(s.stocks, s.marketSentiment ?? 1, stockDate);
    s.stocks = earnings.stocks;
    for (const ev of earnings.events) {
      events.push({ t: ev, kind: "event" });
    }
  }
  // Blankningskostnad: 0.5 %/mån av blankad position (lånar aktier)
  const shortCost = s.stocks.reduce((a, st) => {
    if (!(st.shortQty ?? 0)) return a;
    return a + Math.round(st.price * st.shortQty! * 0.005);
  }, 0);
  if (shortCost > 0) {
    cashflow(s, -shortCost, "blankningskostnad");
    events.push({ t: `📉 Blankningskostnad: ${kr(shortCost)}/mån (låneavgift 0,5 %).`, kind: "expense" });
  }
  // Tvångstäckning om aktie stigit > 80 % från blankningspris
  s.stocks = s.stocks.map((st) => {
    if (!(st.shortQty ?? 0) || !st.shortAvgPrice) return st;
    if (st.price > st.shortAvgPrice * 1.80) {
      const qty = st.shortQty!;
      const pnl = Math.round(qty * (st.shortAvgPrice - st.price));
      const collateral = Math.round(st.shortAvgPrice * qty * 1.5);
      cashflow(s, Math.max(0, collateral + pnl), "blankning återförd");
      events.push({ t: `🚨 Marginalkrav! Blankning i ${st.name} tvångstäckt @ ${kr(st.price)}. Förlust: ${kr(Math.abs(pnl))}.`, kind: "warn" });
      return { ...st, shortQty: 0, shortAvgPrice: 0 };
    }
    return st;
  });
  // Exekvera limitorder mot nya kurser
  const orderResult = executeLimitOrders(s);
  s = orderResult.state;
  for (const fill of orderResult.fills)
    events.push({ t: fill, kind: fill.startsWith("✅") ? "income" : "warn" });
  // Uppdatera aktieportföljens värdehistorik
  s.portfolioValueHistory = [
    ...(s.portfolioValueHistory ?? []),
    Math.round(stockHoldingsValue(s)),
  ].slice(-48);

  // ── Dotterbolag (förvärvade konkurrenter) ───────────────────────
  const subIncome = (s.subsidiaries ?? []).reduce((a, x) => a + x.monthlyIncome, 0);
  if (subIncome > 0) {
    cashflow(s, subIncome, "dotterbolagsvinst");
    if (s.month % 3 === 0)
      events.push({ t: `🏛️ Dotterbolagen bidrog med ${kr(subIncome * 3)} i kvartalet.`, kind: "income" });
  }

  // ── IPO: uppdatera aktiekurs + beräkna uppköpstryck ────────────
  if (s.ipoActive && s.ipoShares) {
    // Uppdatera FBAB-kurs baserat på eget kapital
    s.stocks = s.stocks.map((st) => {
      if (st.id !== "FBAB") return st;
      const newPrice = Math.max(0.01, equityOf(s) / s.ipoShares!.total);
      return { ...st, prevPrice: st.price, price: newPrice, history: [...st.history, newPrice].slice(-32) };
    });
    // Beräkna uppköpstryck (0–100)
    const fbabStock = s.stocks.find((st) => st.id === "FBAB");
    const curPrice = fbabStock?.price ?? 1;
    const ipoRef = s.ipoPrice ?? curPrice;
    let pressureDelta = 1.5; // bas per månad
    if (s.marketCycle?.phase === "bust") pressureDelta += 3;
    if ((s.recessionMonthsLeft ?? 0) > 0) pressureDelta += 2;
    if (s.reputation > 70) pressureDelta -= 2;
    if (ipoRef > 0 && curPrice < ipoRef * 0.70) pressureDelta += 5; // kurs rasat >30 %
    const oldPressure = s.takeoverPressure ?? 0;
    s.takeoverPressure = Math.max(0, Math.min(100, oldPressure + pressureDelta));
    if (s.takeoverPressure >= 75 && oldPressure < 75) {
      events.push({ t: `⚠️ Uppköpstrycket stiger (${Math.round(s.takeoverPressure)} %)! Aktivister samlar aktier i ditt bolag.`, kind: "warn" });
    }
    if (s.takeoverPressure >= 100 && !s.pendingDecision) {
      const portVal2 = s.portfolio.reduce((a, p) => a + propMarketValue(p, s), 0);
      const buybackCost = Math.round(portVal2 * 0.08);
      s.pendingDecision = {
        id: "hostile_takeover",
        title: "Fientligt uppköpsbud",
        text: "PE Nordic Activist Fund har ackumulerat aktier och kräver nu att bolaget säljs. Försvara dig eller sälj.",
        options: [
          {
            label: "Köp tillbaka aktier",
            detail: `${msek(buybackCost)} · tryck → 20 · rep +3`,
            effect: {
              cash: -buybackCost,
              reputation: 3,
              takeoverPressure: -80,
              log: "Köpte tillbaka aktier och försvarade kontrollen. Uppköpstrycket sjunker markant.",
              logKind: "income",
            },
          },
          {
            label: "PR-offensiv",
            detail: "2 MSEK · tryck −40 · rep +8",
            effect: {
              cash: -2_000_000,
              reputation: 8,
              takeoverPressure: -40,
              log: "PR-kampanj stärkte varumärket och dämpar uppköpstrycket tillfälligt.",
              logKind: "income",
            },
          },
          {
            label: "Acceptera uppköpsbudet",
            detail: "Bolaget säljs — spelet avslutas",
            effect: {
              gameOver: true,
              log: "Bolaget såldes till PE Nordic Activist Fund. Spelet är slut.",
              logKind: "warn",
            },
          },
        ],
      };
      events.push({ t: "🚨 FIENTLIGT BUD: PE Nordic kräver att bolaget säljs. Beslut krävs omedelbart!", kind: "warn" });
    }
  }

  // ── Löner (anställda) ───────────────────────────────────────────
  const salaries = salariesTotal(s);
  if (salaries > 0) {
    cashflow(s, -salaries, "löner");
    if (s.month % 3 === 0)
      events.push({ t: `👔 Löner betalades: ${kr(salaries)}/mån.`, kind: "expense" });
  }
  // Marknadschef stärker varumärket
  const repGain = monthlyReputation(s);
  if (repGain > 0) s.reputation = Math.min(100, s.reputation + repGain);

  // Revolving credit auto-unlock at rep 40
  if (s.reputation >= 40 && !s.revolving) {
    const portVal = s.portfolio.reduce((a, p) => a + propMarketValue(p, s), 0);
    const limit = Math.max(500_000, Math.round(portVal * 0.05));
    s.revolving = { limit, used: 0 };
    events.push({ t: `💳 Revolverande kredit aktiverad: ${kr(limit)} tillgängligt (5 % av portföljvärde).`, kind: "income" });
  }

  // Advisory board auto-unlock at rep milestones
  const advisors = s.advisors ?? [];
  if (s.reputation >= 60 && !advisors.includes("ekonom")) {
    s.advisors = [...advisors, "ekonom"];
    events.push({ t: "🎓 Rådgivarstyrelse: Ekonomisk rådgivare tillkommen (rep 60+). Ger analysstöd.", kind: "info" });
  }
  if (s.reputation >= 80 && !advisors.includes("jurist") && !(s.advisors ?? []).includes("jurist")) {
    s.advisors = [...(s.advisors ?? advisors), "jurist"];
    events.push({ t: "⚖️ Rådgivarstyrelse: Juridisk rådgivare tillkommen (rep 80+). Halverar omklasningstid.", kind: "info" });
  }
  if (s.reputation >= 95 && !advisors.includes("kapitalstrateg") && !(s.advisors ?? []).includes("kapitalstrateg")) {
    s.advisors = [...(s.advisors ?? advisors), "kapitalstrateg"];
    events.push({ t: "📊 Rådgivarstyrelse: Kapitalstrateg tillkommen (rep 95+). Sänker räntepåslag.", kind: "info" });
  }

  // ── Forskning fortskrider ───────────────────────────────────────
  if (s.activeResearch) {
    const left = s.activeResearch.monthsLeft - 1;
    if (left <= 0) {
      const def = RESEARCH.find((r) => r.id === s.activeResearch!.id);
      s.researchDone = [...(s.researchDone ?? []), s.activeResearch.id];
      s.activeResearch = null;
      events.push({ t: `🔬 Forskning klar: ${def?.name ?? ""} — ${def?.effect ?? ""}.`, kind: "income" });
    } else {
      s.activeResearch = { ...s.activeResearch, monthsLeft: left };
    }
  }

  // ── Områdesutveckling: distrikt med fler ägda objekt apprecierar ─
  const dev: Record<string, number> = { ...(s.districtDev ?? {}) };
  for (const d of DISTRICTS) {
    const ownedList = s.portfolio.filter((p) => p.district === d.id && p.status === "klar");
    const ownedHere = ownedList.length;
    const cur = dev[d.id] ?? 1;
    // Skötta hus gentrifierar, förfallna drar ned hela distriktet.
    const avgCond = ownedHere > 0 ? ownedList.reduce((a, p) => a + p.condition, 0) / ownedHere : 62;
    const condPull = ((avgCond - 62) / 100) * 0.002;
    const growth = 0.0015 * ownedHere + condPull + rnd(-0.0025, 0.004);
    // Hotellsynergi: hotell i distriktet höjer distriktsutvecklingen
    const hotelBonus = (s.industryPortfolio ?? [])
      .filter((a) => a.sector === "hotell" && a.district === d.id && a.status === "klar")
      .reduce((sum, a) => sum + (a.hotelMeta?.starRating ?? 0) * 0.002, 0);
    dev[d.id] = Math.max(0.85, Math.min(1.6, +(cur * (1 + growth + hotelBonus)).toFixed(4)));
  }
  s.districtDev = dev;

  // ── Distriktsöden: statusbyten är händelser i staden ─────────────
  {
    const tiers: Record<string, string> = { ...(s.districtTiers ?? {}) };
    for (const d of DISTRICTS) {
      const tier = tierOfDev(dev[d.id] ?? 1);
      const prev = tiers[d.id];
      if (prev && prev !== tier.id) {
        const prevIdx = DISTRICT_TIERS.findIndex((t) => t.id === prev);
        const newIdx = DISTRICT_TIERS.findIndex((t) => t.id === tier.id);
        const up = newIdx > prevIdx;
        events.push({
          t: up
            ? `${tier.icon} STADSOMVANDLING: ${d.name} klassas nu som ${tier.name} – hyror och värden lyfter i takt med områdets rykte.`
            : `${tier.icon} ${d.name} har halkat ned till ${tier.name} – eftersatt underhåll och svag utveckling pressar området.`,
          kind: up ? "income" : "warn",
        });
      }
      tiers[d.id] = tier.id;
    }
    s.districtTiers = tiers;
  }

  // ── Helkvarter: fira när ett slutet kvarter blir helägt ──────────
  {
    const current = fullyOwnedBlocks(s);
    const known = new Set(s.ownedBlocks ?? []);
    for (const blockId of current) {
      if (!known.has(blockId)) {
        s.reputation = Math.min(100, s.reputation + 2);
        events.push({
          t: `🏆 HELKVARTER! ${s.companyName ?? "Bolaget"} äger nu hela kvarteret ${blockId.replace("-kv", " ")} – samordnad drift ger +10 % hyra och −15 % driftkostnad (rep +2).`,
          kind: "income",
        });
      }
    }
    s.ownedBlocks = current;
  }

  // ── ESG: betygsbyten och grönt lån ───────────────────────────────
  {
    const rating = esgRatingOf(s);
    const prev = s.esgRating;
    if (prev && prev !== rating.letter) {
      if (rating.spreadDelta < 0)
        events.push({ t: `🌱 ESG-betyg ${rating.letter}: grönt lån aktivt – räntepåslaget sänks med ${Math.abs(rating.spreadDelta).toFixed(2)} %-enheter.`, kind: "income" });
      else if (rating.spreadDelta > 0)
        events.push({ t: `🏭 ESG-betyg ${rating.letter}: bankerna kräver ${rating.spreadDelta.toFixed(2)} %-enheter extra i räntepåslag. Energiuppgradera beståndet!`, kind: "warn" });
      else events.push({ t: `♻️ ESG-betyg ändrat till ${rating.letter}.`, kind: "info" });
    }
    s.esgRating = rating.letter;
    // Dålig hållbarhet göder aktivister efter börsnoteringen.
    if (s.ipoActive && rating.spreadDelta > 0)
      s.takeoverPressure = Math.min(100, (s.takeoverPressure ?? 0) + 1.5);
  }

  // ── Rivalagendor: utspel när målen närmar sig ────────────────────
  s.competitors = s.competitors.map((c) => {
    const ag = c.agenda;
    if (!ag || ag.announced) return c;
    const progress =
      ag.kind === "district"
        ? c.portfolio.filter((p) => p.district === ag.district).length / ag.target
        : ag.kind === "units"
          ? c.portfolio.filter((p) => p.status === "klar").length / ag.target
          : c.equity / ag.target;
    if (progress >= 1) {
      events.push({ t: `🏁 ${c.name} har nått sitt mål: ${ag.label}. Rivalen växlar upp – räkna med hårdare konkurrens.`, kind: "warn" });
      return { ...c, agenda: { ...ag, announced: true } };
    }
    return c;
  });

  // ── Detaljplaneauktion: kommunen släpper nytt kvarter ────────────
  // Tidsstyrd (var 30:e månad) MEN också behovsstyrd: när staden har
  // ont om obebyggd mark tidigarelägger kommunen nästa auktion.
  {
    const absM = s.year * 12 + s.month;
    const unlocked = new Set(s.unlockedBlocks ?? []);
    // Berättelseläget: kommunen planlägger inte i låsta distrikt.
    const nextBlock = EXPANSION_BLOCKS.find(
      (b) => !unlocked.has(b.blockId) && !districtLocked(s, b.district),
    );
    const scheduled = absM % 30 === 0;
    const shortage =
      emptyParcels(s).length < 5 && absM - (s.lastAuctionAbs ?? -99) >= 12;
    if (!s.auction && nextBlock && (scheduled || shortage)) {
      const parcels = PARCELS.filter((p) => p.blockId === nextBlock.blockId);
      const d = DISTRICTS.find((x) => x.id === nextBlock.district)!;
      const landValue = parcels.reduce((a, p) => a + p.w * p.d * 2 * d.base * 0.18, 0);
      const minBid = Math.round((landValue * s.marketMod * 0.8) / 10_000) * 10_000;
      s.auction = {
        blockId: nextBlock.blockId,
        district: nextBlock.district,
        districtName: d.name,
        parcels: parcels.length,
        minBid,
        currentBid: minBid,
        leader: null,
        round: 0,
      };
      s.lastAuctionAbs = absM;
      events.push({
        t: `🏛️ DETALJPLANEAUKTION: ${shortage && !scheduled ? "Markbristen får kommunen att tidigarelägga planläggningen — ett" : "Kommunen släpper ett"} nytt kvarter i ${d.name} (${parcels.length} tomter, utrop ${msek(minBid)}). Spelet pausar tills auktionen avgjorts.`,
        kind: "event",
      });
    }
  }

  // ── Naturlig tillväxt: privata byggherrar förtätar staden ────────
  // Obebyggd mark bebyggs sakta av sig själv (mer i högkonjunktur) – men
  // fronten breder ut sig UTÅT från redan byggd mark (pickFrontierParcel)
  // i stället för på slumpvisa rutor, så staden växer sammanhängande.
  {
    const phase = s.marketCycle?.phase ?? "stable";
    const growChance =
      (phase === "boom" ? 0.3 : phase === "bust" ? 0.04 : 0.12) *
      Math.min(1.4, s.demandMod ?? 1);
    if (random01() < growChance) {
      const pc = pickFrontierParcel(s);
      if (pc) {
        s.ambientGrown = [...(s.ambientGrown ?? []), pc.id];
        if (s.ambientGrown.length % 5 === 0) {
          const d = DISTRICTS.find((x) => x.id === pc.district);
          events.push({
            t: `🏘️ Staden växer: privata byggherrar har uppfört ${s.ambientGrown.length} nya hus sedan starten — senast i ${d?.name ?? pc.district}.`,
            kind: "info",
          });
        }
      }
    }
  }

  // Råvarupris/byggkostnad mjukt tillbaka mot normalt
  s.buildCostMod = +(((s.buildCostMod ?? 1) * 0.85 + 0.15)).toFixed(3);

  // ── Beslutshändelse (~6 %) ──────────────────────────────────────
  // Under berättelseläget står kampanjen för besluten – slumpen väntar.
  if ((!s.story || s.story.done) && random01() < 0.06) {
    const decision = makeDecision(s);
    s.pendingDecision = decision;
    events.push({ t: `🤔 Beslut krävs: ${decision.title}`, kind: "event" });
  }

  // ── Utgångna listings: hus försvinner INTE från kartan ──────────
  // Synliga objekt (med tomtruta) som ingen köpt plockas upp av ett av
  // stadens bolag till rabatt – byggnaden står kvar i köparens färg.
  // Bara osynliga poolobjekt återgår till den abstrakta världspoolen.
  const nowAbs2 = s.year * 12 + s.month;
  const expiredToPool: typeof s.listings = [];
  const pickedUp: { buyer: string; prop: (typeof s.listings)[number] }[] = [];
  s.listings = s.listings.filter((p) => {
    if ((p.expiresMonth ?? Infinity) <= nowAbs2) {
      if (p.parcelId && s.competitors.length > 0) {
        const buyer = pick(s.competitors);
        pickedUp.push({
          buyer: buyer.name,
          prop: {
            ...p,
            owned: false,
            askPrice: Math.round(p.askPrice * 0.9),
            listedMonth: undefined,
            expiresMonth: undefined,
            poolAskPrice: undefined,
            poolBaseRent: undefined,
          },
        });
      } else {
        // Ursprungspriset återställs (annars ackumuleras marknadspåslaget
        // varje gång objektet listas om).
        expiredToPool.push({
          ...p,
          askPrice: p.poolAskPrice ?? p.askPrice,
          baseRent: p.poolBaseRent ?? p.baseRent,
          poolAskPrice: undefined,
          poolBaseRent: undefined,
          parcelId: undefined,
          listedMonth: undefined,
          expiresMonth: undefined,
        });
      }
      return false;
    }
    return true;
  });
  if (pickedUp.length > 0) {
    s.competitors = s.competitors.map((c) => {
      const mine = pickedUp.filter((x) => x.buyer === c.name).map((x) => x.prop);
      if (mine.length === 0) return c;
      const cost = mine.reduce((a, p) => a + p.askPrice, 0);
      return { ...c, portfolio: [...(c.portfolio ?? []), ...mine], cash: Math.max(0, c.cash - cost) };
    });
    for (const x of pickedUp)
      events.push({ t: `🤝 ${x.buyer} plockade upp ${x.prop.typeLabel} i ${x.prop.districtName} när annonsen löpte ut (${msek(x.prop.askPrice)}).`, kind: "event" });
  }
  s.worldPool = [...(s.worldPool ?? []), ...expiredToPool];
  s.lots = s.lots.filter((l) => {
    if (!l.owned && (l.expiresMonth ?? Infinity) <= nowAbs2) {
      events.push({ t: `📋 Tomt i ${l.districtName} drogs tillbaka.`, kind: "info" });
      return false;
    }
    return true;
  });

  // ── Marknadstillflöde: avslöja ur världspoolen (ej generera nytt) ─
  const MAX_LISTINGS = 12;
  const MAX_FREE_LOTS = 6;
  const pool = s.worldPool ?? [];
  // Avslöja aldrig fler annonser än det finns ledig mark – annars hamnar de
  // utanför kartan och kan köpas till spökägande. Utgångna annonser ovan har
  // redan frigjort sina rutor, så räkna om den lediga poolen här.
  const freeLandNow = Math.max(0, Math.min(landBudget, emptyParcels(s).length));
  // Berättelseläget: bara objekt i upplåsta distrikt når marknaden.
  const storyUnlocked = unlockedDistrictsFor(s);
  if (s.listings.length < MAX_LISTINGS && pool.length > 0 && freeLandNow > 0) {
    const want = Math.min(1 + Math.floor(random01() * Math.min(3, pool.length)), freeLandNow);
    const revealIdx: number[] = [];
    for (let i = 0; i < pool.length && revealIdx.length < want; i++) {
      if (!storyUnlocked || storyUnlocked.has(pool[i].district)) revealIdx.push(i);
    }
    const toReveal = revealIdx.map((i) => pool[i]);
    const born = nowAbs2;
    s.listings = [
      ...s.listings,
      ...toReveal.map((p) => ({
        ...p,
        // Snapshot av grundpriset så att det kan återställas vid utgång.
        poolAskPrice: p.askPrice,
        poolBaseRent: p.baseRent,
        askPrice: Math.round(p.askPrice * s.marketMod),
        baseRent: Math.round(p.baseRent * s.marketMod),
        listedMonth: born,
        expiresMonth: born + 3 + Math.floor(random01() * 2),
      })),
    ].slice(0, MAX_LISTINGS);
    s.worldPool = pool.filter((_, i) => !revealIdx.includes(i));
    landBudget -= toReveal.length;
  }
  // Om världspoolen tar slut: generera nybyggnation (expansionen av världen) –
  // enbart om det finns ledig mark kvar (annars ingen tomtruta åt den).
  const allowedNow = (() => {
    const space = districtsWithSpace(s);
    if (!storyUnlocked) return space;
    return new Set([...space].filter((d) => storyUnlocked.has(d)));
  })();
  if ((s.worldPool ?? []).length === 0 && s.listings.length < MAX_LISTINGS && landBudget > 0 && allowedNow.size > 0) {
    const newProp = genListing(s, allowedNow);
    s.listings = [...s.listings, newProp];
    s.worldTotal = (s.worldTotal ?? 0) + 1;
    landBudget -= 1;
    events.push({ t: `🏗️ Nyproduktion utökar marknaden: ${newProp.typeLabel} i ${newProp.districtName}.`, kind: "info" });
  }
  if (landBudget > 0 && random01() < 0.4 && s.lots.filter((l) => !l.owned).length < MAX_FREE_LOTS && allowedNow.size > 0) {
    s.lots = [...s.lots, genLot(s, allowedNow)];
    landBudget -= 1;
  }

  // ── Covenantvakt: ratinginstitutet och banken följer skuldsättningen ──
  // Varning kvartalsvis vid brott; i kris kräver banken tvångsamortering.
  {
    const info = creditRatingOf(s);
    const breach = covenantBreach(info);
    if (breach && s.month % 3 === 0) {
      if ((s.crisisMonthsLeft ?? 0) > 0 && s.debt > 0) {
        const forced = Math.min(Math.max(0, s.cash), Math.round(s.debt * 0.02));
        if (forced > 0) {
          cashflow(s, -forced, "tvångsamortering (covenant)");
          s.debt -= forced;
          events.push({ t: `🏦 COVENANTBROTT I KRIS: ${breach}. Banken tvingar fram amortering: ${msek(forced)}.`, kind: "warn" });
        } else {
          events.push({ t: `🏦 COVENANTBROTT: ${breach} — och kassan är tom. Sälj tillgångar innan banken agerar.`, kind: "warn" });
        }
      } else {
        events.push({ t: `🏦 Ratinginstitutet varnar (betyg ${info.rating}): ${breach}. Ny upplåning blir dyrare tills balansen stärkts.`, kind: "warn" });
      }
    }
  }

  // Lånelöptid: refinansiering var 48–72 månad
  if (s.debt > 0) {
    const nowAbs3 = s.year * 12 + s.month;
    if (!s.debtMatureAbs) {
      s.debtMatureAbs = nowAbs3 + 48 + Math.floor(random01() * 24);
    } else if (nowAbs3 >= s.debtMatureAbs) {
      const cycle = s.marketCycle?.phase ?? "stable";
      const recSpread = (s.recessionMonthsLeft ?? 0) > 0 ? 2.0 : 0;
      const cycleSpread = cycle === "bust" ? 1.5 : cycle === "boom" ? -0.5 : 0;
      const repSpread = s.reputation < 40 ? 2.5 : s.reputation < 60 ? 1.0 : 0;
      const oldRate = s.interestRate;
      const baseRate = loanTerms(s).rate + cycleSpread + recSpread + repSpread;
      s.interestRate = +(Math.min(12, Math.max(2, baseRate)).toFixed(2));
      s.debtMatureAbs = nowAbs3 + 48 + Math.floor(random01() * 24);
      const rateDiff = +(s.interestRate - oldRate).toFixed(2);
      events.push({
        t: `🏦 REFINANSIERING: Lånet förfaller. Ny ränta ${s.interestRate.toFixed(1)} % (${rateDiff >= 0 ? "+" : ""}${rateDiff.toFixed(1)} %). Marknad: ${cycle}${recSpread > 0 ? ", lågkonjunktur" : ""}.`,
        kind: rateDiff > 0.25 ? "warn" : "income",
      });
    }
  }

  // ── Bolagsresan: hint när kraven för nästa nivå uppnås ──────────
  // Själva expansionen är spelarens beslut (UPGRADE_COMPANY) – den
  // kostar pengar och görs i Bolag-panelen. Hinten loggas en gång.
  {
    const tier = nextTier(s.companyLevel ?? 1);
    if (tier && qualifiesFor(s, tier) && s.levelUpOfferedFor !== tier.level) {
      s.levelUpOfferedFor = tier.level;
      events.push({
        t: `📈 ${s.companyName ?? "Bolaget"} uppfyller kraven för ${tier.name}! Öppna Bolag och expandera (${msek(tier.upgradeCost)}).`,
        kind: "income",
      });
    }
  }

  // Tid
  s.month += 1;
  if (s.month > 12) {
    s.month = 1;
    s.year += 1;
    s.marketMod = +(s.marketMod * rnd(0.99, 1.04)).toFixed(3);
    // Årsbokslut: hur gick året för bolaget?
    const prevYearEq = s.history[s.history.length - 12]?.equity;
    if (prevYearEq !== undefined && prevYearEq !== 0) {
      const eqNow = equityOf(s);
      const diffPct = Math.round(((eqNow - prevYearEq) / Math.abs(prevYearEq)) * 100);
      events.push({
        t: `📆 ÅRSBOKSLUT ${calYear(s.year - 1)}: eget kapital ${msek(eqNow)} (${diffPct >= 0 ? "+" : ""}${diffPct} % under året), ${unitCount(s)} fastigheter i beståndet.`,
        kind: diffPct >= 0 ? "income" : "warn",
      });
    }
  }

  // Win condition check
  if (!s.gameWon && s.scenarioId && s.scenarioId !== "sandbox") {
    const sc = SCENARIOS.find((x) => x.id === s.scenarioId);
    if (sc?.check(s)) {
      s.gameWon = true;
      s.log = [
        { t: `🏆 MÅL UPPNÅTT: ${sc.title} – ${sc.subtitle}! Spelat klart ${formatMonthYear(s.month, s.year)}.`, kind: "income" },
        ...s.log,
      ];
    }
  }

  // Rival race: rival som når scenariomålet före spelaren = förlust för spelaren
  if (!s.gameOver && !s.gameWon && s.scenarioId && s.scenarioId !== "sandbox") {
    for (const rival of s.competitors) {
      if (rivalWinsScenario(rival, s.scenarioId, s)) {
        s.gameOver = true;
        s.log = [
          { t: `🏳️ ${rival.name} nådde målet "${s.scenarioId}" före dig — du förlorade racet!`, kind: "warn" },
          ...s.log,
        ];
        break;
      }
    }
  }

  // Milestone checking
  const doneMilestones = s.milestones ?? [];
  for (const ms of MILESTONES) {
    if (!doneMilestones.includes(ms.id) && ms.check(s)) {
      s.milestones = [...doneMilestones, ms.id];
      s.reputation = Math.min(100, s.reputation + 3);
      events.push({ t: `🏅 MILSTOLPE: ${ms.title} – ${ms.desc} (Belöning: ${ms.reward})`, kind: "income" });
    }
  }

  const net = monthlyNOI - interest;
  const summary: LogEntry = {
    t: `${formatMonthYear(s.month, s.year)}: driftnetto ${kr(monthlyNOI)} − ränta ${kr(interest)} = ${kr(net)}.`,
    kind: net >= 0 ? "income" : "expense",
  };
  s.log = [...events, summary, ...s.log].slice(0, 70);

  const equity = equityOf(s);
  s.history = [...s.history, { month: s.history.length, equity }].slice(-120);
  // Statistik-panelens tidsserier: EK, driftnetto, kassa, portföljvärde
  // och bästa rivalens EK - kurvorna är tycoon-spelarens belöning.
  s.statsHistory = [
    ...(s.statsHistory ?? []),
    {
      abs: s.year * 12 + s.month,
      equity,
      noi: Math.round(monthlyNOI),
      cash: Math.round(s.cash),
      portfolio: Math.round(portfolioValue(s)),
      bestRival: Math.round(Math.max(0, ...s.competitors.map((c) => c.equity))),
    },
  ].slice(-120);

  if (s.cash < -200_000 && s.cash >= -1_000_000 && !s.gameOver) {
    s.log = [{ t: `🚨 KASSAVARNING: Kassan ${kr(s.cash)}. Konkurs vid −1 000 000 kr!`, kind: "warn" }, ...s.log];
  }
  if (s.cash < -1_000_000) {
    if (s.settings?.noBankruptcy) {
      if (s.cash > -1_100_000)
        s.log = [{ t: "💥 Kassan under −1 000 000 kr – konkurs är avstängd, men banken himlar med ögonen.", kind: "warn" }, ...s.log];
    } else {
      s.gameOver = true;
      s.log = [{ t: "💥 KONKURS! Kassan under −1 000 000 kr. Spelet är slut.", kind: "warn" }, ...s.log];
    }
  }
  if (CASHFLOW_DEBUG && cashLedger.length) {
    const net = cashLedger.reduce((a, c) => a + c.delta, 0);
    console.table([...cashLedger, { reason: "NETTO", delta: net }]);
  }
  // Berättelseläget: injects, brev och kapitelavancemang efter månadens
  // händelser. Körs HÄR (inte bara i dispatch-pipelinen) så att flera månader
  // i rad – t.ex. spolning – avancerar storyn per månad. advanceStory är
  // idempotent (flagg-skyddad + billig tidig-retur), så att dispatch-pipelinen
  // kör den en gång till på resultatet är ofarligt. Se story-idempotenstestet.
  return advanceStory(s);
}
