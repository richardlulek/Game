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
import { makeScandal, scandalRisk } from "./newsroom";
import {
  BANKRUPTCY_FLOOR,
  RECEIVERSHIP_BANK_HIT,
  RECEIVERSHIP_PRESS_HIT,
  RECEIVERSHIP_REP_HIT,
  RESTRUCTURING_MONTHS,
  imposeRestructuringTerms,
  isInsolvent,
  maxRaisable,
  receiverAutoLiquidate,
} from "./receivership";
import { findNotableMoveIn, notableById, signNotable } from "./notableTenants";
import { hasRelation, nemesisOf, rivalCycleMult } from "./rivalArcs";
import { adjustStanding } from "./standing";
import { tenantScoreOf } from "./tenantScore";
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

  // Trendankare: långsam EMA av marknadsnivån. Bubbelvakten jämför mot den
  // (marketMod ≫ ankaret = snabb uppgång = bubbla) i stället för mot ett
  // absolut tak – annars halshuggs varje sekulär uppgång av en "kris".
  s.marketModAnchor = +(((s.marketModAnchor ?? s.marketMod) + (s.marketMod - (s.marketModAnchor ?? s.marketMod)) * 0.03)).toFixed(4);

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
      events.push({ t: `📈 UPTURN! The property market is rising (${dur} mo left).`, kind: "income" });
    } else if (next === "bust") {
      s.marketMod = +(s.marketMod * 0.92).toFixed(3);
      s.demandMod = +(s.demandMod * 0.96).toFixed(3);
      events.push({ t: `📉 DOWNTURN! The market is faltering (${dur} mo left).`, kind: "warn" });
      // Bubbla som spricker: nedgång i ett uppblåst läge → fullskalig kris.
      // (Lugnt läge: kriser avstängda.)
      if (!s.settings?.calmMode && !s.crisisMonthsLeft && shouldTriggerCrisis(s.marketMod, random01(), s.marketModAnchor ?? 1)) {
        s.crisisMonthsLeft = CRISIS_MONTHS;
        events.push({
          t: `🚨 PROPERTY CRISIS! The bubble bursts: values fall, the credit market closes and covenants tighten. Those with cash buy cheap — the leveraged fight for their lives.`,
          kind: "warn",
        });
      }
    } else {
      events.push({ t: `📊 The economy stabilizes — steady state (${dur} mo).`, kind: "event" });
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
        t: `🏛️ The central bank ${step > 0 ? "raises" : "cuts"} the policy rate by 25 bps to ${s.interestRate.toFixed(2)}% — property values are ${step > 0 ? "pressured" : "lifted"}.`,
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
      events.push({ t: `🏦 Bond of ${msek(bond.amount)} repaid at maturity.`, kind: "info" });
    } else {
      s.reputation = Math.max(0, s.reputation - 10);
      cashflow(s, -bond.amount * 0.5, "obligation nödlöst i förtid");
      // En missad obligation bränner bankrelationen hårt.
      s.standing = adjustStanding(s.standing, { kind: "bank" }, -15);
      events.push({ t: `⚠️ Bond of ${msek(bond.amount)} could not be repaid! Reputation −10.`, kind: "warn" });
    }
  }
  // Bankrelationen (standing) driftar långsamt mot ett mål satt av ryktet:
  // gott rykte bygger förtroende hos bankerna, dåligt naggar det i kanten.
  {
    const target = Math.max(-100, Math.min(100, (s.reputation - 55) * 1.6));
    const cur = s.standing?.bank ?? 0;
    const diff = target - cur;
    if (Math.abs(diff) >= 0.1) {
      s.standing = adjustStanding(s.standing, { kind: "bank" }, Math.sign(diff) * Math.min(0.5, Math.abs(diff)));
    }
  }
  s.bonds = (s.bonds ?? []).filter((b) => b.matureAbs > nowAbsBond);

  // Fixed rate expiry
  const nowAbs = s.year * 12 + s.month;
  if (s.rateMode === "fixed" && s.fixedUntilAbs && nowAbs >= s.fixedUntilAbs) {
    s.rateMode = "variable";
    s.fixedRate = undefined;
    s.fixedUntilAbs = undefined;
    events.push({ t: "🔓 Fixed-rate period ended – back to a variable rate.", kind: "info" });
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
            events.push({ t: `🔧 Maintenance done: ${np.typeLabel} in ${np.districtName} (+15 condition).`, kind: "upg" });
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
              events.push({ t: `📣 The ad campaign paid off: 3 new applications for ${np.typeLabel} in ${np.districtName}.`, kind: "upg" });
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
              t: `🏙️ New construction done: ${np.typeLabel} in ${np.districtName} replaced the old building – age reset, +15% area, +1 rental unit, energy class A.`,
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
              t: `🏗️ Extension done: ${np.typeLabel} in ${np.districtName} – +25% area, +1 rental unit, +20% value.`,
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
          events.push({ t: `🔧 The manager ordered maintenance of ${np.typeLabel} in ${np.districtName} (threshold ${effectiveMaintainThreshold}) – +15 condition at month-end.`, kind: "upg" });
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
        events.push({ t: `✅ Rezoning done: ${np.districtName} is now ${typeDef[newType]}.`, kind: "upg" });
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
        events.push({
          t: t.notableId
            ? `📉 ${t.name} has closed its doors in ${np.districtName} — a notable tenant lost. Eviction cost: ${kr(evictionCost)}.`
            : `⚠️ ${t.name} in ${np.districtName} went bankrupt. Eviction cost: ${kr(evictionCost)}.`,
          kind: t.notableId ? "warn" : "expense",
        });
        continue;
      }
      // Livscykel: kommersiella hyresgäster expanderar i högkonjunktur
      // (hyr mer yta, +15 % hyra – en gång per hyresgäst). Notabla
      // "growth"-karaktärer växer ur sina lokaler betydligt oftare.
      const notable = notableById(t.notableId);
      const growthMult = notable?.trait === "growth" ? 6 : 1;
      if (cyclePhaseNow === "boom" && np.type !== "bostad" && !t.expanded && random01() < 0.01 * growthMult) {
        t.expanded = true;
        t.rent = Math.round(t.rent * 1.15);
        events.push({
          t: notable
            ? `📈 ${t.name} is booming and takes more space in ${np.districtName} (+15% rent).`
            : `📈 ${t.name} expanderar i ${np.districtName} – hyr mer yta (+15 % hyra).`,
          kind: "income",
        });
      }
      // Djupt missnöjda lämnar i förtid (U3) – lättare i löst marknadsläge.
      if (sat < 30 && random01() < 0.06 * moveP) {
        movers.push(t);
        if (t.notableId) {
          // En notabel karaktär som lämnar i vredesmod svider – ryktesförlust.
          s.reputation = Math.max(0, s.reputation - 3);
          events.push({ t: `💢 ${t.name} stormed out of ${np.districtName}, publicly slamming its landlord (satisfaction ${sat}). Reputation −3.`, kind: "warn" });
        } else {
          events.push({ t: `😟 ${t.name} left ${np.districtName} early – dissatisfied (satisfaction ${sat}).`, kind: "warn" });
        }
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
            events.push({ t: `📄 Manager renewed the lease with ${t.name} in ${np.districtName}: ${kr(newRent)}/mo.`, kind: "info" });
          } else {
            movers.push(t);
            events.push({ t: `📄 ${t.name} left ${np.districtName} – rent too high at renewal.`, kind: "info" });
          }
        } else {
          // Pending renewal: player has one month to decide
          const alreadyPending = (s.pendingRenewals ?? []).some(
            r => r.propertyId === np.id && r.tenantId === t.id,
          );
          if (alreadyPending) {
            events.push({ t: `📄 ${t.name} left ${np.districtName} (contract not renewed).`, kind: "info" });
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
            events.push({ t: `⏰ Contract with ${t.name} in ${np.districtName} is expiring — negotiate in the Tenants tab!`, kind: "warn" });
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
        events.push({ t: `👔 ${policyAccept ? "The policy" : "The manager"} accepted an application in ${np.typeLabel} ${np.districtName}: ${signed.name}, ${kr(signed.rent)}/mo.`, kind: "info" });
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
      events.push({ t: `🏛️ The housing queue assigned ${queueFilled} ${queueFilled === 1 ? "apartment" : "apartments"} in your regulated portfolio.`, kind: "info" });
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
        events.push({ t: `🔄 Moving chain: ${chained} tenant${chained === 1 ? "" : "s"} who left are now looking among your vacant units.`, kind: "info" });
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
          events.push({ t: `💼 The CFO policy amortized ${kr(amort)} (target LTV ${Math.round(pol.autoAmort.ltvTarget * 100)}%).`, kind: "info" });
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
        events.push({ t: `🛡️ The protection policy insured ${insured} ${insured === 1 ? "property" : "properties"} above the value threshold.`, kind: "info" });
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
        events.push({ t: `🏢 Office cost (${tier.name}): ${kr(tier.monthlyOverhead)}/mo.`, kind: "expense" });
    }
    if (orgLoad.over > 0) {
      const adminCost = orgLoad.over * OVERLOAD_COST_PER_PROP;
      monthlyNOI -= adminCost;
      if (s.month % 3 === 0) {
        events.push({
          t: `⚠️ The organization is overloaded: ${orgLoad.selfManaged} self-managed properties but capacity for ${orgLoad.cap}. Extra cost ${kr(adminCost)}/mo – expand the company or hire managers.`,
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
          events.push({ t: `🏗️ ${asset.name} is finished!`, kind: "income" });
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
      events.push({ t: `🔥 Damage event: ${victim.typeLabel} in ${victim.districtName} was hit (${kr(damage)} in damage costs). Taking out insurance is recommended!`, kind: "warn" });
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
          events.push({ t: `🏛️ Property tax: ${kr(monthlyTax)}/mo (deduction ${kr(Math.round(monthlyDepreciation))}/mo, tax rate ${Math.round(taxRate * 100)}%).`, kind: "expense" });
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
        events.push({ t: `🏦 LTV WARNING: Loan-to-value ${Math.round(ltv * 100)}% exceeds 85%! Bank fee ${kr(penalty)}/mo (rep −1).`, kind: "warn" });
      } else if (ltv > 0.75) {
        const surcharge = Math.round((s.debt * 0.005) / 12);
        cashflow(s, -surcharge, "straffavgift");
        monthlyNOI -= surcharge;
        events.push({ t: `⚠️ Loan-to-value ${Math.round(ltv * 100)}% (limit 75%) — interest surcharge ${kr(surcharge)}/mo.`, kind: "expense" });
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
          t: `🏦 Amortization requirement: ${kr(ai.monthly)}/mo (${ai.yearlyPct * 100}% of debt/yr at LTV ${Math.round(ai.ltv * 100)}%). No amortization below 50% LTV.`,
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
      events.push({ t: `🚨 Distress sale! ${comp.name} is forced to sell ${selling.typeLabel} in ${selling.districtName} for ${msek(distressedPrice)} (−${Math.round((1 - distressedPrice / selling.askPrice) * 100)}%).`, kind: "warn", rival: comp.name });
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
  // En nemesis budar oftare mot dig och lägger sig gärna i dina affärer.
  const nemesisBidBoost = s.nemesis && s.competitors.some((c) => c.name === s.nemesis) ? 0.06 : 0;
  if (!s.competingBid && s.competitors.length > 0 && s.listings.length > 0 && random01() < (rivalIsClose ? 0.28 : 0.12) + nemesisBidBoost) {
    const target = pick(s.listings.filter((p) => p.status === "klar"));
    if (target) {
      // Nemesis går ofta själv in i budgivningen.
      const nemesisComp = nemesisBidBoost > 0 ? s.competitors.find((c) => c.name === s.nemesis) : undefined;
      const rival = nemesisComp && random01() < 0.5 ? nemesisComp : pick(s.competitors);
      const amount = Math.round(target.askPrice * rnd(1.02, 1.15));
      const absNow = s.year * 12 + s.month;
      s.competingBid = { listingId: target.id, rivalName: rival.name, amount, expiresAbs: absNow + 1, round: 1 };
      const q = rivalQuote(rival.name, "budkrig", absNow);
      events.push({ t: `⚡ BIDDING: ${rival.name} placed ${msek(amount)} on ${target.typeLabel} in ${target.districtName}!${q ? " " + q : ""} Beat the bid or let them buy.`, kind: "warn", rival: rival.name });
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
        events.push({ t: `🏢 ${s.competingBid.rivalName} bought ${listing.typeLabel} in ${listing.districtName} for ${msek(s.competingBid.amount)}.${vq ? " " + vq : ""}`, kind: "event", rival: s.competingBid.rivalName });
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
    events.push({ t: `🤝 ACQUISITION: ${ca.name} buys out the struggling ${cb.name}.${fq ? " " + fq : ""}`, kind: "warn", rival: ca.name });
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
        events.push({ t: `💰 The buyout cashed out your position in ${cb.name}: +${msek(payout)}.`, kind: "sell" });
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
        t: `🎉 OPENED: ${pr.name} in ${pr.districtName} is complete — the area lifts (+${Math.round(pr.boost * 100)}% area development).`,
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
        t: `🏛️ CONSTRUCTION START: The municipality is building ${kind.name.toLowerCase()} in ${d.name} — done in ~${months} mo. The location is expected to rise sharply.`,
        kind: "event",
      });
    }
  }

  // ── Slutspelet: kapitalet slår tillbaka ──────────────────────────
  {
    const eq = equityOf(s);

    // A1 · Institutionella fonder kliver in när spelaren drar ifrån.
    // Krigskassan är stor nog att tävla om varje affär – men inte 90 % av
    // spelarens equity: då toppade fonderna rankinglistan för alltid med en
    // handfull hus, enbart i kraft av moderfondens insättningar.
    if (eq > FUND_TRIGGER_EQUITY && !fundsActive(s)) {
      const warChest = Math.round(eq * 0.35);
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
        t: `🌐 INTERNATIONAL CAPITAL: ${FUNDS.map((f) => f.name).join(" and ")} establish themselves in the city with billion-krona war chests. They bid on everything — and they have deeper pockets than the bank thought.`,
        kind: "warn",
      });
    }
    // Fonderna hålls likvida nog att bjuda (gummiband) – som LIKVIDITETS-
    // påfyllnad, inte förmögenhetsgaranti. Gamla bandet (fyll till 40 % av
    // spelarens equity, +50 % per injektion) gjorde att fonderna alltid
    // rankade över spelaren oavsett sina faktiska innehav.
    s.competitors = s.competitors.map((c) => {
      if (!c.institutional || c.cash >= eq * 0.15) return c;
      const injection = Math.round(eq * 0.25);
      events.push({ t: `🌐 ${c.name} raises new capital: +${msek(injection)} from the parent fund.`, kind: "event" });
      return { ...c, cash: c.cash + injection };
    });

    // A2/A3 · Aktivistfonden: EN enad ägarmodell efter noteringen.
    // takeoverPressure ÄR Kronfelt Capitals ägarandel i % av aktierna:
    // död kassa, svag avkastning, kursras och kristider bygger positionen;
    // stark ROE, gott rykte och utdelningar krymper den. Andelen kan
    // aldrig överstiga floaten – och tar de fler röster än du har
    // (eller absoluta taket) röstas du bort. (Tidigare fanns TVÅ
    // motstridiga tryckskrivare, varav en kröp +1,5/mån villkorslöst –
    // uppköpshotet kändes därför slumpartat och oundvikligt.)
    if (s.ipoActive && !s.gameOver) {
      const shares = s.ipoShares ?? { total: 10_000_000, public: 3_000_000 };
      const floatPct = (shares.public / shares.total) * 100;
      const playerPct = 100 - floatPct;
      const annualReturn = (monthlyNOI - interest) * 12;
      const tick = activistTick(s.cash, eq, annualReturn);
      let delta = tick.delta;
      const reasons = tick.reason ? [tick.reason] : [];
      if (s.marketCycle?.phase === "bust") delta += 0.5;
      if ((s.recessionMonthsLeft ?? 0) > 0) delta += 0.5;
      const fbab = s.stocks.find((st) => st.id === "FBAB");
      if (fbab && (s.ipoPrice ?? 0) > 0 && fbab.price < s.ipoPrice! * 0.7) {
        delta += 1.5;
        reasons.push("share price collapse");
      }
      if (s.reputation > 70) delta -= 0.5;
      const before = s.takeoverPressure ?? 0;
      s.takeoverPressure = +Math.max(0, Math.min(floatPct, before + delta)).toFixed(2);
      const stake = s.takeoverPressure;
      const threshold = Math.min(ACTIVIST_TAKEOVER_AT, playerPct);
      if (delta > 0 && reasons.length && Math.floor(stake / 10) > Math.floor(before / 10)) {
        events.push({
          t: `🦈 Kronfelt Capital now owns ${Math.round(stake)}% of the company (${reasons.join(" and ")}). You hold ${Math.round(playerPct)}% — they take over past ${Math.round(threshold)}%. Dividends, buybacks or stronger returns push them out.`,
          kind: "warn",
        });
      }
      // Sista varningen: aktivisten närmar sig röstmajoritet → fientligt bud.
      if (stake >= threshold - 6 && before < threshold - 6 && stake < threshold && !s.pendingDecision) {
        const buybackCost = Math.round(Math.max(5_000_000, eq * 0.06));
        s.pendingDecision = {
          id: "hostile_takeover",
          title: "Hostile takeover bid",
          text: `Kronfelt Capital holds ${Math.round(stake)}% against your ${Math.round(playerPct)}% and demands board seats. Defend your control or sell.`,
          options: [
            {
              label: "Buy back shares",
              detail: `${msek(buybackCost)} · activist stake −15 pts · rep +3`,
              effect: {
                cash: -buybackCost,
                reputation: 3,
                takeoverPressure: -15,
                log: "Bought back shares and defended control. The activist position shrinks sharply.",
                logKind: "income",
              },
            },
            {
              label: "PR offensive",
              detail: "$2M · activist stake −6 pts · rep +8",
              effect: {
                cash: -2_000_000,
                reputation: 8,
                takeoverPressure: -6,
                log: "The PR campaign rallied shareholders behind you — the activist backs off, for now.",
                logKind: "income",
              },
            },
            {
              label: "Accept the takeover bid",
              detail: "The company is sold — the game ends",
              effect: {
                gameOver: true,
                log: "The company was sold to Kronfelt Capital. The game is over.",
                logKind: "warn",
              },
            },
          ],
        };
        events.push({ t: "🚨 HOSTILE BID: Kronfelt Capital moves on the board. A decision is required immediately!", kind: "warn" });
      }
      if (stake >= threshold) {
        s.gameOver = true;
        s.gameOverReason = {
          icon: "🦈",
          title: "Hostile takeover",
          text: `Kronfelt Capital reached ${Math.round(stake)}% ownership against your ${Math.round(playerPct)}% and voted you off the board. Weak shareholder returns fed the activists. Next run: keep a smaller float, pay dividends, buy back shares — or keep returns up.`,
        };
        events.push({
          t: `🦈 HOSTILE TAKEOVER: Kronfelt Capital reaches ${Math.round(stake)}% and votes you off the board. The empire is no longer yours.`,
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
          events.push({ t: `🚨 The crisis deepens: property values fall (market level ${Math.round(s.marketMod * 100)}%). ${Math.ceil(left)} mo left.`, kind: "warn" });
      } else {
        // Återhämtningen skalar mot fallet: gamla 1,012 tog bara tillbaka
        // knappt hälften av kraschen och lämnade ett permanent ärr på ~9 %
        // per kris – i sena partier blev trenden därför bara nedåt. 1,022
        // gör krisen till en korrektion mot trend (~−4 % netto), inte ett hål.
        s.marketMod = +(s.marketMod * 1.022).toFixed(3);
      }
      s.crisisMonthsLeft = left - 1;
      if (s.crisisMonthsLeft === 0)
        events.push({ t: `🌅 The crisis is over — the credit market reopens and prices bottom out. The next cycle now begins.`, kind: "event" });
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
                t: `⚖️ COMPETITION AUTHORITY: Your dominance in ${d.name} leads to forced regulation of ${target.typeLabel} (rent −20%, the housing queue takes over).`,
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
          events.push({ t: `⚖️ Supervision fee: ${kr(supervised * SUPERVISION_FEE)}/mo (dominance in ${supervised} districts).`, kind: "expense" });
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
          t: `${proj.icon} OPENING: ${proj.name} is complete! The whole city celebrates — the area lifts and your name is written into history.`,
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
            txHistory: [{ type: "built", price: m.cost, month: s.month, year: s.year, party: "You (district project)" }],
          },
        ];
        s.signatureBlocks = [...(s.signatureBlocks ?? []), { blockId: m.blockId, profile: profile.id }];
        s.districtDev = {
          ...(s.districtDev ?? {}),
          [m.district]: +(((s.districtDev?.[m.district] ?? 1) + profile.devBoost).toFixed(3)),
        };
        s.reputation = Math.min(100, s.reputation + profile.reputation);
        events.push({
          t: `${profile.icon} OPENING: The signature block ${profile.name} in ${d.name} is complete! ${Math.round(area / 1000)} thousand m² open their doors, the whole district lifts and the city's skyline is forever changed.`,
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
    // Allianser ger medvind, fejder motvind (rivalCycleMult).
    nc.monthlyNOI = Math.round((portVal * 0.06 * cycleNOI * rivalCycleMult(s, nc.name)) / 12);
    // Rivalerna behåller bara en DEL av driftnettot: resten går till bolags-
    // kostnader, räntor och utdelning till ägarna (spelarens 6 % slåss mot
    // opex/ränta/underhåll – rivalernas var ren vinst, och på 25 år
    // komposterade det till kassaberg som toppade rankingen med 30 hus).
    const retention =
      nc.strategy === "tillväxt" ? 0.6 : nc.strategy === "utdelning" ? 0.3 : 0.45;
    rivalCashflow(nc, Math.round(nc.monthlyNOI * retention));
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
      events.push({ t: `🏢 ${nc.name} completed its new build: ${finishedBuild}.`, kind: "event", rival: nc.name });
    // Nybyggnation: kapitalstarka bolag bygger i sina distrikt när det
    // inte är lågkonjunktur – staden växer även utan spelaren.
    // Stor kassa bränner i fickan: bygglusten skalar med likviditeten så
    // rikedom blir synliga hus på kartan i stället för osynliga kassaberg.
    const cashAppetite = 1 + Math.min(1.5, nc.cash / 60_000_000);
    const buildChance = (nc.strategy === "tillväxt" ? 0.05 : 0.02) * cashAppetite;
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
        events.push({ t: `🏗️ ${nc.name} is building anew: ${build.typeLabel} in ${dObj?.name ?? build.districtName} (${msek(cost)}).`, kind: "event", rival: nc.name });
      }
    }
    // Investeringsdriven mognad (Fas 2): kapitalstarka rivaler bygger PÅ sina
    // egna hus i heta distrikt (uppåtgående/exklusivt) – deras hus reser sig på
    // kartan, upp till distriktets investeringstak. Stadens skyline mognar
    // därmed av faktiska investeringar, inte av sig själv.
    if (cyclePhase !== "bust" && nc.cash > 5_000_000 && random01() < 0.035 * cashAppetite * rateAppetite(s.interestRate)) {
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
          events.push({ t: `🏗️ ${nc.name} is extending its building in ${p.districtName} — the block rises.`, kind: "event", rival: nc.name });
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
    // samma NOI-logik som spelarens (6 %/år på tillgångsvärdet), med samma
    // retention som fastighetsdelen.
    const indVal = (nc.industries ?? []).reduce((a, x) => a + industryAssetValue(x, s), 0);
    if (indVal > 0) rivalCashflow(nc, Math.round((indVal * 0.06 * cycleNOI * retention) / 12));
    nc.equity = nc.cash + indVal + nc.portfolio.reduce((a, p) => a + propMarketValue(p, s), 0);
    // Kapitaldisciplin: fastighetsbolag sitter inte på halva förmögenheten i
    // likvider. Kassa över ~40 % av eget kapital delas ut i takt om 8 %/mån –
    // gamla partiers uppbyggda berg smälter bort inom ett par år. (Fonderna
    // undantas: deras likviditet styrs av moderfondens gummiband ovan.)
    if (!nc.institutional) {
      const maxCash = Math.max(10_000_000, nc.equity * 0.4);
      if (nc.cash > maxCash) {
        nc.cash = Math.round(nc.cash - (nc.cash - maxCash) * 0.08);
        nc.equity = nc.cash + indVal + nc.portfolio.reduce((a, p) => a + propMarketValue(p, s), 0);
      }
    }
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
        t: `🏭 ${buyer.name} acquires ${target.name} (${msek(target.purchasePrice)}) – the industry market is no longer yours alone.${iq ? " " + iq : ""}`,
        kind: "warn",
        rival: buyer.name,
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
        t: `🏢 ${buyer.name} bought ${taken.typeLabel} in ${taken.districtName} for ${msek(price)}.`,
        kind: "event",
        rival: buyer.name,
      });
    }
  }

  // ── Inkommande bud på dina fastigheter ──────────────────────────
  // Räkna ner befintliga bud, släng utgångna.
  let offers: Offer[] = (s.offers ?? [])
    .map((o) => ({ ...o, expiresIn: o.expiresIn - 1 }))
    .filter((o) => {
      if (o.expiresIn <= 0) {
        events.push({ t: `⌛ The bid on ${o.propLabel} in ${o.districtName} was withdrawn.`, kind: "info" });
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
      t: `📨 ${offers[offers.length - 1].from} bids ${msek(amount)} for your ${target.typeLabel} in ${target.districtName}.`,
      kind: "event",
      rival: offers[offers.length - 1].from,
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
        events.push({ t: `💥 Bidding war over ${p.typeLabel} in ${p.districtName}! ${from} outbids: ${msek(rivalBid)}.`, kind: "event", rival: from });
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
      events.push({ t: `🏷️ ${from} bids ${msek(amount)} on your listed ${p.typeLabel} in ${p.districtName}.`, kind: "event", rival: from });
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
      events.push({ t: `📦 ${from} bids ${msek(amount)} on the whole ${pkg.name} (${pkg.propertyIds.length} properties).`, kind: "event", rival: from });
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
    events.push({ t: `📉 Short-selling cost: ${kr(shortCost)}/mo (borrow fee 0.5%).`, kind: "expense" });
  }
  // Tvångstäckning om aktie stigit > 80 % från blankningspris
  s.stocks = s.stocks.map((st) => {
    if (!(st.shortQty ?? 0) || !st.shortAvgPrice) return st;
    if (st.price > st.shortAvgPrice * 1.80) {
      const qty = st.shortQty!;
      const pnl = Math.round(qty * (st.shortAvgPrice - st.price));
      const collateral = Math.round(st.shortAvgPrice * qty * 1.5);
      cashflow(s, Math.max(0, collateral + pnl), "blankning återförd");
      events.push({ t: `🚨 Margin call! Short in ${st.name} force-covered @ ${kr(st.price)}. Loss: ${kr(Math.abs(pnl))}.`, kind: "warn" });
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

  // ── IPO: uppdatera aktiekurs ───────────────────────────────────
  if (s.ipoActive && s.ipoShares) {
    // Uppdatera FBAB-kurs baserat på eget kapital
    // Kursen följer eget kapital per aktie. Ägarspelet (aktivistens andel,
    // fientliga bud, övertagande) bor i den enade aktivistmodellen ovan –
    // det gamla parallella "uppköpstrycket" som kröp +1,5/mån villkorslöst
    // är borttaget: uppköpshotet ska ha ORSAKER, inte en timer.
    s.stocks = s.stocks.map((st) => {
      if (st.id !== "FBAB") return st;
      const newPrice = Math.max(0.01, equityOf(s) / s.ipoShares!.total);
      return { ...st, prevPrice: st.price, price: newPrice, history: [...st.history, newPrice].slice(-32) };
    });
  }

  // ── Löner (anställda) ───────────────────────────────────────────
  const salaries = salariesTotal(s);
  if (salaries > 0) {
    cashflow(s, -salaries, "löner");
    if (s.month % 3 === 0)
      events.push({ t: `👔 Salaries paid: ${kr(salaries)}/mo.`, kind: "expense" });
  }
  // Marknadschef stärker varumärket
  const repGain = monthlyReputation(s);
  if (repGain > 0) s.reputation = Math.min(100, s.reputation + repGain);

  // Revolving credit auto-unlock at rep 40
  if (s.reputation >= 40 && !s.revolving) {
    const portVal = s.portfolio.reduce((a, p) => a + propMarketValue(p, s), 0);
    const limit = Math.max(500_000, Math.round(portVal * 0.05));
    s.revolving = { limit, used: 0 };
    events.push({ t: `💳 Revolving credit activated: ${kr(limit)} available (5% of portfolio value).`, kind: "income" });
  }

  // Advisory board auto-unlock at rep milestones
  const advisors = s.advisors ?? [];
  if (s.reputation >= 60 && !advisors.includes("ekonom")) {
    s.advisors = [...advisors, "ekonom"];
    events.push({ t: "🎓 Advisory board: Economic advisor added (rep 60+). Provides analytics support.", kind: "info" });
  }
  if (s.reputation >= 80 && !advisors.includes("jurist") && !(s.advisors ?? []).includes("jurist")) {
    s.advisors = [...(s.advisors ?? advisors), "jurist"];
    events.push({ t: "⚖️ Advisory board: Legal advisor added (rep 80+). Halves rezoning time.", kind: "info" });
  }
  if (s.reputation >= 95 && !advisors.includes("kapitalstrateg") && !(s.advisors ?? []).includes("kapitalstrateg")) {
    s.advisors = [...(s.advisors ?? advisors), "kapitalstrateg"];
    events.push({ t: "📊 Advisory board: Capital strategist added (rep 95+). Lowers the interest spread.", kind: "info" });
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
            ? `${tier.icon} URBAN TRANSFORMATION: ${d.name} is now classed as ${tier.name} – rents and values rise with the area’s reputation.`
            : `${tier.icon} ${d.name} has slipped down to ${tier.name} – deferred maintenance and weak development weigh on the area.`,
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
          t: `🏆 WHOLE BLOCK! ${s.companyName ?? "The Company"} now owns the entire block ${blockId.replace("-kv", " ")} – coordinated operations give +10% rent and −15% operating cost (rep +2).`,
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
        events.push({ t: `🌱 ESG rating ${rating.letter}: green loan active – the interest spread is cut by ${Math.abs(rating.spreadDelta).toFixed(2)} pp.`, kind: "income" });
      else if (rating.spreadDelta > 0)
        events.push({ t: `🏭 ESG rating ${rating.letter}: the banks demand ${rating.spreadDelta.toFixed(2)} pp extra interest spread. Upgrade your portfolio's energy!`, kind: "warn" });
      else events.push({ t: `♻️ ESG rating changed to ${rating.letter}.`, kind: "info" });
    }
    s.esgRating = rating.letter;
    // Dålig hållbarhet göder aktivister efter börsnoteringen.
    if (s.ipoActive && rating.spreadDelta > 0)
      s.takeoverPressure = Math.min(100, (s.takeoverPressure ?? 0) + 1.5);
  }

  // ── Notabla hyresgäster: en namngiven karaktär söker lokal ───────
  // Sällsynt, och bara om en passande ledig lokal finns: en av stadens
  // notabla hyresgäster flyttar in — ett ansikte, en hyrespremie och för
  // prestigenamn ett lyft för både distrikt och rykte.
  if (random01() < 0.05) {
    const match = findNotableMoveIn(s);
    if (match) {
      const pi = s.portfolio.findIndex((p) => p.id === match.propertyId);
      if (pi >= 0) {
        const p = s.portfolio[pi];
        const slot = p.capacity > 0 ? propPotentialRent(p, s) / p.capacity / 12 : 0;
        const t = signNotable(match.notable, slot);
        s.portfolio = s.portfolio.map((pp, i) => (i === pi ? { ...pp, tenants: [...pp.tenants, t] } : pp));
        if (match.notable.trait === "prestige") {
          s.reputation = Math.min(100, s.reputation + 2);
          s.districtDev = {
            ...s.districtDev,
            [p.district]: +(((s.districtDev?.[p.district] ?? 1) + 0.03)).toFixed(3),
          };
        }
        events.push({
          t: `✨ ${match.notable.name} — ${match.notable.bio} — has leased space in your ${p.typeLabel} in ${p.districtName}.`,
          kind: "event",
        });
      }
    }
  }

  // ── Hyresgästbetyg: publikt rykte som andas långsamt ─────────────
  // Väger samman nöjdhet/lojalitet/klagomål/vakans till ETT betyg (A–F).
  // Höga betyg lyfter reputation långsamt, låga drar ned – hur du behandlar
  // hyresgästerna blir en reputationsfråga, inte bara en siffra i en flik.
  {
    const ts = tenantScoreOf(s);
    const hasTenants = s.portfolio.some((p) => p.tenants.length > 0);
    if (hasTenants) {
      if (ts.score >= 80) s.reputation = Math.min(100, +(s.reputation + 0.2).toFixed(1));
      else if (ts.score < 35) s.reputation = Math.max(0, +(s.reputation - 0.3).toFixed(1));
    }
    const prev = s.tenantScoreLetter;
    if (hasTenants && prev && prev !== ts.letter) {
      const improved = ts.letter < prev; // "A" < "B" < … (bättre = tidigare bokstav)
      events.push({
        t: improved
          ? `🌟 Tenant score up to ${ts.letter} — "${ts.label}". Word of a fair landlord spreads.`
          : `📉 Tenant score slips to ${ts.letter} — "${ts.label}". Renters are grumbling.`,
        kind: improved ? "income" : "warn",
      });
    }
    if (hasTenants) s.tenantScoreLetter = ts.letter;
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
      events.push({ t: `🏁 ${c.name} has reached its goal: ${ag.label}. The rival steps up – expect tougher competition.`, kind: "warn" });
      return { ...c, agenda: { ...ag, announced: true } };
    }
    return c;
  });

  // ── Rivalberättelser: nemesis, fejder och allianser ─────────────
  // Rivalerna får pågående historier som speglas i tidningen: en nemesis
  // deklareras när en relation surnat, och konkurrenterna sluter allianser
  // eller hamnar i fejd med varandra – stadens maktkamp.
  {
    const absNow = s.year * 12 + s.month;
    // Rensa relationer mot bortfusionerade rivaler.
    if (s.rivalRelations?.length) {
      const names = new Set(s.competitors.map((c) => c.name));
      s.rivalRelations = s.rivalRelations.filter((r) => names.has(r.a) && names.has(r.b));
    }
    // Nemesis deklareras eller avblåses när standing korsar tröskeln.
    // Under en pågående kampanj äger storyn nemesisen (t.ex. Rog) – rör den inte.
    if (!s.story || s.story.done) {
      const nem = nemesisOf(s);
      if (nem && nem !== s.nemesis) {
        s.nemesis = nem;
        const q = rivalQuote(nem, "budkrig", absNow);
        events.push({ t: `⚔️ ${nem} has declared open war on you — a bitter rivalry begins.${q ? " " + q : ""}`, kind: "warn", rival: nem });
      } else if (!nem && s.nemesis) {
        events.push({ t: `🕊️ Your feud with ${s.nemesis} has cooled — for now.`, kind: "info", rival: s.nemesis });
        s.nemesis = undefined;
      }
    }
    // Nemesis hotar då och då i pressen.
    if (s.nemesis && random01() < 0.12) {
      const q = rivalQuote(s.nemesis, "budkrig", absNow);
      events.push({ t: `🗣️ ${s.nemesis} vows to outmaneuver you in the months ahead.${q ? " " + q : ""}`, kind: "warn", rival: s.nemesis });
    }
    // Rival-mot-rival: bilda eller bryt en relation (sällsynt).
    if (s.competitors.length >= 2 && random01() < 0.05) {
      const a = pick(s.competitors);
      const b = pick(s.competitors.filter((c) => c.name !== a.name));
      if (!hasRelation(s, a.name, b.name)) {
        const kind = random01() < 0.5 ? "alliance" : "feud";
        s.rivalRelations = [...(s.rivalRelations ?? []), { a: a.name, b: b.name, kind, since: absNow }];
        events.push({
          t: kind === "alliance"
            ? `🤝 ${a.name} and ${b.name} have struck an alliance — the city's balance of power shifts.`
            : `⚔️ ${a.name} and ${b.name} are locked in a feud over territory.`,
          kind: "event",
        });
      } else {
        s.rivalRelations = (s.rivalRelations ?? []).filter(
          (r) => !((r.a === a.name && r.b === b.name) || (r.a === b.name && r.b === a.name)),
        );
        events.push({ t: `📰 The pact between ${a.name} and ${b.name} has fallen apart.`, kind: "event" });
      }
    }
  }

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
        t: `🏛️ PLAN AUCTION: ${shortage && !scheduled ? "The land shortage prompts the municipality to bring forward zoning — a" : "The municipality releases a"} new block in ${d.name} (${parcels.length} lots, opening bid ${msek(minBid)}). The game pauses until the auction is settled.`,
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
            t: `🏘️ The city grows: private developers have put up ${s.ambientGrown.length} new buildings since the start — most recently in ${d?.name ?? pc.district}.`,
            kind: "info",
          });
        }
      }
    }
  }

  // Råvarupris/byggkostnad mjukt tillbaka mot normalt
  s.buildCostMod = +(((s.buildCostMod ?? 1) * 0.85 + 0.15)).toFixed(3);

  // ── Presstemperatur svalnar ─────────────────────────────────────
  // Mediestormen efter vräkningar/hyreshöjningar klingar av med tiden.
  if ((s.pressHeat ?? 0) > 0) s.pressHeat = Math.max(0, +((s.pressHeat ?? 0) - 1).toFixed(2));

  // ── Skandalhändelse ─────────────────────────────────────────────
  // När tidningen vänder sig mot dig (många vräkningar, tomma hus eller
  // marknadsdominans) kan en skandal bryta ut. Egen cooldown så den inte
  // återkommer varje månad, och aldrig ovanpå ett redan väntande beslut.
  const nowAbsScandal = s.year * 12 + s.month;
  const scandalCd = s.lastScandalMonth == null || nowAbsScandal - s.lastScandalMonth >= 10;
  if ((!s.story || s.story.done) && !s.pendingDecision && scandalCd) {
    // Skalas ned till en per-månad-sannolikhet (topp ~15 % vid full risk).
    if (random01() < scandalRisk(s) * 0.2) {
      const scandal = makeScandal(s);
      s.pendingDecision = scandal;
      s.lastScandalMonth = nowAbsScandal;
      s.pressHeat = 0; // stormen bryter ut – temperaturen nollställs.
      events.push({ t: `📰 Scandal: ${scandal.title}`, kind: "warn" });
    }
  }

  // ── Beslutshändelse (~6 %) ──────────────────────────────────────
  // Under berättelseläget står kampanjen för besluten – slumpen väntar.
  if ((!s.story || s.story.done) && !s.pendingDecision && random01() < 0.06) {
    const decision = makeDecision(s);
    s.pendingDecision = decision;
    events.push({ t: `🤔 Decision required: ${decision.title}`, kind: "event" });
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
      events.push({ t: `🤝 ${x.buyer} picked up ${x.prop.typeLabel} in ${x.prop.districtName} when the listing expired (${msek(x.prop.askPrice)}).`, kind: "event" });
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
    events.push({ t: `🏗️ New construction expands the market: ${newProp.typeLabel} in ${newProp.districtName}.`, kind: "info" });
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
          events.push({ t: `🏦 COVENANT BREACH: ${breach} — and the cash is empty. Sell assets before the bank acts.`, kind: "warn" });
        }
      } else {
        events.push({ t: `🏦 The rating agency warns (rating ${info.rating}): ${breach}. New borrowing gets more expensive until the balance sheet is strengthened.`, kind: "warn" });
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
        t: `🏦 REFINANCING: The loan matures. New rate ${s.interestRate.toFixed(1)}% (${rateDiff >= 0 ? "+" : ""}${rateDiff.toFixed(1)}%). Market: ${cycle}${recSpread > 0 ? ", downturn" : ""}.`,
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
        t: `📈 ${s.companyName ?? "The Company"} meets the requirements for ${tier.name}! Open Company and expand (${msek(tier.upgradeCost)}).`,
        kind: "income",
      });
    }
  }

  // Tid
  s.month += 1;
  if (s.month > 12) {
    s.month = 1;
    s.year += 1;
    // Sekulär trend: svagt positiv årsdrift (E ≈ +2 %/år – staden växer och
    // betalningsviljan stiger). Gamla intervallet 0,99–1,04 lät slumpen äta
    // upp driften medan chockerna drog nedåt – summan blev negativ över tid.
    s.marketMod = +(s.marketMod * rnd(1.0, 1.045)).toFixed(3);
    // Årsbokslut: hur gick året för bolaget?
    const prevYearEq = s.history[s.history.length - 12]?.equity;
    if (prevYearEq !== undefined && prevYearEq !== 0) {
      const eqNow = equityOf(s);
      const diffPct = Math.round(((eqNow - prevYearEq) / Math.abs(prevYearEq)) * 100);
      events.push({
        t: `📆 ANNUAL REPORT ${calYear(s.year - 1)}: equity ${msek(eqNow)} (${diffPct >= 0 ? "+" : ""}${diffPct}% over the year), ${unitCount(s)} properties in the portfolio.`,
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
        { t: `🏆 GOAL REACHED: ${sc.title} – ${sc.subtitle}! Completed ${formatMonthYear(s.month, s.year)}.`, kind: "income" },
        ...s.log,
      ];
    }
  }

  // Rival race: rival som når scenariomålet före spelaren = förlust för spelaren
  if (!s.gameOver && !s.gameWon && s.scenarioId && s.scenarioId !== "sandbox") {
    for (const rival of s.competitors) {
      if (rivalWinsScenario(rival, s.scenarioId, s)) {
        s.gameOver = true;
        s.gameOverReason = {
          icon: "🏳️",
          title: "You lost the race",
          text: `${rival.name} reached the scenario goal before you. The city's rivals grow every month — watch the leaderboard in the Rivals hub, and slow the leader down by outbidding them on listings they want. Next run: expand a little faster, and never leave cash idle.`,
        };
        s.log = [
          { t: `🏳️ ${rival.name} reached the goal "${s.scenarioId}" before you — you lost the race!`, kind: "warn" },
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
      events.push({ t: `🏅 MILESTONE: ${ms.title} – ${ms.desc} (Reward: ${ms.reward})`, kind: "income" });
    }
  }

  const net = monthlyNOI - interest;
  const summary: LogEntry = {
    t: `${formatMonthYear(s.month, s.year)}: net operating income ${kr(monthlyNOI)} − interest ${kr(interest)} = ${kr(net)}.`,
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

  // ── Illikviditet vs. insolvens ───────────────────────────────────
  // Under konkursgolvet pausar spelet: bolaget går i FÖRETAGSREKONSTRUKTION
  // och spelaren väljer själv i ReceivershipModal vilka tillgångar som säljs
  // (−25 %) – eller lämnar över till förvaltaren (−35 %). Konkurs (game over)
  // inträffar bara vid äkta insolvens: när inte ens full likvidering kan
  // lyfta kassan över golvet. Ticker en månad medan rekonstruktionen redan
  // pågår (spolning/AFK/tester) tar förvaltaren över och löser den själv.
  const CASH_WARN = -200_000;
  if (s.cash < CASH_WARN && s.cash >= BANKRUPTCY_FLOOR && !s.gameOver) {
    s.log = [{ t: `🚨 CASH ALERT: ${kr(s.cash)} in the account. Below ${kr(BANKRUPTCY_FLOOR)} the company enters receivership — raise cash or sell something first!`, kind: "warn" }, ...s.log];
  }
  if (!s.gameOver && !s.settings?.noBankruptcy) {
    if (s.receivership) {
      if (s.cash >= 0) {
        // Kassan återhämtade sig (spelarens försäljningar eller månadens hyror).
        // Banken släpper inte taget: rekonstruktionsvillkoren gäller ändå.
        s.receivership = undefined;
        Object.assign(s, imposeRestructuringTerms(s));
        s.log = [{ t: `⚖️ The restructuring is resolved — liquidity restored. The bank imposes ${RESTRUCTURING_MONTHS}-month covenants: mandatory amortization and capped new lending.`, kind: "info" }, ...s.log];
      } else {
        // Deadline: rekonstruktionen låg kvar över ett månadsskifte
        // (spolning/AFK/soak) – förvaltaren agerar åt spelaren.
        const res = receiverAutoLiquidate(s);
        Object.assign(s, res.state);
        s.receivership = undefined;
        if (res.sold > 0 && s.cash >= BANKRUPTCY_FLOOR) {
          Object.assign(s, imposeRestructuringTerms(s));
          s.log = [{ t: `⚖️ The receiver stepped in and sold ${res.sold} propert${res.sold > 1 ? "ies" : "y"} to keep the company alive — and the bank imposes ${RESTRUCTURING_MONTHS}-month covenants.`, kind: "warn" }, ...s.log];
        }
        if (s.cash < BANKRUPTCY_FLOOR) {
          s.gameOver = true;
          s.gameOverReason = {
            icon: "💥",
            title: "Bankruptcy",
            text: `The receivership failed: the receiver sold what could be sold, but cash was still ${kr(s.cash)} — below the ${kr(BANKRUPTCY_FLOOR)} floor. The remaining debt of ${msek(s.debt)} had no assets left behind it. Next run: act in the crisis menu before the deadline, and keep an equity cushion so a receiver has something to work with.`,
          };
          s.log = [{ t: "💥 BANKRUPTCY! Nothing left to sell and cash below -$1,000,000 — the company is insolvent. The game is over.", kind: "warn" }, ...s.log];
        }
      }
    } else if (s.cash < BANKRUPTCY_FLOOR) {
      if (isInsolvent(s)) {
        // Inte ens allt sålt räcker: äkta insolvens → konkurs direkt.
        // Slutskärmen förklarar med siffror varför ingen meny kunde hjälpa.
        const raisable = maxRaisable(s);
        s.gameOver = true;
        s.gameOverReason = {
          icon: "💥",
          title: "Bankruptcy — insolvent",
          text: `Debts of ${msek(s.debt)} exceeded everything the company owned: with cash at ${kr(s.cash)}, even a full fire-sale liquidation (≈${msek(raisable)} net) could not lift the account above the ${kr(BANKRUPTCY_FLOOR)} floor. The company was over-leveraged — with no equity cushion left, there was nothing for a receiver to restructure around. Next run: keep loan-to-value lower and hold a cash buffer before expanding.`,
        };
        s.log = [{ t: "💥 BANKRUPTCY! Debts exceed everything the company owns — not even a full liquidation could cover the shortfall. The game is over.", kind: "warn" }, ...s.log];
      } else {
        // Krisen bryter ut: spelet pausar och menyn öppnas. Engångssmällen
        // (rykte, bankförtroende, presstemperatur) tas HÄR – händelsen är
        // offentlig oavsett hur den sedan löses.
        s.receivership = { shortfall: -s.cash, enteredAbs: s.year * 12 + s.month };
        s.reputation = Math.max(0, s.reputation - RECEIVERSHIP_REP_HIT);
        s.standing = adjustStanding(s.standing, { kind: "bank" }, -RECEIVERSHIP_BANK_HIT);
        s.pressHeat = Math.min(20, (s.pressHeat ?? 0) + RECEIVERSHIP_PRESS_HIT);
        s.log = [{ t: `⚖️ RECEIVERSHIP: cash is ${kr(s.cash)} and the bank has appointed a receiver. Choose which assets to sell (−25% vs. value) — or the receiver will choose for you (−35%).`, kind: "warn" }, ...s.log];
      }
    }
  } else if (s.cash < BANKRUPTCY_FLOOR && s.settings?.noBankruptcy) {
    if (s.cash > -1_100_000)
      s.log = [{ t: "💥 Cash below -$1,000,000 – bankruptcy is disabled, but the bank rolls its eyes.", kind: "warn" }, ...s.log];
  }
  // Rekonstruktionsvillkoren löper ut: banken återgår till normala villkor.
  if (s.restructuringTerms && !s.receivership && s.year * 12 + s.month >= s.restructuringTerms.untilAbs) {
    s.restructuringTerms = undefined;
    s.log = [{ t: "🏦 The restructuring covenants have expired — the bank restores normal amortization and lending terms.", kind: "info" }, ...s.log];
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
