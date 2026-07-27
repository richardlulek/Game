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
  propertyStandard,
  satisfactionTarget,
  signContract,
} from "./leasing";
import { DISTRICT_EVENTS, DISTRICTS, EVENTS, MILESTONES, POLITICAL_PARTIES, PROP_TYPES, RARE_EVENTS, SMALL_AI_NAMES, UPGRADES } from "./data";
import { agendaFor } from "./initState";
import { CHAINS, bumpChainCounter } from "./milestoneChains";
import {
  DEAL_COOLDOWN_MONTHS,
  DIVEST_FINE_SHARE,
  DIVEST_MONTHS,
  HOSTILE_REALIZE,
  INTEGRATION_FRICTION,
  RETENTION_CHURN_MULT,
  RETENTION_REALIZE_BONUS,
  MA_ADVISOR_FEE,
  RIVAL_BID_GRACE_MONTHS,
  executeAcquisition,
  hostileDefense,
  integrationScore,
  ownerResponse,
  rivalMergerBlocked,
} from "./mna";
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
  cannotRestart,
  receiverAutoLiquidate,
} from "./receivership";
import { findNotableMoveIn, notableById, signNotable } from "./notableTenants";
import { hasRelation, nemesisOf, pickMerger, rivalCycleMult } from "./rivalArcs";
import { adjustStanding, rivalStanding } from "./standing";
import { tenantScoreOf } from "./tenantScore";
import { VETERAN_RISK_MULT, becomesVeteran, tenantLifeEvent } from "./tenantLife";
import { cityVacancyRate, movePressure, rateAppetite } from "./economyLife";
import { ageStepFactor, ageWearFactor, buildingAge } from "./lifecycle";
import { PHASED_MONTHS_PER_UNIT, PHASED_SATISFACTION_HIT, applyPhase, phaseCost, phasedRentReduction } from "./phased";
import {
  RIVAL_CASH_BUFFER,
  RIVAL_ICR_GRACE_MONTHS,
  applyDistressProceeds,
  rivalAmortShare,
  rivalFinancePurchase,
  rivalICR,
  rivalInterest,
  rivalLeverage,
  strategyBias,
} from "./rivalFinance";
import { INFRA_KINDS_2, accessibilityOf, gentrificationDrift, openInfra } from "./infrastructure";
import {
  CRISIS_MONTHS,
  DOMINANCE_SUPERVISED_SHARE,
  FUNDS,
  FUND_TRIGGER_EQUITY,
  MEGA_PROJECTS,
  SUPERVISION_FEE,
  activistTick,
  districtShareOf,
  dividendRelief,
  fundsActive,
  shouldTriggerCrisis,
} from "./lateGame";
import {
  CONVERTIBLE_TRIGGER,
  COVENANT_BREACH_MONTHS,
  COVENANT_ICR_FLOOR,
  CP_SPREAD,
  CP_TERM_MONTHS,
  HOLDING_TAX_DELTA,
  INTEREST_CAP_OF_NOI,
  IR_COST_MIN,
  IR_COST_OF_EQUITY,
  TAX_AUDIT_CHANCE,
  TAX_DEP_AGGRESSIVE,
  TAX_DEP_NORMAL,
  amortInfoOf,
  equityOf,
  loanTerms,
  portfolioValue,
  revolvingLimitOf,
} from "./finance";
import { covenantBreach, creditRatingOf } from "./rating";
import { tickCityEvent } from "./cityEvents";
import { aggressionOf, rivalQuote } from "./rivalPersonas";
import { kr, msek } from "./format";
import { calYear, daysInMonth, formatMonthYear } from "./date";
import { pendingWork, propAnnualOpex, propMarketValue, propNOI, propPotentialRent } from "./property";
import { genListing, genLot, genWorldProperty, makeTenant } from "./generators";
import { seasonOf } from "./season";
import { RESEARCH, monthlyReputation, salariesTotal, taxAuditMult, wearMult } from "./progression";
import { newId, pick, random01, rnd } from "./random";
import { attractiveness, interestChance, offerAmount, packageOfferAmount, packageStats, pickStrategicSale, rivalSellChance } from "./selling";
import { activistControl, applyStockNews, executeLimitOrders, fbabSharesOf, maybeListingEvents, priceStocks, quarterlyEarnings, rivalFbabShares, rivalHoldingsValue, rivalNews, rivalShareTrading, stepSentiment, stepStocksDaily, stockHoldingsValue } from "./stocks";
import { industryAssetValue, makeIndustryAssetFromTemplate, tickHotel, tickEnergy, tickLogistik } from "./industries";
import { OWN_INSURER_PREMIUM_MULT, tickBank, tickInsurer } from "./finInstitutions";
import { tickPopulation } from "./population";
import { pickManagerWork, workSpec } from "./works";
import { centralBankDecision, curveInverted, longRate, tickInflation } from "./centralBank";
import { SYSTEMIC_SHARE, TBTF_SHARE, cyclePressures, nextHeat, nextOverhang, nextPhase, nextVacAnchor, playerMarketShare } from "./cycle";
import {
  CAMPAIGN_LEAD,
  CAMPAIGN_WIN_OPEN,
  CAMPAIGN_WIN_SECRET,
  CAPITAL_HEAT_THRESHOLD,
  CAPITAL_WIN_BONUS,
  ELECTION_PERIOD,
  FAVOR_MONTHS,
  SECRET_SCANDAL_CHANCE,
  campaignDecision,
  campaignWinBoost,
  favorAuctionMult,
  nextPoliticalCapital,
  politicalFavorActive,
} from "./politics";
import { maybePoachingDecision } from "./executives";
import { SPINOFF_DIVIDEND_PAYOUT, SPINOFF_UPKEEP_COND, SPINOFF_UPKEEP_PCT, spinoffSharePrice } from "./spinoffs";
import { INDUSTRY_TEMPLATES } from "./industryData";
import type { CompetitorStrategy, GameState, InfraProject, LogEntry, Offer, Tenant } from "./types";

/* Portföljdirektörens arvode: en liten fast stab plus 3 % av hyran per hus
   (golv 2 500 kr) – kostnaden följer beståndet i stället för att ligga som en
   platt klumpsumma över även det allra minsta bolaget. */
/* Ett bolag utan hus: hur länge det får stå tomt innan det avvecklas, och
   när varningen går ut. Ett år är gott om tid för marknaden att byta annonser
   – men inte ett decennium av tomma månader. */
const WIND_UP_MONTHS = 12;
const WIND_UP_WARN_MONTHS = 6;

/* Underhåll: en hel rond kostar 2 % av värdet och ger +15 skick. Förvaltaren
   får lägga högst halva kassan på en rond, och gör inget alls om den inte
   räcker till minst en fjärdedel av jobbet. */
export const MAINTAIN_GAIN = 15;
const MAINTAIN_CASH_SHARE = 0.5;
const MAINTAIN_MIN_SHARE = 0.25;

const GM_FEE_BASE = 4_000;
const GM_FEE_OF_RENT = 0.03;
const GM_FEE_MIN_PER_PROP = 2_500;

/**
 * Portföljdirektörens månadsarvode. Kostnaden följer det som faktiskt
 * förvaltas – 3 % av hyran per hus (samma sats som en enskild förvaltare
 * tar) med ett golv per hus, plus en liten fast stab. Ett fast arvode slukade
 * tidigare fyra tiondelar av hyran i ett enhusbolag och gjorde det första
 * huset olönsamt oavsett belåningsgrad. Ingen portfölj, inget arvode.
 */
export function globalManagerFee(state: GameState): number {
  if (!state.globalManager?.active || state.portfolio.length === 0) return 0;
  const perProp = state.portfolio.reduce(
    (a, p) => a + Math.max(GM_FEE_MIN_PER_PROP, Math.round(p.tenants.reduce((b, t) => b + t.rent, 0) * GM_FEE_OF_RENT)),
    0,
  );
  return GM_FEE_BASE + perProp;
}

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

  // ── Den emergenta konjunkturcykeln (cycle.ts) ────────────────────
  // Boom och bust härleds ur stadens obalanser (kredit, byggtakt, vakans,
  // räntegap, sentiment) i stället för den gamla slumptimern. Hysteresen
  // (minst 6 mån/fas) hindrar fladder; en boom kan krascha rakt i bust.
  if (!s.marketCycle) {
    s.marketCycle = { phase: "stable", monthsRemaining: 12, age: 0, overhang: 0 };
  }
  {
    const pressures = cyclePressures(s);
    const heat = nextHeat(s.marketCycle.heat ?? 0, pressures, s.marketCycle.phase, s.marketCycle.age ?? 0);
    const cur = s.marketCycle.phase;
    const next = nextPhase(cur, s.marketCycle.age ?? 0, heat);
    const overhang = nextOverhang(s);
    const vacAnchor = nextVacAnchor(s);
    if (next !== cur) {
      const why = pressures.drivers.length > 0 ? ` Drivers: ${pressures.drivers.slice(0, 3).join(", ")}.` : "";
      s.marketCycle = { phase: next, monthsRemaining: 12, age: 0, overhang, heat, vacAnchor };
      if (next === "boom") {
        s.marketMod = +(s.marketMod * 1.08).toFixed(3);
        s.demandMod = +(s.demandMod * 1.04).toFixed(3);
        events.push({ t: `📈 UPTURN! The city's imbalances tip into a boom.${why}`, kind: "income" });
      } else if (next === "bust") {
        s.marketMod = +(s.marketMod * 0.92).toFixed(3);
        s.demandMod = +(s.demandMod * 0.96).toFixed(3);
        events.push({ t: `📉 DOWNTURN! The market rolls over.${why}`, kind: "warn" });
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
        events.push({ t: `📊 The economy finds its balance — steady state.${why}`, kind: "event" });
      }
    } else {
      s.marketCycle = { ...s.marketCycle, age: (s.marketCycle.age ?? 0) + 1, overhang, heat, vacAnchor };
    }
  }
  const cyclePhaseNow = s.marketCycle.phase;

  // ── Systemviktighet: när imperiet blir marknaden ─────────────────
  {
    const share = playerMarketShare(s);
    if (share >= SYSTEMIC_SHARE && !s.systemicNoted) {
      s.systemicNoted = true;
      events.push({
        t: `🏛️ SYSTEMICALLY IMPORTANT: your empire now holds ${Math.round(share * 100)}% of the city's property values. Your vacancies and leverage move the whole cycle — and in a crisis, the state cannot let you fall.`,
        kind: "event",
      });
    } else if (share < TBTF_SHARE && s.systemicNoted) {
      s.systemicNoted = undefined;
    }
  }

  // ── Riksbanken 2.0: inflationsmodell + kvartalsvisa räntebesked ──
  // Inflationen härleds ur stadens verkliga läge (överhettning, bygg-
  // kostnader, befolkningstillväxt, cykel, chockimpulser) och styrräntan
  // söker sig mot ett Taylor-mål – i stället för den gamla rena
  // cykeltabellen. Se centralBank.ts.
  tickInflation(s);
  if (s.month % 3 === 1) {
    for (const ev of centralBankDecision(s)) events.push(ev);
  }
  // Avkastningskurvan: inverterad kurva (styrränta > långränta) är
  // marknadens recessionssignal – varnas en gång och tynger sentimentet.
  {
    const inv = curveInverted(s);
    if (inv && !s.centralBank?.inverted) {
      events.push({
        t: `📉 INVERTED YIELD CURVE: short rates (${s.interestRate.toFixed(2)}%) are above the 10-yr rate (${longRate(s).toFixed(2)}%) — markets are pricing in a downturn.`,
        kind: "warn",
      });
    }
    if (inv) s.marketSentiment = +(Math.max(0.55, (s.marketSentiment ?? 1) * 0.995)).toFixed(3);
    s.centralBank = { ...(s.centralBank ?? { inflation: 2, impulse: 0 }), inverted: inv };
  }

  // Decrement recession counter
  if ((s.recessionMonthsLeft ?? 0) > 0) {
    s.recessionMonthsLeft = (s.recessionMonthsLeft ?? 0) - 1;
  }

  // ── Befolkningsloopen: jobb → inflyttning → bostadstryck ─────────
  // Körs tidigt så månadens uthyrning ser färskt tryck (leasing.ts läser
  // housingPressure via pressureAppMult för bostadsfastigheter).
  s.population = { ...(s.population ?? {}) };
  for (const ev of tickPopulation(s)) events.push(ev);

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
  // Flyttkedjor: distrikt där en NY bostad blir klar denna månad (spelarens
  // nyproduktion/nybyggnation eller rivalernas byggen) – utlöser en puls där
  // hushåll i äldre hus med lägre standard flyttar upp (efter rivalblocket).
  const newHomeDistricts = new Set<string>();

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
          case "underhåll": {
            const gain = Math.round(w.gain ?? MAINTAIN_GAIN);
            np.condition = Math.min(100, np.condition + gain);
            events.push({ t: `🔧 Maintenance done: ${np.typeLabel} in ${np.districtName} (+${gain} condition).`, kind: "upg" });
            break;
          }
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
        if (np.type === "bostad" && (!np.renovation || np.renovation.kind === "nybyggnation"))
          newHomeDistricts.add(np.district);
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
          bumpChainCounter(s, "renovations"); // kedjan Renoveraren
        } else {
          np.vacancyMult = Math.max(0.6, np.vacancyMult * 0.80); // nyproducerat: 20 % lägre vakans
          s.reputation = Math.min(100, s.reputation + 5);
          bumpChainCounter(s, "builds"); // kedjan Byggmästaren
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
        // Hela ronden kostar 2 % av värdet och ger +15 skick. Räcker inte
        // kassan till hela jobbet lagar förvaltaren det den har råd med –
        // taket och stammarna får vänta. Utan den delbetalningen fanns en
        // fälla som stängde igen: ett litet bolag vars marginal är tiotusen
        // i månaden kunde aldrig betala en klumpsumma på ett par hundra
        // tusen, huset förföll, värdet föll, och med värdet marginalen.
        const fullCost = Math.round(propMarketValue(np, s) * 0.02);
        const spendable = Math.round(Math.max(0, s.cash) * MAINTAIN_CASH_SHARE);
        const cost = Math.min(fullCost, spendable);
        if (fullCost > 0 && cost >= fullCost * MAINTAIN_MIN_SHARE) {
          const share = cost / fullCost;
          const gain = Math.max(1, Math.round(MAINTAIN_GAIN * share));
          monthlyNOI -= cost;
          np.capexTotal = (np.capexTotal ?? 0) + cost;
          np.pendingWorks = [...(np.pendingWorks ?? []), { kind: "underhåll" as const, monthsLeft: 1, gain }];
          events.push({
            t: share >= 0.999
              ? `🔧 The manager ordered maintenance of ${np.typeLabel} in ${np.districtName} (threshold ${effectiveMaintainThreshold}) – +${gain} condition at month-end.`
              : `🔧 The manager ordered partial maintenance of ${np.typeLabel} in ${np.districtName} — cash only covered ${Math.round(share * 100)}% of the job, +${gain} condition at month-end.`,
            kind: "upg",
          });
        }
      }
    }
    // ── Etapprenovering ──────────────────────────────────────────
    // En lokal i taget medan resten av huset betalar hyra. Nedsättningen
    // för den störda lokalen dras från driftnettot; när etappen är klar
    // stänger applyPhase sin andel av gapet till noll års ålder, skick 100
    // och full hyrespotential, och nästa etapp beställs om kassan räcker.
    if (np.phased) {
      monthlyNOI -= phasedRentReduction(np);
      if (np.phased.monthsLeft > 0) {
        np.phased = { ...np.phased, monthsLeft: np.phased.monthsLeft - 1 };
        if (np.phased.monthsLeft === 0) {
          const before = np.phased.done;
          Object.assign(np, applyPhase(np, s));
          events.push({
            t: np.phased
              ? `🔨 Stage ${before + 1} of ${np.phased.total} done on ${np.typeLabel} in ${np.districtName} — the building is ${buildingAge(np, s)} years old and in ${Math.round(np.condition)} condition.`
              : `🔨 The phased renovation of ${np.typeLabel} in ${np.districtName} is complete — age reset, condition 100, energy class A, and the tenants never had to move out.`,
            kind: "upg",
          });
        }
      }
      // Nästa etapp startar när kassan räcker – annars pausar programmet
      // och väntar, utan att förfalla.
      if (np.phased && np.phased.monthsLeft === 0) {
        const cost = phaseCost(np, s);
        if (s.cash >= cost) {
          cashflow(s, -cost, "etapprenovering");
          np.capexTotal = (np.capexTotal ?? 0) + cost;
          np.phased = { ...np.phased, monthsLeft: PHASED_MONTHS_PER_UNIT };
          // En störd hyresgäst per etapp: bygget märks.
          if (np.tenants.length > 0) {
            const idx = np.phased.done % np.tenants.length;
            np.tenants = np.tenants.map((t, i) =>
              i === idx ? { ...t, satisfaction: Math.max(0, (t.satisfaction ?? 70) - PHASED_SATISFACTION_HIT) } : t,
            );
          }
        }
      }
    }

    // Building age extra wear – hus över 40 år accelererar (lifecycle.ts).
    const ageFactor = ageStepFactor(np, s) * ageWearFactor(np, s);
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
      // Veteran (tenantLife.ts): en 5+-årig nöjd hyresgäst blir en pelare i
      // huset – ett namn man känner igen och en tryggare betalare.
      if (becomesVeteran(t, consMonths)) {
        t.veteran = true;
        events.push({ t: `🏅 ${t.name} in ${np.districtName} has been a loyal tenant for five years — a pillar of the building now.`, kind: "income" });
      }
      const veteranFactor = t.veteran ? VETERAN_RISK_MULT : 1.0;
      const recFactor = (s.recessionMonthsLeft ?? 0) > 0 ? 2.5 : 1.0;
      // Hyresgästernas livscykel: konkursrisken andas med konjunkturen.
      const cycleRisk = cyclePhaseNow === "bust" ? 1.6 : cyclePhaseNow === "boom" ? 0.6 : 1.0;
      // Livshändelser: en nöjd, etablerad hyresgäst kan få ett mänskligt
      // ögonblick (barn, expansion, jubileum) som knuffar nöjdheten.
      const life = tenantLifeEvent(t, np, random01(), random01());
      if (life) {
        t.satisfaction = Math.min(100, (t.satisfaction ?? 60) + life.satDelta);
        events.push({ t: life.text, kind: "info" });
      }
      // Seasonal effect on default risk for residential
      const effDefaultRisk = t.defaultRisk * loyaltyFactor * veteranFactor * recFactor * cycleRisk * (np.type === "bostad" ? (seasonFactor > 1 ? 0.9 : 1.1) : 1.0);
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
    // CFO: utdelningspolicy – en andel av överskottskassan delas ut varje
    // kvartal (pro rata till aktieägarna efter noteringen; lugnar aktivisten).
    if (pol?.autoDividend?.enabled && hasCfo && s.month % 3 === 0) {
      const excess = s.cash - pol.autoDividend.cashFloor;
      const amt = Math.floor((Math.max(0, excess) * pol.autoDividend.pct) / 100_000) * 100_000;
      if (amt >= 200_000) {
        const ownerPct =
          s.ipoActive && s.ipoShares ? (s.ipoShares.total - s.ipoShares.public) / s.ipoShares.total : 1;
        const ownerCut = Math.round(amt * ownerPct);
        cashflow(s, -amt, "utdelning (CFO-policy)");
        s.dividendsPaid = (s.dividendsPaid ?? 0) + amt;
        s.ownerWealth = (s.ownerWealth ?? 0) + ownerCut;
        // Rivalägare (korsägandet) får sin andel kontant.
        if (s.ipoActive && s.ipoShares) {
          const totalSh = s.ipoShares.total;
          s.competitors = s.competitors.map((c) => {
            const held = fbabSharesOf(c);
            return held > 0 ? { ...c, cash: c.cash + Math.round((amt * held) / totalSh) } : c;
          });
        }
        const relief = dividendRelief(amt, equityOf(s));
        if (relief > 0) s.takeoverPressure = Math.max(0, (s.takeoverPressure ?? 0) - relief);
        events.push({
          t: `💼 The CFO policy paid a quarterly dividend of ${msek(amt)}${ownerPct < 1 ? ` — ${msek(ownerCut)} to you (${Math.round(ownerPct * 100)}% of the shares)` : ""}.`,
          kind: "income",
        });
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

  // ── Renoveringsprogrammet ────────────────────────────────────────
  // Direktören beställer ETT investeringsjobb i månaden, det som ger mest
  // tillbaka per krona bland de åtgärder policyn tillåter. Utvecklings-
  // projekt (totalrenovering, påbyggnad) tar huset ur drift och beställs
  // därför bara på hus som redan står tomma.
  {
    const job = pickManagerWork(s);
    if (job) {
      const spec = workSpec(job.work)!;
      const target = s.portfolio.find((p) => p.id === job.propertyId)!;
      if (job.work !== "etapprenovering") cashflow(s, -job.cost, `renoveringsprogram: ${job.work}`);
      s.portfolio = s.portfolio.map((p) => {
        if (p.id !== job.propertyId) return p;
        const np: typeof p = { ...p, capexTotal: (p.capexTotal ?? 0) + job.cost };
        if (job.work === "etapprenovering") {
          // Programmet startar bara – fastighetsloopen driver etapperna och
          // betalar dem en och en, så kostnaden dras inte här.
          return { ...p, phased: { done: 0, total: Math.max(1, p.capacity), monthsLeft: 0 } };
        }
        if (spec.needsVacant) {
          // Utvecklingsprojekt: huset går i byggnation som vid START_RENOVATION.
          return {
            ...np,
            status: "bygger" as const,
            buildLeft: spec.months,
            renovation: { kind: job.work as "totalrenovering" | "påbyggnad" },
            applications: [],
          };
        }
        return {
          ...np,
          pendingWorks: [...(np.pendingWorks ?? []), { kind: "uppgradering" as const, upgradeId: job.work, monthsLeft: spec.months }],
        };
      });
      events.push({
        t: `🛠️ The renovation programme ordered ${spec.name.toLowerCase()} for ${target.typeLabel} in ${target.districtName} (${kr(job.cost)}, ${spec.months} mo) — ${spec.family === "hyra" ? "rent-driven" : spec.family === "värde" ? "value-driven" : "cost-driven"}.`,
        kind: "upg",
      });
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

  // Global portföljdirektör: månadsarvode. Arvodet står i proportion till det
  // som faktiskt förvaltas – 3 % av hyran per hus (samma sats som en enskild
  // förvaltare tar), med ett golv per hus och en liten fast stab ovanpå. Den
  // tidigare fasta avgiften på 15 000 kr slukade fyra tiondelar av hyran i ett
  // enhusbolag och gjorde det första huset olönsamt oavsett belåningsgrad.
  monthlyNOI -= globalManagerFee(s);

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
  // Avknoppade tillgångar (spinoffs.ts) driftas som vanligt men deras
  // netto går till avknoppningens egen kassa, inte spelarens.
  const spinoffNet: Record<string, number> = {};
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
      if (na.spinOffId) spinoffNet[na.spinOffId] = (spinoffNet[na.spinOffId] ?? 0) + netNOI;
      else monthlyNOI += netNOI;
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

    // Aggregera ägt MW för energisynergi (avknoppade verk är inte längre dina)
    s.energyOwnedMW = s.industryPortfolio
      .filter((a) => a.sector === "energi" && a.status === "klar" && !a.spinOffId)
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
      .filter((a) => a.sector === "hotell" && a.status === "klar" && !a.spinOffId && (a.district === "centrum" || a.district === "kulle"))
      .reduce((sum, a) => sum + (a.hotelMeta?.starRating ?? 0) * 0.05, 0);
    if (hotelRepBonus > 0) s.reputation = Math.min(100, s.reputation + hotelRepBonus);
  }

  // ── Finansiella institut: ägd bank + försäkringsbolag ────────────
  if (s.ownedBank) {
    const r = tickBank(s.ownedBank, s);
    s.ownedBank = { ...r.bank, totalNet: r.bank.totalNet + r.net };
    cashflow(s, r.net, "bankrörelsen");
    monthlyNOI += r.net;
    r.events.forEach((e) => events.push(e));
    if (s.month === 12)
      events.push({
        t: `🏦 ${s.ownedBank.name} annual summary: deposits ${msek(s.ownedBank.deposits)}, loans out ${msek(s.ownedBank.loansOut)} (${s.ownedBank.stance}).`,
        kind: "info",
      });
  }
  if (s.ownedInsurer) {
    const r = tickInsurer(s.ownedInsurer, s);
    s.ownedInsurer = { ...r.insurer, totalNet: r.insurer.totalNet + r.net };
    cashflow(s, r.net, "försäkringsrörelsen");
    monthlyNOI += r.net;
    r.events.forEach((e) => events.push(e));
  }

  // Insurance monthly cost + catastrophe events
  const insuredProps = s.portfolio.filter((p) => p.insurance && p.status === "klar");
  if (insuredProps.length > 0) {
    // Premium: 0.40 % av marknadsvärde per år (min 2 000 kr/mån per fastighet).
    // Eget försäkringsbolag tecknar de egna husen till självkostnad: −40 %.
    const ownInsurerMult = s.ownedInsurer ? OWN_INSURER_PREMIUM_MULT : 1;
    const insCost = Math.round(
      insuredProps.reduce(
        (sum, p) => sum + Math.max(2_000, Math.round((propMarketValue(p, s) * 0.004) / 12)),
        0,
      ) * ownInsurerMult,
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
    // Avskrivning enligt vald policy (Finans → Skatt): normal 1,3 %/år,
    // aggressiv 2 %/år – större sköld men revisionsrisk (nedan).
    const aggressive = s.taxDepreciationPolicy === "aggressiv";
    const depRate = aggressive ? TAX_DEP_AGGRESSIVE : TAX_DEP_NORMAL;
    const monthlyDepreciation = s.portfolio.reduce((sum, p) => {
      if (p.status !== "klar") return sum;
      return sum + ((p.purchasePrice ?? p.askPrice) * depRate) / 12;
    }, 0);
    let gross = netIncome - monthlyDepreciation;
    // Ränteavdragstak: räntor är avdragsgilla upp till 50 % av driftnettot.
    // Överskjutande ränta läggs tillbaka i skattebasen – extrembelåning
    // förlorar sin sköld (Lån ↔ Skatt).
    const nonDeductible = Math.max(0, interest - Math.max(0, monthlyNOI) * INTEREST_CAP_OF_NOI);
    gross += nonDeductible;
    // Periodiseringsfonder som nått 6 år återförs till beskattning nu.
    const nowAbsTax = s.year * 12 + s.month;
    const due = (s.taxReserves ?? []).filter((r) => r.dueAbs <= nowAbsTax);
    if (due.length > 0) {
      const dissolved = due.reduce((a, r) => a + r.amount, 0);
      s.taxReserves = (s.taxReserves ?? []).filter((r) => r.dueAbs > nowAbsTax);
      gross += dissolved;
      events.push({
        t: `🧾 Tax allocation reserve of ${kr(dissolved)} reaches 6 years and returns to taxation.`,
        kind: "info",
      });
    }
    if (gross <= 0) {
      // Förlustavdrag: skattemässiga underskott sparas och kvittas mot
      // framtida vinster – dåliga år är inte bara bortkastade.
      if (gross < 0) s.taxLossCarry = Math.round((s.taxLossCarry ?? 0) - gross);
    } else {
      const offset = Math.min(s.taxLossCarry ?? 0, gross);
      if (offset > 0) s.taxLossCarry = Math.round((s.taxLossCarry ?? 0) - offset);
      const taxableIncome = gross - offset;
      const energyACount = s.portfolio.filter(p => p.energyClass === "A" && p.status === "klar").length;
      const taxRate = Math.max(0.10, 0.22 - (energyACount > 0 ? 0.03 : 0) - (s.holdingStructure ? HOLDING_TAX_DELTA : 0));
      const monthlyTax = Math.round(taxableIncome * taxRate);
      if (monthlyTax > 0) {
        cashflow(s, -monthlyTax, "fastighetsskatt");
        s.totalTaxPaid = (s.totalTaxPaid ?? 0) + monthlyTax;
        if (s.month % 3 === 0) {
          events.push({ t: `🏛️ Property tax: ${kr(monthlyTax)}/mo (deduction ${kr(Math.round(monthlyDepreciation))}/mo${offset > 0 ? `, loss carryforward used ${kr(Math.round(offset))}` : ""}, tax rate ${Math.round(taxRate * 100)}%).`, kind: "expense" });
        }
      }
    }
    // Skatterevision: den aggressiva policyn granskas då och då. Upptäckt
    // ⇒ straffavgift på mellanskillnaden mot normal avskrivning + anseende.
    if (aggressive && gross + monthlyDepreciation > 0 && random01() < TAX_AUDIT_CHANCE * taxAuditMult(s)) {
      const shieldDiff = s.portfolio.reduce((sum, p) => {
        if (p.status !== "klar") return sum;
        return sum + ((p.purchasePrice ?? p.askPrice) * (TAX_DEP_AGGRESSIVE - TAX_DEP_NORMAL)) / 12;
      }, 0);
      const fine = Math.max(500_000, Math.round(shieldDiff * 6 * 0.22 * 1.4));
      cashflow(s, -fine, "skatterevision");
      s.totalTaxPaid = (s.totalTaxPaid ?? 0) + fine;
      s.reputation = Math.max(0, s.reputation - 3);
      s.taxDepreciationPolicy = "normal";
      events.push({
        t: `🧾 TAX AUDIT: the authority disallows the aggressive depreciation — back taxes and surcharge ${kr(fine)} (rep −3). Policy reset to normal.`,
        kind: "warn",
      });
    }
  }

  // ── Covenant-lånet: räntetäckningen övervakas månadsvis ──────────
  // Rabatten (−0,25 pp) gäller så länge ICR ≥ 1,3. Tre svaga månader i
  // rad river covenanten: 1 % av skulden i avgift och anseendet skadas.
  if (s.loanCovenant && s.debt > 0) {
    const annualNOI = monthlyNOI * 12;
    const annualInterest = interest * 12;
    const icr = annualInterest > 0 ? annualNOI / annualInterest : 99;
    if (icr < COVENANT_ICR_FLOOR) {
      const breach = s.loanCovenant.breachMonths + 1;
      if (breach >= COVENANT_BREACH_MONTHS) {
        const fee = Math.round(s.debt * 0.01);
        cashflow(s, -fee, "covenantbrott");
        s.reputation = Math.max(0, s.reputation - 3);
        s.loanCovenant = undefined;
        events.push({
          t: `🏦 COVENANT BREACH: interest coverage below ${COVENANT_ICR_FLOOR}× for ${COVENANT_BREACH_MONTHS} months — the bank tears up the covenant loan. Fee ${kr(fee)}, rep −3.`,
          kind: "warn",
        });
      } else {
        s.loanCovenant = { ...s.loanCovenant, breachMonths: breach };
        events.push({
          t: `🏦 Covenant warning: interest coverage ${icr.toFixed(2)}× is below the ${COVENANT_ICR_FLOOR}× floor (${breach}/${COVENANT_BREACH_MONTHS} months).`,
          kind: "warn",
        });
      }
    } else if (s.loanCovenant.breachMonths > 0) {
      s.loanCovenant = { ...s.loanCovenant, breachMonths: 0 };
    }
  }

  // ── Företagscertifikat: ränta och rollover ───────────────────────
  // Billig kort finansiering – men var 12:e månad möter programmet
  // marknaden igen. I kris (eller ibland i bust) är den frusen: kan
  // kassan inte lösa in konverteras pappret till dyrt banklån.
  if (s.commercialPaper) {
    const cp = s.commercialPaper;
    cashflow(s, -Math.round((cp.amount * cp.rate) / 100 / 12), "certifikatränta");
    const nowAbsCp = s.year * 12 + s.month;
    if (nowAbsCp >= cp.matureAbs) {
      const frozen = (s.crisisMonthsLeft ?? 0) > 0 || (s.marketCycle?.phase === "bust" && random01() < 0.4);
      if (frozen) {
        if (s.cash >= cp.amount) {
          cashflow(s, -cp.amount, "certifikat inlösta");
          s.commercialPaper = undefined;
          events.push({
            t: `📃 CP MARKET FROZEN: no buyers at rollover — the program of ${kr(cp.amount)} is repaid from cash.`,
            kind: "warn",
          });
        } else {
          s.debt += cp.amount;
          s.commercialPaper = undefined;
          s.reputation = Math.max(0, s.reputation - 2);
          events.push({
            t: `📃 CP MARKET FROZEN: the bank bridges ${kr(cp.amount)} into ordinary debt at loan terms (rep −2). Short funding carries rollover risk.`,
            kind: "warn",
          });
        }
      } else {
        const newRate = +(s.interestRate + CP_SPREAD).toFixed(2);
        s.commercialPaper = { ...cp, rate: newRate, matureAbs: nowAbsCp + CP_TERM_MONTHS };
        events.push({
          t: `📃 Commercial paper rolled: ${kr(cp.amount)} at ${newRate.toFixed(2)}% for another ${CP_TERM_MONTHS} months.`,
          kind: "info",
        });
      }
    }
  }

  // ── Investerarrelationer: månadskostnad mot +8 ratingpoäng ───────
  if (s.irProgram) {
    const irCost = Math.max(IR_COST_MIN, Math.round(equityOf(s) * IR_COST_OF_EQUITY));
    cashflow(s, -irCost, "investerarrelationer");
  }

  // ── Rivalobligationer: kuponger, förfall och motpartsrisk ────────
  if ((s.rivalBonds ?? []).length > 0) {
    const nowAbsRb = s.year * 12 + s.month;
    let coupons = 0;
    const remainingRb: NonNullable<GameState["rivalBonds"]> = [];
    for (const rb of s.rivalBonds ?? []) {
      const issuerAlive = s.competitors.some((c) => c.name === rb.rival);
      if (!issuerAlive) {
        // Emittenten uppköpt/borta: förvaltaren löser boet till 60 %.
        cashflow(s, Math.round(rb.amount * 0.6), "obligationsåtervinning");
        events.push({ t: `📜 ${rb.rival} is gone — the bond of ${kr(rb.amount)} recovers 60% from the estate.`, kind: "warn" });
        continue;
      }
      coupons += Math.round((rb.amount * rb.rate) / 100 / 12);
      if (nowAbsRb >= rb.matureAbs) {
        cashflow(s, rb.amount, "obligationsförfall (rival)");
        events.push({ t: `📜 ${rb.rival}'s bond matures — ${kr(rb.amount)} repaid in full.`, kind: "income" });
        continue;
      }
      remainingRb.push(rb);
    }
    if (coupons > 0) cashflow(s, coupons, "obligationskuponger (rivaler)");
    s.rivalBonds = remainingRb;
  }

  // ── Konvertibler: ränta, konvertering och förfall ────────────────
  if ((s.convertibles ?? []).length > 0) {
    const nowAbsCv = s.year * 12 + s.month;
    const fbab = s.stocks.find((st) => st.competitorName === "__player__");
    const remainingCv: NonNullable<GameState["convertibles"]> = [];
    for (const cv of s.convertibles ?? []) {
      cashflow(s, -Math.round((cv.amount * cv.rate) / 100 / 12), "konvertibelränta");
      // Kursen nådde triggern: skulden blir aktier (utspädning i floaten).
      if (fbab && s.ipoShares && fbab.price >= cv.issuePrice * CONVERTIBLE_TRIGGER) {
        const newShares = Math.round(cv.amount / cv.issuePrice);
        s.ipoShares = { total: s.ipoShares.total + newShares, public: s.ipoShares.public + newShares };
        events.push({
          t: `📜 CONVERSION: the share passed ${Math.round(CONVERTIBLE_TRIGGER * 100)}% of issue price — a convertible of ${kr(cv.amount)} becomes ${newShares.toLocaleString("en-US")} new shares (dilution instead of repayment).`,
          kind: "event",
        });
        continue;
      }
      if (nowAbsCv >= cv.matureAbs) {
        if (s.cash >= cv.amount) {
          cashflow(s, -cv.amount, "konvertibel inlöst");
          events.push({ t: `📜 Convertible of ${kr(cv.amount)} matured without converting — repaid at par.`, kind: "info" });
        } else {
          s.debt += cv.amount;
          events.push({ t: `📜 Convertible of ${kr(cv.amount)} matured — bridged into bank debt.`, kind: "warn" });
        }
        continue;
      }
      remainingCv.push(cv);
    }
    s.convertibles = remainingCv;
  }

  // ── Greenwashing-covenant på gröna obligationer ─────────────────
  // Rabatten kräver att ESG-betyget hålls: faller det under B höjs
  // kupongen permanent (+0,5 pp) och anseendet skadas – en gång per
  // obligation, sedan är den "avslöjad".
  if ((s.bonds ?? []).some((b) => b.green && !b.breached)) {
    const esg = esgRatingOf(s);
    if (esg.letter !== "A" && esg.letter !== "B") {
      let hit = 0;
      s.bonds = (s.bonds ?? []).map((b) => {
        if (!b.green || b.breached) return b;
        hit += 1;
        return { ...b, rate: +(b.rate + 0.5).toFixed(2), breached: true };
      });
      if (hit > 0) {
        s.reputation = Math.max(0, s.reputation - 3);
        events.push({
          t: `🌱 GREENWASHING: ESG rating slipped to ${esg.letter} — the green bond covenant triggers: coupon +0.50pp on ${hit} bond${hit > 1 ? "s" : ""}, rep −3.`,
          kind: "warn",
        });
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
  // Politik light (politics.ts): tre månader före valet kan spelaren
  // donera till det byggvänliga blockets kampanj – öppet eller diskret.
  // Vinner det stödda partiet ger stadshuset politisk välvilja i 24 mån
  // (snabbare detaljplaner, billigare planauktioner). Diskreta pengar
  // riskerar en mutskandal så länge välviljan varar.
  {
    const absM = s.year * 12 + s.month;
    if (
      absM % ELECTION_PERIOD === ELECTION_PERIOD - CAMPAIGN_LEAD &&
      !s.pendingDecision &&
      (!s.story || s.story.done) &&
      !s.settings?.calmMode
    ) {
      const decision = campaignDecision(s, equityOf(s));
      s.pendingDecision = decision;
      events.push({ t: `🗳️ Decision required: ${decision.title}`, kind: "event" });
    }
    if (absM % ELECTION_PERIOD === 0) {
      const backed = s.politics?.backed ? POLITICAL_PARTIES.find((p) => p.id === s.politics!.backed) : undefined;
      // Bestående politiskt kapital gör kampanjen lättare (politics.ts).
      const winChance = (s.politics?.secret ? CAMPAIGN_WIN_SECRET : CAMPAIGN_WIN_OPEN) + campaignWinBoost(s);
      const party = backed && random01() < winChance ? backed : pick(POLITICAL_PARTIES);
      s = party.apply(s);
      s.electionResult = party.name;
      events.push({ t: `🗳️ MUNICIPAL ELECTION: ${party.name} won. ${party.desc}`, kind: "warn" });
      if (backed && party.id === backed.id) {
        s.politics = {
          favorMonthsLeft: FAVOR_MONTHS,
          favorParty: party.name,
          secret: s.politics?.secret,
          backed: null,
          donation: 0,
          // Segern befäster relationen: kapital ovanpå det donationen gav.
          capital: Math.min(100, (s.politics?.capital ?? 0) + CAPITAL_WIN_BONUS),
        };
        events.push({
          t: `🤝 Your campaign contribution is remembered at city hall: zoning reviews move faster and land auctions open cheaper for ${FAVOR_MONTHS} months.`,
          kind: "income",
        });
      } else if (backed) {
        s.politics = { ...(s.politics ?? {}), backed: null, donation: 0, secret: false };
        events.push({ t: `🗳️ You backed the losing side — the donation bought nothing but goodwill with the opposition.`, kind: "warn" });
      }
    }
    // Välviljan tickar ned – och diskret finansierad välvilja kan spricka.
    if ((s.politics?.favorMonthsLeft ?? 0) > 0) {
      s.politics = { ...s.politics, favorMonthsLeft: (s.politics!.favorMonthsLeft ?? 0) - 1 };
      if (s.politics.secret && random01() < SECRET_SCANDAL_CHANCE) {
        s.politics = { ...s.politics, favorMonthsLeft: 0, favorParty: undefined, secret: false };
        s.reputation = Math.max(0, s.reputation - 10);
        events.push({
          t: `📰 BRIBERY SCANDAL: The newspaper traces the foundation's campaign money to ${s.companyName ?? "your company"}. City hall freezes you out (rep −10, the favor is gone).`,
          kind: "warn",
        });
      }
    }
    // Politiskt kapital driver mot 0 och eroderas av impopularitet – en
    // impopulär hyresvärd (hög presshetta) tappar sina vänner i stadshuset.
    if ((s.politics?.capital ?? 0) > 0) {
      const before = s.politics!.capital ?? 0;
      const after = nextPoliticalCapital(s);
      s.politics = { ...s.politics, capital: after };
      if (before - after > 3 && (s.pressHeat ?? 0) > CAPITAL_HEAT_THRESHOLD) {
        events.push({ t: `🏛️ City hall distances itself from an unpopular landlord — your political capital erodes.`, kind: "warn" });
      }
    }
  }

  // ── Rekryteringsstrid: rivaler uppvaktar stjärnchefer ───────────
  if (!s.pendingDecision && (!s.story || s.story.done)) {
    const poach = maybePoachingDecision(s);
    if (poach) {
      s.pendingDecision = poach;
      events.push({ t: `🎯 Decision required: ${poach.title}`, kind: "warn" });
    }
  }

  // ── Distressed competitor sales ─────────────────────────────────
  // Två vägar in: tom kassa, eller räntetäckning < 1 i tre månader i följd
  // (rivalFinance.ts) – när riksbanken höjer tvingas skuldsatta rivaler
  // sälja. Intäkterna betalar först ned skulden, resten stärker kassan.
  for (const comp of s.competitors) {
    const icrForced = (comp.icrBadMonths ?? 0) >= RIVAL_ICR_GRACE_MONTHS;
    if ((comp.cash < 0 || icrForced) && (comp.portfolio ?? []).length > 0 && random01() < 0.30) {
      const selling = comp.portfolio[Math.floor(random01() * comp.portfolio.length)];
      const distressedPrice = Math.round(selling.askPrice * rnd(0.75, 0.88));
      const born = s.year * 12 + s.month;
      s.listings = [
        ...s.listings,
        { ...selling, owned: false, askPrice: distressedPrice, listedMonth: born, expiresMonth: born + 2, poolAskPrice: undefined, poolBaseRent: undefined },
      ];
      s.competitors = s.competitors.map((c) => {
        if (c.name !== comp.name) return c;
        const proceeds = applyDistressProceeds(c, distressedPrice);
        return {
          ...c,
          portfolio: c.portfolio.filter((p) => p.id !== selling.id),
          debt: proceeds.debt,
          cash: proceeds.cash,
          icrBadMonths: 0,
        };
      });
      events.push({ t: `🚨 Distress sale! ${comp.name} is forced to sell ${selling.typeLabel} in ${selling.districtName} for ${msek(distressedPrice)} (−${Math.round((1 - distressedPrice / selling.askPrice) * 100)}%)${icrForced ? " — the interest burden broke them" : ""}.`, kind: "warn", rival: comp.name });
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
  // En nemesis budar oftare mot dig – hur mycket beror på personligheten
  // (Harborwick lägger sig i allt, Sonny Lund bygger hellre själv).
  const nemesisBidBoost =
    s.nemesis && s.competitors.some((c) => c.name === s.nemesis) ? 0.12 * aggressionOf(s.nemesis) : 0;
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
        // Budsegern betalas med belånad kassa (rivalFinance.ts) – tidigare
        // fick rivalen huset gratis, vilket gjorde budkrig till ett fribrev.
        const bidAmount = s.competingBid.amount;
        s.competitors = s.competitors.map((c) => {
          if (c.name !== s.competingBid!.rivalName) return c;
          const debtPart = Math.round(bidAmount * rivalLeverage(c));
          return {
            ...c,
            cash: Math.round(c.cash - (bidAmount - debtPart)),
            debt: (c.debt ?? 0) + debtPart,
            portfolio: [...(c.portfolio ?? []), listing],
            units: (c.portfolio ?? []).length + 1,
          };
        });
        const vq = rivalQuote(s.competingBid.rivalName, "vinst", absNow);
        events.push({ t: `🏢 ${s.competingBid.rivalName} bought ${listing.typeLabel} in ${listing.districtName} for ${msek(s.competingBid.amount)}.${vq ? " " + vq : ""}`, kind: "event", rival: s.competingBid.rivalName });
      }
      s.competingBid = undefined;
    }
  }

  // ── Rival-M&A: motivdriven i stället för slump ─────────────────
  // pickMerger (rivalArcs.ts) hittar en affär med MOTIV: ett nödställt
  // byte (räntebördan), en fejd med brutalt styrkeövertag, eller en
  // allians som formaliseras för att utmana stadens ledare. Sannolikheten
  // beror på motivet – och under 4 aktörer konsolideras inget alls.
  const mergerPlan = pickMerger(s);
  const mergerGate =
    mergerPlan?.kind === "opportunistic" ? 0.02 : mergerPlan?.kind === "hostile" ? 0.01 : 0.005;
  const mergerRoll = random01();
  // Affärsrykten (M&A 2.0 batch 6): planerade affärer läcker till pressen
  // innan de landar – och ryktet rör målbolagets kurs.
  if (mergerPlan && mergerRoll >= mergerGate && mergerRoll < mergerGate + 0.10) {
    s.stocks = s.stocks.map((x) =>
      x.competitorName === mergerPlan.target ? { ...x, price: +(x.price * 1.03).toFixed(2) } : x,
    );
    events.push({
      t: `🗞️ RUMOR: bankers whisper that ${mergerPlan.buyer} is circling ${mergerPlan.target} — the target's stock ticks up 3%.`,
      kind: "info",
    });
  }
  if (mergerPlan && mergerRoll < mergerGate) {
    const ca = s.competitors.find((c) => c.name === mergerPlan.buyer)!;
    const cb = s.competitors.find((c) => c.name === mergerPlan.target)!;
    // Konkurrensprövning gäller även rivalfusioner (tunna delar 5/7):
    // en fusion som ger flagrant distriktsdominans stoppas av myndigheten.
    const blockedDistrict = rivalMergerBlocked(s, ca, cb);
    if (blockedDistrict) {
      const dName = DISTRICTS.find((d) => d.id === blockedDistrict)?.name ?? blockedDistrict;
      events.push({
        t: `⚖️ BLOCKED: the competition authority stops ${ca.name}'s takeover of ${cb.name} — the merger would hand them a monopoly in ${dName}.`,
        kind: "info",
      });
    } else {
    const merged = {
      ...ca,
      cash: ca.cash + cb.cash,
      portfolio: [...(ca.portfolio ?? []), ...(cb.portfolio ?? [])],
      industries: [...(ca.industries ?? []), ...(cb.industries ?? [])],
      units: (ca.portfolio ?? []).length + (cb.portfolio ?? []).length,
      equity: ca.equity + cb.equity,
      monthlyNOI: (ca.monthlyNOI ?? 0) + (cb.monthlyNOI ?? 0),
      // Skulden följer med i affären (rivalFinance.ts) – uppköp av ett
      // skuldtyngt bolag är ingen gratislunch.
      debt: (ca.debt ?? 0) + (cb.debt ?? 0),
      icrBadMonths: 0,
    };
    s.competitors = [...s.competitors.filter((c) => c.name !== ca.name && c.name !== cb.name), merged];
    const fq = rivalQuote(ca.name, "fusion", s.month);
    const uq = rivalQuote(cb.name, "uppköpt", s.month);
    const headline =
      mergerPlan.kind === "hostile"
        ? `⚔️ HOSTILE TAKEOVER: ${ca.name} swallows ${cb.name} — ${mergerPlan.reason}.`
        : mergerPlan.kind === "friendly"
          ? `🤝 MERGER: ${ca.name} and ${cb.name} join forces — ${mergerPlan.reason}.`
          : `🦈 ACQUISITION: ${ca.name} buys out the struggling ${cb.name} — ${mergerPlan.reason}.`;
    events.push({ t: `${headline}${fq ? " " + fq : ""}${uq ? " " + uq : ""}`, kind: "warn", rival: ca.name });
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
      // Invigning: bestående accessibility + dev-lyft (infrastructure.ts).
      events.push(openInfra(s, pr));
    }
    if ((s.infraProjects ?? []).length === 0 && random01() < 0.015) {
      // Kommunen väljer projekt som passar distriktet; politisk välvilja
      // väger upp sannolikheten att bygget hamnar där DU redan äger.
      const kind = pick(INFRA_KINDS_2);
      const allowed = DISTRICTS.filter((d) => !kind.districts || kind.districts.includes(d.id));
      let d = pick(allowed.length > 0 ? allowed : DISTRICTS);
      if (politicalFavorActive(s) && random01() < 0.5) {
        const counts = new Map(allowed.map((x) => [x.id, s.portfolio.filter((p) => p.district === x.id).length]));
        const best = [...allowed].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))[0];
        if (best) d = best;
      }
      const months = kind.months[0] + Math.floor(random01() * (kind.months[1] - kind.months[0] + 1));
      const boost = +(kind.devBoost[0] + random01() * (kind.devBoost[1] - kind.devBoost[0])).toFixed(3);
      s.infraProjects = [
        { id: newId(), name: kind.name, district: d.id, districtName: d.name, monthsLeft: months, totalMonths: months, boost, kindId: kind.id },
      ];
      events.push({
        t: `${kind.icon} CONSTRUCTION START: The municipality is building ${kind.name.toLowerCase()} in ${d.name} — done in ~${months} mo. Accessibility (and rents) rise permanently at the opening. Co-financing is on the table in the District window.`,
        kind: "event",
      });
    }
  }

  // ── Gentrifiering: läge + standard driver områdesutvecklingen ────
  // Tillgänglighet (invigd infrastruktur) och beståndets standard
  // RELATIVT stadssnittet ger en långsam månatlig drift i districtDev.
  // Snabb uppgång i ett distrikt med stor lågprisstock väcker protester.
  const cityStock = [
    ...s.portfolio.filter((p) => p.status === "klar"),
    ...s.competitors.flatMap((c) => (c.portfolio ?? []).filter((p) => p.status === "klar")),
  ];
  const cityStd =
    cityStock.length > 0 ? cityStock.reduce((a, p) => a + propertyStandard(p), 0) / cityStock.length : 0.5;
  for (const d of DISTRICTS) {
    const stock = cityStock.filter((p) => p.district === d.id);
    const avgStd = stock.length > 0 ? stock.reduce((a, p) => a + propertyStandard(p), 0) / stock.length : cityStd;
    const drift = gentrificationDrift(accessibilityOf(s, d.id), avgStd, cityStd);
    if (drift !== 0) {
      const cur = s.districtDev?.[d.id] ?? 1;
      s.districtDev = { ...(s.districtDev ?? {}), [d.id]: +Math.max(0.7, Math.min(1.6, cur + drift)).toFixed(4) };
      const cheapStock = stock.filter((p) => propertyStandard(p) < 0.45).length;
      if (drift > 0.0008 && cheapStock >= 3 && random01() < 0.05) {
        s.pressHeat = +((s.pressHeat ?? 0) + 2).toFixed(2);
        events.push({
          t: `📢 Protests in ${d.name}: rents climb as the area gentrifies, and long-time residents march — "the city is for everyone", the banners read.`,
          kind: "warn",
        });
      }
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
      // Aktivisten kan bara köpa det som är till salu: rivalernas innehav
      // (korsägandet) ligger utanför den fria floaten.
      const activistCeilPct = Math.max(
        0,
        ((shares.public - rivalFbabShares(s)) / shares.total) * 100,
      );
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
      s.takeoverPressure = +Math.max(0, Math.min(activistCeilPct, before + delta)).toFixed(2);
      const stake = s.takeoverPressure;
      // Kan fonden faktiskt ta kontrollen? Har du majoritet, eller räcker
      // inte den köpbara floaten till tröskeln, är hotet omöjligt – då ska
      // varken varningar eller krav på återköpspengar komma.
      const control = activistControl(s);
      const threshold = control.threshold;
      if (control.possible && delta > 0 && reasons.length && Math.floor(stake / 10) > Math.floor(before / 10)) {
        events.push({
          t: `🦈 Kronfelt Capital now owns ${Math.round(stake)}% of the company (${reasons.join(" and ")}). You hold ${Math.round(playerPct)}% — they take over past ${Math.round(threshold)}%. Dividends, buybacks or stronger returns push them out.`,
          kind: "warn",
        });
      }
      // Sista varningen: aktivisten närmar sig röstmajoritet → fientligt bud.
      if (control.possible && stake >= threshold - 6 && before < threshold - 6 && stake < threshold && !s.pendingDecision) {
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
      if (control.possible && stake >= threshold) {
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
      // Politisk välvilja: stadshuset prioriterar dina ärenden – en extra
      // månad avverkas varannan månad (politics.ts).
      if (!res.done && politicalFavorActive(s) && (s.year * 12 + s.month) % 2 === 0 && res.proc.monthsLeft > 1) {
        res.proc.monthsLeft -= 1;
      }
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

  // ── M&A 2.0: ägaren svarar på ditt bud ──────────────────────────
  // Förhandlingen är en dialog över månadsskiften: accept, motbud eller
  // avvisat – styrt av ägarens egen värdering (persona, standing, press).
  if (s.pendingDeal && s.pendingDeal.status === "waiting") {
    const deal = s.pendingDeal;
    const target = s.competitors.find((c) => c.name === deal.target);
    if (!target) {
      // Bolaget hann fusioneras bort under förhandlingen.
      s.pendingDeal = null;
      events.push({ t: `🚪 The ${deal.target} negotiation collapsed — the company no longer exists.`, kind: "warn" });
    } else {
      const resp = ownerResponse(s, target, deal.offer, deal.round);
      const q = rivalQuote(target.name, "budkrig", s.month);
      if (resp.kind === "accept") {
        s.pendingDeal = { ...deal, status: "accepted" };
        events.push({
          t: `🤝 DEAL AGREED: ${target.name}'s owner accepts ${msek(deal.offer)}. Choose financing in the Acquisition window to close.${q ? " " + q : ""}`,
          kind: "income",
          rival: target.name,
        });
      } else if (resp.kind === "counter") {
        s.pendingDeal = { ...deal, status: "countered", counter: resp.amount };
        events.push({
          t: `↩️ COUNTERED (round ${deal.round}): ${target.name}'s owner wants ${msek(resp.amount)} for the company.${q ? " " + q : ""}`,
          kind: "warn",
          rival: target.name,
        });
      } else {
        s.pendingDeal = null;
        s.dealCooldowns = { ...(s.dealCooldowns ?? {}), [target.name]: s.year * 12 + s.month + DEAL_COOLDOWN_MONTHS };
        s.standing = adjustStanding(s.standing, { kind: "rival", name: target.name }, -4);
        events.push({
          t: `🚪 REJECTED: ${target.name}'s owner dismisses your ${msek(deal.offer)} bid outright — the door is closed for ${DEAL_COOLDOWN_MONTHS} months.${q ? " " + q : ""}`,
          kind: "warn",
          rival: target.name,
        });
      }
    }
  }

  // ── Fientligt bud avgörs: styrelsens försvar (batch 3) ──────────
  if (s.hostileBid && s.year * 12 + s.month > s.hostileBid.placedAbs) {
    const hb = s.hostileBid;
    const target = s.competitors.find((c) => c.name === hb.target);
    s.hostileBid = null;
    if (!target) {
      events.push({ t: `⚔️ Your hostile bid for ${hb.target} lapses — the company no longer exists.`, kind: "info" });
    } else {
      const outcome = hostileDefense(s, target, hb.offer);
      if (outcome.kind === "white_knight") {
        // Allierad rival tar en blockerande post – budet faller.
        s.dealCooldowns = { ...(s.dealCooldowns ?? {}), [target.name]: s.year * 12 + s.month + DEAL_COOLDOWN_MONTHS };
        s.standing = adjustStanding(s.standing, { kind: "rival", name: target.name }, -8);
        s.standing = adjustStanding(s.standing, { kind: "rival", name: outcome.ally }, -8);
        events.push({
          t: `🛡️ WHITE KNIGHT: ${outcome.ally} takes a blocking stake in ${target.name} — your hostile bid collapses, and the city knows who tried.`,
          kind: "warn",
          rival: outcome.ally,
        });
      } else if (outcome.kind === "buyback") {
        // Återköpsförsvar: kursen upp, golvet höjt – budet faller.
        s.stocks = s.stocks.map((x) =>
          x.competitorName === target.name ? { ...x, price: +(x.price * 1.15).toFixed(2), targetPrice: +(x.price * 1.15).toFixed(2) } : x,
        );
        events.push({
          t: `🛡️ BUYBACK DEFENSE: ${target.name} repurchases shares and lifts the floor — your bid no longer clears. A new attempt needs ~${msek(outcome.newFloor)}.`,
          kind: "warn",
          rival: target.name,
        });
      } else {
        // Kapitulation: affären går igenom – fientligt, med allt vad det kostar.
        const res = executeAcquisition(s, target.name, hb.offer, "lan", { hostile: true });
        if (res.error) {
          events.push({ t: `⚔️ The board capitulated — but your financing fell through: ${res.error}`, kind: "warn" });
        } else {
          s = res.state;
          s.reputation = Math.max(0, +(s.reputation - 12).toFixed(1)); // nettar +8 från köpet till −4
          s.pressHeat = +(((s.pressHeat ?? 0) + 3)).toFixed(2);
          for (const c of s.competitors) s.standing = adjustStanding(s.standing, { kind: "rival", name: c.name }, -4);
          events.push({ t: `⚔️ CAPITULATION: ${hb.target}'s board folds — the company is yours, but the city calls it a raid (rep −4, press heat +3).`, kind: "warn" });
        }
      }
    }
  }

  // Din egen förhandling läcker också (batch 6): kursen på målet drar.
  if (s.pendingDeal && s.pendingDeal.status === "waiting" && !s.pendingDeal.rivalBidder && random01() < 0.15) {
    const dealTarget = s.pendingDeal.target;
    if (s.stocks.some((x) => x.competitorName === dealTarget)) {
      s.stocks = s.stocks.map((x) =>
        x.competitorName === dealTarget ? { ...x, price: +(x.price * 1.05).toFixed(2) } : x,
      );
      events.push({
        t: `🗞️ LEAK: the market smells your interest in ${dealTarget} — the stock jumps 5% and every extra month of talks gets pricier.`,
        kind: "warn",
      });
    }
  }

  // ── Rivalens motbud på ditt förhandlingsmål (batch 3) ───────────
  if (s.pendingDeal && !s.pendingDeal.rivalBidder && random01() < 0.08) {
    const deal = s.pendingDeal;
    const challenger = [...s.competitors]
      .filter((c) => c.name !== deal.target && c.cash >= deal.offer * 0.4)
      .sort((a, b) => b.cash - a.cash)[0];
    if (challenger) {
      const rivalBid = Math.round(deal.offer * 1.1);
      s.pendingDeal = {
        ...deal,
        status: "countered",
        counter: Math.max(deal.counter ?? 0, Math.round(rivalBid * 1.05)),
        rivalBid,
        rivalBidder: challenger.name,
        rivalBidAbs: s.year * 12 + s.month,
      };
      const q = rivalQuote(challenger.name, "budkrig", s.month);
      events.push({
        t: `⚡ BIDDING WAR FOR THE COMPANY: ${challenger.name} tables ${msek(rivalBid)} for ${deal.target} — top it or lose the deal.${q ? " " + q : ""}`,
        kind: "warn",
        rival: challenger.name,
      });
    }
  } else if (
    s.pendingDeal?.rivalBidder &&
    s.year * 12 + s.month - (s.pendingDeal.rivalBidAbs ?? 0) >= RIVAL_BID_GRACE_MONTHS &&
    (s.pendingDeal.rivalBid ?? 0) > s.pendingDeal.offer
  ) {
    // Du lät rivalens bud stå för länge – ägaren väljer deras pengar.
    const deal = s.pendingDeal;
    const buyer = s.competitors.find((c) => c.name === deal.rivalBidder);
    const target = s.competitors.find((c) => c.name === deal.target);
    s.pendingDeal = null;
    if (buyer && target) {
      const merged = {
        ...buyer,
        cash: buyer.cash + target.cash - Math.round((deal.rivalBid ?? 0) * 0.3),
        portfolio: [...(buyer.portfolio ?? []), ...(target.portfolio ?? [])],
        industries: [...(buyer.industries ?? []), ...(target.industries ?? [])],
        units: (buyer.portfolio ?? []).length + (target.portfolio ?? []).length,
        equity: buyer.equity + target.equity,
        monthlyNOI: (buyer.monthlyNOI ?? 0) + (target.monthlyNOI ?? 0),
        debt: (buyer.debt ?? 0) + (target.debt ?? 0) + Math.round((deal.rivalBid ?? 0) * 0.7),
        icrBadMonths: 0,
      };
      s.competitors = [...s.competitors.filter((c) => c.name !== buyer.name && c.name !== target.name), merged];
      s.dealCooldowns = { ...(s.dealCooldowns ?? {}), [buyer.name]: s.year * 12 + s.month + 6 };
      const q = rivalQuote(buyer.name, "vinst", s.month);
      events.push({
        t: `💔 DEAL LOST: ${deal.target}'s owner takes ${buyer.name}'s ${msek(deal.rivalBid ?? 0)} while you hesitated.${q ? " " + q : ""}`,
        kind: "warn",
        rival: buyer.name,
      });
    }
  }

  // ── Rivalerna vänder på vapnet: fientligt bud på DITT bolag ─────
  if (
    s.ipoActive && !s.pendingDecision && !s.gameOver &&
    ((s.takeoverPressure ?? 0) >= 20 || Object.values(s.standing?.rivals ?? {}).some((v) => v <= -50)) &&
    random01() < 0.015
  ) {
    const own = s.stocks.find((x) => x.competitorName === "__player__");
    const shares = s.ipoShares ?? { total: 10_000_000, public: 3_000_000 };
    const myCap = own ? Math.round(own.price * shares.total) : 0;
    const raider = [...s.competitors]
      .filter((c) => c.cash >= myCap * 0.35 && myCap > 0)
      .sort((a, b) => b.cash - a.cash)[0];
    if (raider) {
      const bidPerShare = own ? +(own.price * 1.25).toFixed(2) : 0;
      const buybackCost = Math.round(myCap * 0.08);
      const buybackShares = own ? Math.round(buybackCost / Math.max(1, own.price)) : 0;
      const friend = [...s.competitors]
        .filter((c) => c.name !== raider.name && rivalStanding(s, c.name) >= 30)
        .sort((a, b) => b.equity - a.equity)[0];
      const options = [
        {
          label: `Buyback defense (${msek(buybackCost)})`,
          detail: "Repurchase shares, shrink the float and slam the door (takeover pressure −10).",
          effect: {
            repelBid: { cost: buybackCost, shares: buybackShares },
            reputation: 2,
            log: `🛡️ You repel ${raider.name}'s bid with a buyback — the float shrinks and the raiders retreat.`,
            logKind: "info" as const,
          },
        },
        ...(friend
          ? [{
              label: `White knight: ${friend.name}`,
              detail: "A friendly rival takes a blocking stake — you'll owe them (standing −20).",
              effect: {
                whiteKnight: { rival: friend.name },
                log: `🛡️ ${friend.name} steps in as your white knight — ${raider.name} backs off. You owe them one.`,
                logKind: "info" as const,
              },
            }]
          : []),
        {
          label: `Sell the company (${msek(Math.round(myCap * 1.25))})`,
          detail: "Take the premium and walk away. The empire ends here.",
          effect: {
            gameOver: true,
            log: `💼 You accept ${raider.name}'s ${bidPerShare} kr/share — the company changes hands at a 25% premium.`,
            logKind: "event" as const,
          },
        },
      ];
      s.pendingDecision = {
        id: `raid-${raider.name}`,
        title: `Hostile bid for YOUR company`,
        text: `${raider.name} goes public with an offer of ${bidPerShare} kr per share for ${s.companyName ?? "your company"} — a 25% premium. The board looks at you.`,
        options,
      };
      events.push({ t: `⚔️ RAID: ${raider.name} bids for YOUR company — the board demands an answer.`, kind: "warn", rival: raider.name });
    }
  }

  // ── Konkurrensmyndigheten följer upp avyttringskrav (batch 5) ───
  if ((s.divestOrders ?? []).length > 0) {
    const absNowDo = s.year * 12 + s.month;
    const stillDo: typeof s.divestOrders = [];
    for (const order of s.divestOrders ?? []) {
      const mine = s.portfolio.filter((p) => p.district === order.district && p.status === "klar").length;
      if (mine <= order.maxAllowed) {
        events.push({ t: `⚖️ COMPLIANCE: the competition authority signs off — your ${order.district} holdings are back under the dominance cap.`, kind: "income" });
        continue;
      }
      if (absNowDo >= order.dueAbs) {
        const fine = Math.max(2_000_000, Math.round(equityOf(s) * DIVEST_FINE_SHARE));
        cashflow(s, -fine, "konkurrensvite");
        s.reputation = Math.max(0, +(s.reputation - 3).toFixed(1));
        events.push({ t: `⚖️ FINED: you missed the divestment deadline in ${order.district} — ${msek(fine)} in penalties (rep −3), and the clock restarts.`, kind: "warn" });
        stillDo.push({ ...order, dueAbs: absNowDo + DIVEST_MONTHS });
      } else {
        stillDo.push(order);
      }
    }
    s.divestOrders = stillDo;
  }

  // ── M&A-onboarding: rådgivarens brev lär ut systemet i spelet ───
  // Tre engångsbrev vid rätt ögonblick i stället för tutorial-popups:
  // introduktionen när kassan räcker för affärer, budpliktsvarningen vid
  // första stora aktieposten, integrationsprimern efter första köpet.
  // Onboarding-breven är aldrig brådskande: de får inte tränga undan en
  // pågående kris (tbtf-stödpaket, rekonstruktion) som äger beslutsrutan.
  if (!s.pendingDecision && !s.crisisMonthsLeft && !s.receivership && (!s.story || s.story.done)) {
    const seen = s.mnaIntroSeen ?? [];
    const mark = (id: string) => { s.mnaIntroSeen = [...(s.mnaIntroSeen ?? []), id]; };
    if (!seen.includes("intro") && equityOf(s) >= 25_000_000 && s.competitors.length > 0) {
      mark("intro");
      s.pendingDecision = {
        id: "mna-intro",
        title: "A letter from Meridian & Cross",
        text: "\"Your company has reached a size where buildings are no longer the only thing for sale — COMPANIES are. Every rival in this city has an owner, a balance sheet and a price. We offer three services: a deal pipeline that reads every rival's debt and interest coverage, due diligence so you know what you're actually buying, and counsel through negotiations — bids are conversations here, not buttons. The first month is on the house.\"",
        options: [
          {
            label: "Retain them (first month free)",
            detail: "Opens the deal pipeline in the Acquisition window. 250k/month thereafter — end the mandate any time.",
            effect: { hireAdvisor: true, log: "🏦 Meridian & Cross retained — the deal pipeline opens in the Acquisition window.", logKind: "info" },
          },
          {
            label: "Not yet",
            detail: "The letter stays in the drawer. You can retain them any time from the Acquisition window.",
            effect: { log: "You file the Meridian & Cross letter away for later.", logKind: "info" },
          },
        ],
      };
      events.push({ t: "✉️ A letter from Meridian & Cross, M&A advisors — companies are for sale, not just buildings.", kind: "event" });
    } else if (
      !seen.includes("toehold") &&
      s.stocks.some((st) => st.competitorName && st.competitorName !== "__player__" && st.sharesOutstanding > 0 &&
        st.owned / st.sharesOutstanding >= 0.10 && s.competitors.some((c) => c.name === st.competitorName))
    ) {
      mark("toehold");
      const st = s.stocks.find((x) => x.competitorName && x.competitorName !== "__player__" && x.sharesOutstanding > 0 && x.owned / x.sharesOutstanding >= 0.10)!;
      s.pendingDecision = {
        id: "mna-toehold",
        title: "The board has noticed your stake",
        text: `"A word of counsel: you now hold ${Math.round((st.owned / st.sharesOutstanding) * 100)}% of ${st.name}. A stake past 10% softens their board in any negotiation — but cross 30% and the MANDATORY BID rule forces your hand: bid for the whole company at the board's price, or sell down at a discount. Creep carefully."`,
        options: [
          { label: "Understood", detail: "Toehold ≥ 10%: owner's ask −5%. Crossing 30% triggers the mandatory bid.", effect: { log: "📈 The toehold doctrine, noted: 10% softens the board, 30% forces a bid.", logKind: "info" } },
        ],
      };
      events.push({ t: "✉️ Meridian & Cross on toeholds: 10% opens doors — 30% forces your hand.", kind: "event" });
    } else if (!seen.includes("integration") && (s.integrations ?? []).length > 0) {
      mark("integration");
      const integ = (s.integrations ?? [])[0];
      s.pendingDecision = {
        id: "mna-integration",
        title: "Now the real work begins",
        text: `"Congratulations on ${integ.target} — and condolences. The next ${integ.months} months are the integration: double administration in the acquired buildings, anxious tenants, and every krona of the synergies you paid for still to be EARNED. Keep your staff strong, don't flip the buildings while the ink dries (the market smells fire sales for a year), and the deal will grade out. Track it under Ongoing commitments."`,
        options: [
          { label: "To work", detail: "Integration progress, synergy goals and the flip stamp are shown in the commitments dashboard.", effect: { log: "🧩 The integration playbook, noted: friction now, synergies earned at the end.", logKind: "info" } },
        ],
      };
      events.push({ t: "✉️ Meridian & Cross on integration: synergies are earned, not signed.", kind: "event" });
    }
  }

  // Investmentbankens arvode och färdiga due diligence-rapporter (batch 2).
  if (s.maAdvisor) cashflow(s, -MA_ADVISOR_FEE, "M&A-rådgivning");
  if ((s.ddInProgress ?? []).length > 0) {
    const absNowDd = s.year * 12 + s.month;
    const still: typeof s.ddInProgress = [];
    for (const dd of s.ddInProgress ?? []) {
      if (dd.doneAbs > absNowDd) { still.push(dd); continue; }
      if (s.competitors.some((c) => c.name === dd.target)) {
        s.ddDone = [...(s.ddDone ?? []), dd.target];
        events.push({ t: `🔍 DUE DILIGENCE COMPLETE: the ${dd.target} books are now an open book — exact valuation, no skeletons.`, kind: "income" });
      } else {
        events.push({ t: `🔍 The ${dd.target} due diligence is moot — the company no longer exists.`, kind: "info" });
      }
    }
    s.ddInProgress = still;
  }

  // ── Integrationer tickar: friktion, churn och avslut (batch 4) ──
  if ((s.integrations ?? []).length > 0) {
    const absNowInt = s.year * 12 + s.month;
    const stillInt: typeof s.integrations = [];
    for (const integ of s.integrations ?? []) {
      const ids = new Set(integ.propertyIds);
      if (absNowInt < integ.startAbs + integ.months) {
        // Pågår: kulturkrocken kan kosta hyresgäster (~3 %/mån) – retention
        // av nyckelteamet skär ned churnen till en bråkdel.
        if (random01() < (integ.retained ? 0.03 * RETENTION_CHURN_MULT : 0.03)) {
          const victim = s.portfolio.find((p) => ids.has(p.id) && p.tenants.length > 0);
          if (victim) {
            victim.tenants = victim.tenants.slice(0, -1);
            events.push({
              t: `🧳 INTEGRATION CHURN: a tenant in the former ${integ.target} portfolio walks — "new owners, new rules, no thanks".`,
              kind: "warn",
            });
          }
        }
        stillInt.push(integ);
        continue;
      }
      // Klar: friktionen släpper och synergimålet vägs mot utfallet.
      s.portfolio = s.portfolio.map((p) =>
        ids.has(p.id) ? { ...p, opexMult: +(p.opexMult / INTEGRATION_FRICTION).toFixed(3) } : p,
      );
      const realizedPct = +Math.min(
        1,
        integrationScore(s) * (integ.hostile ? HOSTILE_REALIZE : 1) + (integ.retained ? RETENTION_REALIZE_BONUS : 0),
      ).toFixed(2);
      const realized = Math.round(integ.synergyGoal * realizedPct);
      if (realizedPct >= 0.85) {
        s.reputation = Math.min(100, s.reputation + 3);
        events.push({
          t: `🧩 INTEGRATION COMPLETE: the ${integ.target} portfolio runs as one — ${msek(realized)} of ${msek(integ.synergyGoal)} in synergies realized (${Math.round(realizedPct * 100)}%). Textbook. (rep +3)`,
          kind: "income",
        });
      } else if (realizedPct >= 0.55) {
        events.push({
          t: `🧩 INTEGRATION COMPLETE: the ${integ.target} portfolio is absorbed — ${msek(realized)} of ${msek(integ.synergyGoal)} in synergies realized (${Math.round(realizedPct * 100)}%).`,
          kind: "info",
        });
      } else {
        s.reputation = Math.max(0, +(s.reputation - 2).toFixed(1));
        s.pressHeat = +(((s.pressHeat ?? 0) + 1)).toFixed(2);
        events.push({
          t: `🧩 INTEGRATION STUMBLES: only ${msek(realized)} of ${msek(integ.synergyGoal)} in ${integ.target} synergies materialize (${Math.round(realizedPct * 100)}%) — the press writes about broken promises (rep −2).`,
          kind: "warn",
        });
      }
    }
    s.integrations = stillInt;
  }

  // Earn-outs förfaller: betala om det förvärvade beståndet levererar.
  if ((s.earnOuts ?? []).length > 0) {
    const absNowEo = s.year * 12 + s.month;
    const still: typeof s.earnOuts = [];
    for (const eo of s.earnOuts ?? []) {
      if (eo.dueAbs > absNowEo) { still.push(eo); continue; }
      const ids = new Set(eo.propertyIds);
      const held = s.portfolio.filter((p) => ids.has(p.id) && p.status === "klar");
      const noi = held.reduce((a, p) => a + (propPotentialRent(p, s) - propAnnualOpex(p, s)) / 12, 0);
      if (noi >= eo.noiTarget) {
        cashflow(s, -eo.amount, "earn-out");
        events.push({ t: `📜 EARN-OUT DUE: the ${eo.target} portfolio delivered — you pay the deferred ${msek(eo.amount)}.`, kind: "expense" });
      } else {
        events.push({ t: `📜 EARN-OUT LAPSED: the ${eo.target} portfolio fell short of its target — the deferred ${msek(eo.amount)} is never paid.`, kind: "income" });
      }
    }
    s.earnOuts = still;
  }

  // ── Uppstickare kliver in (fas 4) ───────────────────────────────
  // När marknaden inte är i bust och det finns plats i aktörsfältet kan
  // ett nytt litet bolag dyka upp med bara såddkapital – de bygger sitt
  // bestånd via samma köp-/byggvägar som alla andra. Staden får påfyllnad
  // av utmanare i takt med att M&A:n äter de svaga.
  if (
    (s.marketCycle?.phase ?? "stable") !== "bust" &&
    s.competitors.length < 10 &&
    random01() < 0.004
  ) {
    const used = new Set(s.competitors.map((c) => c.name));
    const name = SMALL_AI_NAMES.find((n) => !used.has(n));
    if (name) {
      const strategies: CompetitorStrategy[] = ["tillväxt", "värde", "distrikt", "utdelning"];
      const strategy = strategies[Math.floor(random01() * strategies.length)];
      const preferredDistrict = strategy === "distrikt" ? pick(DISTRICTS).id : undefined;
      const seedCash = Math.round(rnd(8, 15) * 1e6);
      s.competitors = [
        ...s.competitors,
        {
          name,
          cash: seedCash,
          units: 0,
          equity: seedCash,
          portfolio: [],
          strategy,
          preferredDistrict,
          agenda: agendaFor(strategy, preferredDistrict),
          small: true,
        },
      ];
      events.push({
        t: `🌱 NEW PLAYER: ${name} opens an office in the city with ${msek(seedCash)} in seed capital — hungry, leveraged and looking for their first deal.`,
        kind: "event",
        rival: name,
      });
    }
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
    // kostnader och utdelning till ägarna. Räntan är numera EXPLICIT
    // (rivalFinance.ts) – skuldsatta rivaler blöder när riksbanken höjer –
    // så retention är högre än när den även skulle täcka räntorna.
    const retention =
      nc.strategy === "tillväxt" ? 0.75 : nc.strategy === "utdelning" ? 0.45 : 0.6;
    const rivInterest = rivalInterest(s, nc);
    rivalCashflow(nc, Math.round(nc.monthlyNOI * retention) - rivInterest);
    // Räntetäckningsvakt: NOI under räntekostnaden i tre månader i följd
    // tvingar fram en nödförsäljning (blocket för distressed sales).
    nc.icrBadMonths = rivalICR(s, nc) < 1 ? (nc.icrBadMonths ?? 0) + 1 : 0;
    // Amortering ur överskottskassan – men BARA under press (ICR < 1.8)
    // eller i bust: friska fastighetsbolag rullar sina lån, de betalar inte
    // av dem (30-årsmätningen visade att villkorslös amortering nollade
    // hela rivalskulden och släckte räntekänsligheten systemet ska ha).
    // Utdelningsbolag amorterar mest, tillväxt minst (strategyBias i bust).
    const icrNow = rivalICR(s, nc);
    if ((nc.debt ?? 0) > 0 && nc.cash > RIVAL_CASH_BUFFER && (icrNow < 1.8 || cyclePhase === "bust")) {
      const amortBias = strategyBias(nc, cyclePhase as "boom" | "bust" | "stable").amort;
      const pay = Math.min(nc.debt ?? 0, Math.round((nc.cash - RIVAL_CASH_BUFFER) * rivalAmortShare(nc) * amortBias));
      if (pay > 0) {
        nc.debt = (nc.debt ?? 0) - pay;
        nc.cash -= pay;
      }
    }
    // Rivalernas byggen tickar och färdigställs (kranar på kartan).
    let finishedBuild: string | null = null;
    nc.portfolio = nc.portfolio.map((p) => {
      if (p.status !== "bygger") return p;
      if (p.buildLeft <= 1) {
        finishedBuild = `${p.typeLabel} i ${p.districtName}`;
        if (p.type === "bostad") newHomeDistricts.add(p.district);
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
    const buildChance =
      (nc.strategy === "tillväxt" ? 0.05 : 0.02) *
      cashAppetite *
      strategyBias(nc, cyclePhase as "boom" | "bust" | "stable").build;
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
      // Bygget belånas (rivalFinance.ts): kassan bär bara eget kapitaldelen.
      if (nc.cash >= Math.round(cost * (1 - rivalLeverage(nc))) + 1_000_000) {
        rivalFinancePurchase(nc, cost);
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
        // Påbyggnaden belånas som annan capex (rivalFinance.ts).
        if (nc.cash >= Math.round(cost * (1 - rivalLeverage(nc))) + 1_000_000) {
          rivalFinancePurchase(nc, cost);
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
    // Aktieportföljen (korsägande) värderas till marknadskurs.
    const holdVal = rivalHoldingsValue(nc, s.stocks);
    nc.equity = nc.cash + indVal + holdVal + nc.portfolio.reduce((a, p) => a + propMarketValue(p, s), 0) - (nc.debt ?? 0);
    // Kapitaldisciplin: fastighetsbolag sitter inte på halva förmögenheten i
    // likvider. Kassa över ~40 % av eget kapital delas ut i takt om 8 %/mån –
    // gamla partiers uppbyggda berg smälter bort inom ett par år. (Fonderna
    // undantas: deras likviditet styrs av moderfondens gummiband ovan.)
    if (!nc.institutional) {
      const maxCash = Math.max(10_000_000, nc.equity * 0.4);
      if (nc.cash > maxCash) {
        nc.cash = Math.round(nc.cash - (nc.cash - maxCash) * 0.08);
        nc.equity = nc.cash + indVal + holdVal + nc.portfolio.reduce((a, p) => a + propMarketValue(p, s), 0) - (nc.debt ?? 0);
      }
    }
    return nc;
  });

  // ── Uppstickare växer upp (tunna delar 5/7) ─────────────────────
  // En liten aktör som byggt eget kapital och ett bestånd tar steget:
  // small-flaggan faller och bolaget börsnoteras – de kan nu bli
  // uppköpsmål via aktiemarknaden och tävla på riktigt om ledartröjan.
  {
    const GRADUATE_EQUITY = 120_000_000;
    const GRADUATE_UNITS = 6;
    for (let i = 0; i < s.competitors.length; i++) {
      const c = s.competitors[i];
      if (!c.small) continue;
      if (c.equity < GRADUATE_EQUITY || (c.portfolio ?? []).length < GRADUATE_UNITS) continue;
      s.competitors[i] = { ...c, small: false };
      // Notera bolaget om det inte redan har en aktie (nytt id-suffix).
      if (!s.stocks.some((st) => st.competitorName === c.name)) {
        const shares = 200_000;
        const price = Math.max(10, Math.round((c.equity / shares) * 100) / 100);
        s.stocks = [
          ...s.stocks,
          {
            id: `comp-grad-${c.name}`,
            name: c.name,
            sector: "fastighet",
            price,
            prevPrice: price,
            monthClose: price,
            targetPrice: price,
            sharesOutstanding: shares,
            owned: 0,
            avgCost: 0,
            dividendYield: 0.032,
            beta: 1.15,
            drift: 0.003,
            volatility: 0.045,
            history: [price],
            competitorName: c.name,
            eps: Math.round(price * 0.07 * 100) / 100,
            analystRating: "Hold" as const,
            targetKurs: Math.round(price * 1.05 * 100) / 100,
            rivalPrevUnits: c.units,
            rivalPrevNOI: c.monthlyNOI ?? 0,
          },
        ];
      }
      events.push({
        t: `📈 COMING OF AGE: ${c.name} grows out of the challenger tier and lists on the exchange — the upstart is now a full rival, and a possible target.`,
        kind: "event",
        rival: c.name,
      });
    }
  }

  // ── Flyttkedjor: nya bostäder suger uppåt ────────────────────────
  // När en ny bostad står klar i ett distrikt flyttar hushåll i äldre hus
  // med lägre standard upp i kedjan – de lämnar sina kontrakt i förtid.
  // Trycket skalar med stadens vakansläge (löst läge = lätt att flytta).
  for (const district of newHomeDistricts) {
    const candidates = s.portfolio.filter(
      (p) =>
        p.district === district &&
        p.type === "bostad" &&
        p.status === "klar" &&
        p.tenants.length > 0 &&
        propertyStandard(p) < 0.62,
    );
    let moved = 0;
    for (const p of candidates) {
      if (moved >= 2) break;
      const std = propertyStandard(p);
      if (random01() < (0.62 - std) * 0.9 * moveP) {
        p.tenants = p.tenants.slice(0, -1);
        moved += 1;
        events.push({
          t: `🏠 Moving chain: a household leaves ${p.typeLabel} in ${p.districtName} for the newly built housing — older, lower-standard homes lose tenants first.`,
          kind: "warn",
        });
      }
    }
  }

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
  if (s.competitors.length > 0 && s.listings.length > 1) {
    const buyer = pick(s.competitors);
    // Konjunkturprofil (strategyBias): värdebolag dammsuger bust-marknaden,
    // tillväxtbolag jagar boomen, utdelningsbolag håller igen i bust.
    const buyBias = strategyBias(buyer, cyclePhase as "boom" | "bust" | "stable").buy;
    if (random01() < (rivalIsClose ? 0.55 : 0.25) * rateAppetite(s.interestRate) * buyBias) {
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
      const equityShare = 1 - rivalLeverage(buyer);
      const affordable = buyable.filter((p) => buyer.cash >= Math.round(p.askPrice * equityShare));
      if (affordable.length > 0) {
        const taken = pick(affordable);
        const price = Math.round(taken.askPrice * rnd(0.97, 1.05));
        // Köpet belånas (rivalFinance.ts): kassan bär eget kapitaldelen,
        // resten läggs på skuldsidan och kostar ränta varje månad.
        const debtPart = Math.round(price * rivalLeverage(buyer));
        s.listings = s.listings.filter((x) => x.id !== taken.id);
        s.competitors = s.competitors.map((c) =>
          c.name === buyer.name
            ? {
                ...c,
                cash: Math.round(c.cash - (price - debtPart)),
                debt: (c.debt ?? 0) + debtPart,
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
  // Korsägande: rivalerna handlar aktier i varandra och i SPELARENS bolag
  // (à la Capitalism) – strategi- och konjunkturstyrt, ur den fria floaten.
  for (const ev of rivalShareTrading(s)) events.push(ev);
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
      // targetPrice MÅSTE följa med: dagssteget drar kursen mot ankaret, och
      // utan detta ägde priceStocks slumpvandring ankaret – kursen tappade
      // kontakten med bolagsvärdet och fastnade på $1-golvet.
      return {
        ...st,
        monthClose: st.price,
        prevPrice: st.price,
        price: newPrice,
        targetPrice: newPrice,
        history: [...st.history, newPrice].slice(-32),
      };
    });
  }

  // ── Avknoppningar: eget kassaflöde, kvartalsutdelning, substanskurs ──
  if ((s.spinOffs ?? []).length > 0) {
    s.spinOffs = (s.spinOffs ?? []).map((spin) => {
      // Bolaget underhåller sina egna hus: kostnaden dras från nettot och
      // skicket hålls uppe – annars ruttnar aktien bort under spelarens
      // kvarvarande post (balansrundan: kurs 50 → 16 på tio år).
      let upkeep = 0;
      s.industryPortfolio = (s.industryPortfolio ?? []).map((a) => {
        if (a.spinOffId !== spin.id || a.status !== "klar") return a;
        upkeep += Math.round(industryAssetValue(a, s) * SPINOFF_UPKEEP_PCT);
        return a.condition < SPINOFF_UPKEEP_COND
          ? { ...a, condition: Math.min(SPINOFF_UPKEEP_COND, a.condition + 1.2) }
          : a;
      });
      // Fastighets-avknoppning: distriktets hus underhålls av dottern och
      // deras driftnetto omdirigeras hit. Spelaren har redan bokfört hyran i
      // månadens driftnetto (monthlyNOI) – så den dras av här igen. NOI:t
      // beräknas med propNOI (samma bas som värdering/utdelning), en liten,
      // avgränsad approximation mot loopens hyra-för-hyra-summa.
      let propNet = 0;
      if (spin.kind === "property") {
        s.portfolio = s.portfolio.map((p) => {
          if (p.spinOffId !== spin.id || p.status !== "klar") return p;
          propNet += Math.round(propNOI(p, s) / 12);
          upkeep += Math.round(propMarketValue(p, s) * SPINOFF_UPKEEP_PCT);
          return p.condition < SPINOFF_UPKEEP_COND
            ? { ...p, condition: Math.min(SPINOFF_UPKEEP_COND, p.condition + 1.2) }
            : p;
        });
        if (propNet !== 0) cashflow(s, -propNet, "driftnetto till fastighets-avknoppning");
      }
      const net = (spinoffNet[spin.id] ?? 0) + propNet - upkeep;
      let ns: typeof spin = { ...spin, cash: spin.cash + net, lastMonthNet: net };
      // Koncernbidrag: moderbolaget täcker förlustmånader med kassa och får
      // motsvarande förlustavdrag – dottern hålls flytande, skölden byggs.
      if (s.groupContribution && net < 0 && s.cash > 0) {
        const st0 = s.stocks.find((x) => x.id === spin.stockId);
        const ownPct = st0 ? st0.owned / st0.sharesOutstanding : 0;
        const fund = Math.min(s.cash, Math.round(-net * ownPct));
        if (fund > 0) {
          cashflow(s, -fund, "koncernbidrag");
          s.taxLossCarry = Math.round((s.taxLossCarry ?? 0) + fund);
          ns = { ...ns, cash: ns.cash + fund };
          events.push({
            t: `🏛️ Group contribution: ${kr(fund)} covers ${spin.name}'s loss month — the amount joins your loss carryforward.`,
            kind: "expense",
          });
        }
      }
      // Kvartalsutdelning: 60 % av kassan, pro rata till alla aktieägare –
      // spelarens andel via innehavet (stock.owned).
      if (s.month % 3 === 0 && ns.cash > 0) {
        const st = s.stocks.find((x) => x.id === spin.stockId);
        if (st) {
          const div = Math.round(ns.cash * SPINOFF_DIVIDEND_PAYOUT);
          const toPlayer = Math.round((div * st.owned) / st.sharesOutstanding);
          ns = { ...ns, cash: ns.cash - div, dividendsPaidToPlayer: ns.dividendsPaidToPlayer + toPlayer };
          if (toPlayer > 0) {
            cashflow(s, toPlayer, "utdelning från avknoppning");
            s.dividendsReceived = (s.dividendsReceived ?? 0) + toPlayer;
            events.push({
              t: `🔔 ${spin.name} pays a quarterly dividend: ${kr(toPlayer)} on your ${Math.round((st.owned / st.sharesOutstanding) * 100)}% stake.`,
              kind: "income",
            });
          }
        }
      }
      return ns;
    });
    // Substanskurs (tillgångsvärde + kassa per aktie) – samma fundamentala
    // modell som FBAB och rivalaktierna, ingen slumpvandring.
    s.stocks = s.stocks.map((st) => {
      if (!st.spinOffId) return st;
      const spin = (s.spinOffs ?? []).find((x) => x.stockId === st.id);
      if (!spin) return st;
      const price = spinoffSharePrice(s, spin, st);
      return {
        ...st,
        monthClose: st.price,
        prevPrice: st.price,
        price,
        targetPrice: price,
        history: [...st.history, price].slice(-32),
      };
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

  // Revolving credit auto-unlock at rep 40. Linan räknas sedan om varje
  // månad (revolvingLimitOf): den följer beståndets värde och det oanvända
  // pantutrymmet, i stället för att frysa fast på det värde portföljen råkade
  // ha den månad krediten beviljades.
  if (s.reputation >= 40) {
    const limit = revolvingLimitOf(s);
    if (!s.revolving) {
      s.revolving = { limit, used: 0 };
      events.push({ t: `💳 Revolving credit activated: ${kr(limit)} available — 5% of portfolio value plus a quarter of your unused mortgage headroom. Keep leverage low and the line grows.`, kind: "income" });
    } else if (limit !== s.revolving.limit) {
      const prev = s.revolving.limit;
      s.revolving = { ...s.revolving, limit };
      // Bara rejäla förändringar är värda en rad i loggen.
      if (Math.abs(limit - prev) > Math.max(250_000, prev * 0.2))
        events.push({
          t: `💳 The bank ${limit > prev ? "raised" : "lowered"} the revolving credit line to ${kr(limit)} (was ${kr(prev)}) — it follows your portfolio value and unused mortgage headroom.`,
          kind: limit > prev ? "income" : "warn",
        });
    }
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
    // Bruset är numera väntevärdesneutralt: den gamla asymmetrin (−0.0025…
    // +0.004) gav +0.075 %/mån åt ALLA distrikt och inflaterade hela staden
    // till Exklusivt på 30 år (fas 2-mätselet). Status ska förtjänas – av
    // ägande, skötsel, infrastruktur och gentrifiering, inte av tidens gång.
    const growth = 0.0015 * ownedHere + condPull + rnd(-0.003, 0.003);
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
    // ── Nemesis-eskalering (fas 3): fientligheten har en trappa ──────
    // Nivå 1 (≤ −40): fler motbud (nemesisBidBoost ovan). Nivå 2 (≤ −60):
    // hyresgästvärvning och svartmålning. Nivå 3 (≤ −80): nemesisen samlar
    // staden mot dig i en allians. Aggressionen skalar frekvensen.
    if (s.nemesis && s.competitors.some((c) => c.name === s.nemesis)) {
      const nem = s.nemesis;
      const hostility = rivalStanding(s, nem);
      const agg = aggressionOf(nem);
      if (hostility <= -60 && random01() < 0.07 * agg) {
        const withTenants = s.portfolio.filter((p) => p.status === "klar" && p.tenants.length > 0);
        if (withTenants.length > 0 && random01() < 0.5) {
          // Värvning: nemesisen lockar över en av dina hyresgäster.
          const p = withTenants[Math.floor(random01() * withTenants.length)];
          const idx = Math.floor(random01() * p.tenants.length);
          const lured = p.tenants[idx];
          s.portfolio = s.portfolio.map((x) =>
            x.id === p.id ? { ...x, tenants: x.tenants.filter((_, i) => i !== idx) } : x,
          );
          const q = rivalQuote(nem, "budkrig", absNow);
          events.push({
            t: `🕵️ ${nem} poaches your tenant: ${lured.name} leaves ${p.typeLabel} in ${p.districtName} for a sweetheart lease across the street.${q ? " " + q : ""}`,
            kind: "warn",
            rival: nem,
          });
        } else {
          // Svartmålning: planterade artiklar värmer pressen och naggar ryktet.
          s.pressHeat = +((s.pressHeat ?? 0) + 1.5).toFixed(2);
          s.reputation = Math.max(0, +(s.reputation - 1).toFixed(1));
          events.push({
            t: `📰 ${nem} plants a smear piece about your upkeep standards — the papers are sniffing around (rep −1).`,
            kind: "warn",
            rival: nem,
          });
        }
      }
      if (hostility <= -80 && random01() < 0.05 * agg) {
        const partner = [...s.competitors]
          .filter((c) => c.name !== nem && !hasRelation(s, nem, c.name))
          .sort((a, b) => b.equity - a.equity)[0];
        if (partner) {
          s.rivalRelations = [...(s.rivalRelations ?? []), { a: nem, b: partner.name, kind: "alliance", since: absNow }];
          events.push({
            t: `⚔️ THE CITY TURNS: ${nem} forges an alliance with ${partner.name} — openly aimed at breaking your grip on the market.`,
            kind: "warn",
            rival: nem,
          });
        }
      }
    }
    // Standing förfaller sakta mot neutralt: fejder svalnar om ingen
    // häller bensin på dem – och gamla tjänster glöms också bort.
    if (s.standing?.rivals) {
      const decayed: Record<string, number> = {};
      for (const [name, v] of Object.entries(s.standing.rivals)) {
        const nv = Math.abs(v) <= 0.3 ? 0 : +(v - Math.sign(v) * 0.3).toFixed(1);
        if (nv !== 0) decayed[name] = nv;
      }
      s.standing = { ...s.standing, rivals: decayed };
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
      // Politisk välvilja sänker kommunens utgångsbud (politics.ts).
      const minBid = Math.round((landValue * s.marketMod * 0.8 * favorAuctionMult(s)) / 10_000) * 10_000;
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

  // ── Livscykel: renovräkningsbeslutet ────────────────────────────
  // Ett gammalt, nedgånget bostadshus (ålder > 40, skick < 45) ställer
  // ägaren inför valet: totalrenovera – hyresgästerna tvingas flytta och
  // pressen kallar det renovräkning – eller låta huset förfalla vidare.
  // Engångserbjudande per hus; 20 % risk att länsstyrelsen kulturmärker
  // fasaden vid erbjudandet, vilket halverar hyreslyftet.
  if ((!s.story || s.story.done) && !s.pendingDecision) {
    const cand = s.portfolio.find(
      (p) =>
        p.type === "bostad" && p.status === "klar" && !p.renovOffered &&
        buildingAge(p, s) > 40 && p.condition < 45 && p.tenants.length > 0,
    );
    if (cand) {
      const heritage = random01() < 0.2;
      const cost = Math.round(propMarketValue(cand, s) * 0.35);
      const lift = heritage ? "7.5% (heritage-capped)" : "15%";
      s.portfolio = s.portfolio.map((x) => (x.id === cand.id ? { ...x, renovOffered: true } : x));
      s.pendingDecision = {
        id: `renovate-${cand.id}`,
        title: "Total renovation?",
        text: `The ${buildingAge(cand, s)}-year-old ${cand.typeLabel.toLowerCase()} in ${cand.districtName} is worn down (condition ${Math.round(cand.condition)}) — pipes, roof and frame are all due at once. A full renovation costs ${msek(cost)}, but all ${cand.tenants.length} household(s) must move out, and the press already has a word for it: renoviction.${heritage ? " The county board has heritage-listed the facade — the rent uplift is halved." : ""}`,
        options: [
          {
            label: `Renovate (${msek(cost)})`,
            detail: `Condition 95, age reset, +${lift} rent potential. Tenants move out: reputation −2, press heat +3.`,
            effect: {
              cash: -cost,
              reputation: -2,
              renovate: { propertyId: cand.id, heritage },
              log: `🔨 RENOVICTION: ${cand.typeLabel} in ${cand.districtName} is gutted and rebuilt — the tenants have to find somewhere else.`,
              logKind: "expense",
            },
          },
          {
            label: "Not now",
            detail: "The building keeps aging — wear accelerates past 40 years.",
            effect: {
              log: `The renovation plans for ${cand.typeLabel} in ${cand.districtName} are shelved.`,
              logKind: "info",
            },
          },
        ],
      };
      events.push({ t: `🤔 Decision required: total renovation in ${cand.districtName}?`, kind: "event" });
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

  // Lånelöptid: refinansiering var 48–72 månad. Marknadsläget vid förfallet
  // präglar en PERSONLIG refi-premie (refiSpreadAdj, läses av loanTerms) i
  // stället för att som förr flytta själva styrräntan – riksbanken äger nu
  // basräntan (centralBank.ts). Med trancher (SPLIT_MATURITIES) omförhandlas
  // bara en tredjedel av premien per förfall.
  const refiPremiumNow = () => {
    const cycle = s.marketCycle?.phase ?? "stable";
    const recSpread = (s.recessionMonthsLeft ?? 0) > 0 ? 2.0 : 0;
    const cycleSpread = cycle === "bust" ? 1.5 : cycle === "boom" ? -0.5 : 0;
    const repSpread = s.reputation < 40 ? 2.5 : s.reputation < 60 ? 1.0 : 0;
    return { premium: Math.max(-1, Math.min(4, cycleSpread + recSpread + repSpread)), cycle, recSpread };
  };
  if (s.debt > 0 && (s.debtTranches ?? []).length > 0) {
    const nowAbsT = s.year * 12 + s.month;
    const due = s.debtTranches!.filter((t) => t <= nowAbsT);
    if (due.length > 0) {
      const { premium } = refiPremiumNow();
      const weight = due.length / Math.max(1, s.debtTranches!.length);
      const old = s.refiSpreadAdj ?? 0;
      s.refiSpreadAdj = +((old + (premium - old) * weight)).toFixed(2);
      s.debtTranches = [
        ...s.debtTranches!.filter((t) => t > nowAbsT),
        ...due.map(() => nowAbsT + 72),
      ].sort((a, b) => a - b);
      const diff = +(s.refiSpreadAdj - old).toFixed(2);
      events.push({
        t: `🏦 TRANCHE REFINANCED: ${Math.round(weight * 100)}% of the debt met the market. Refi premium now ${s.refiSpreadAdj >= 0 ? "+" : ""}${s.refiSpreadAdj.toFixed(1)}pp (${diff >= 0 ? "+" : ""}${diff.toFixed(1)}).`,
        kind: diff > 0.25 ? "warn" : "income",
      });
    }
  } else if (s.debt > 0) {
    const nowAbs3 = s.year * 12 + s.month;
    if (!s.debtMatureAbs) {
      s.debtMatureAbs = nowAbs3 + 48 + Math.floor(random01() * 24);
    } else if (nowAbs3 >= s.debtMatureAbs) {
      const { premium, cycle, recSpread } = refiPremiumNow();
      const old = s.refiSpreadAdj ?? 0;
      s.refiSpreadAdj = premium;
      s.debtMatureAbs = nowAbs3 + 48 + Math.floor(random01() * 24);
      const diff = +(premium - old).toFixed(2);
      events.push({
        t: `🏦 REFINANCING: The loan matures. Refi premium ${premium >= 0 ? "+" : ""}${premium.toFixed(1)}pp on the spread (${diff >= 0 ? "+" : ""}${diff.toFixed(1)}). Market: ${cycle}${recSpread > 0 ? ", downturn" : ""}.`,
        kind: diff > 0.25 ? "warn" : "income",
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

  // Milstolpekedjor (milestoneChains.ts): fleretappersmål med permanenta
  // belöningar – nästa nivå låses upp så fort mätvärdet passerar målet.
  for (const chain of CHAINS) {
    let lvl = s.chainLevels?.[chain.id] ?? 0;
    const metric = chain.metric(s);
    while (lvl < chain.steps.length && metric >= chain.steps[lvl].target) {
      lvl += 1;
      s.chainLevels = { ...(s.chainLevels ?? {}), [chain.id]: lvl };
      s.reputation = Math.min(100, s.reputation + 2);
      events.push({
        t: `⛓️ CHAIN MILESTONE: ${chain.icon} ${chain.title} ${["I", "II", "III"][lvl - 1] ?? lvl} — ${chain.steps[lvl - 1].reward} (permanent).`,
        kind: "income",
      });
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
        // Sålde förvaltaren ALLT och lämnade för lite kvar för att komma
        // tillbaka in på marknaden är partiet slut här. Alternativet – ett
        // bolag utan hus, utan hyror och utan råd att köpa – är inte ett
        // parti man kan spela vidare, bara ett decennium av tomma månader
        // innan de fasta kostnaderna hinner ikapp.
        if (!s.gameOver && cannotRestart(s)) {
          s.gameOver = true;
          s.gameOverReason = {
            icon: "🧾",
            title: "The receiver sold everything",
            text: `The liquidity crisis forced the receiver to sell the entire portfolio at distress prices. What is left — ${kr(s.cash)} in cash — is not enough for a down payment on anything on the market, and with no properties there is no rent coming in. Next run: keep a cash buffer that covers a few months of costs, and use the revolving credit line before the account goes negative.`,
          };
          s.log = [{ t: "🧾 The receiver sold the last property. Without properties, rent or capital to buy again, the company is wound up.", kind: "warn" }, ...s.log];
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
      } else if (
        (s.crisisMonthsLeft ?? 0) > 0 &&
        playerMarketShare(s) >= TBTF_SHARE &&
        !s.pendingDecision
      ) {
        // Too big to fail: när det systemviktiga imperiet vacklar mitt i
        // krisen kan staten inte låta det falla – ett stödpaket erbjuds,
        // med villkor. Att tacka nej öppnar den vanliga rekonstruktionen.
        const shortfall = Math.max(0, -s.cash);
        const aid = Math.round(shortfall * 1.5 + 2_000_000);
        s.pendingDecision = {
          id: "tbtf_bailout",
          title: "Too big to fail",
          text: `Your empire holds ${Math.round(playerMarketShare(s) * 100)}% of the city's property values — and it is failing in the middle of the crisis. The finance ministry fears a collapse would take the whole city down. A state support package of ${kr(aid)} is on the table, with strings attached: restructuring covenants for 36 months and a public humiliation. Or face the receiver like anyone else.`,
          options: [
            {
              label: "Accept the support package",
              detail: `${kr(aid)} cash · rep −10 · covenants 36 mo`,
              effect: {
                cash: aid,
                reputation: -10,
                restructureMonths: 36,
                log: `🏛️ STATE BAILOUT: ${kr(aid)} injected into the systemically important landlord. The press is merciless (rep −10) and the bank's covenants bind for 36 months.`,
                logKind: "warn",
              },
            },
            {
              label: "Refuse — face the receiver",
              detail: "Ordinary receivership opens",
              effect: {
                forceReceivership: true,
                log: "⚖️ You refuse the state's money. The receiver is appointed — the crisis menu opens.",
                logKind: "warn",
              },
            },
          ],
        };
        s.log = [{ t: "🏛️ Decision required: Too big to fail — the state offers a support package.", kind: "warn" }, ...s.log];
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

  // ── Bolaget står tomt ────────────────────────────────────────────
  // Sista huset kan försvinna på fler sätt än via förvaltaren: sålt på ett
  // bud, avvecklat i en affär. Utfallet är detsamma – inga hus, inga hyror,
  // och för lite kvar för att komma in på marknaden igen. Utan den här
  // kontrollen rullade partiet vidare i tomma månader tills de fasta
  // kostnaderna hann ikapp; i femtioårsmätningen stod ett bolag så i tio år
  // och räknades ändå som levande.
  //
  // Till skillnad från förvaltarens tvångslikvidering, som är entydig och
  // avslutar direkt, ges den här vägen ett år: marknaden byter annonser och
  // en hyra eller en försäljning kan hinna ändra läget.
  if (!s.gameOver && !s.settings?.noBankruptcy) {
    if (s.portfolio.length === 0 && cannotRestart(s)) {
      s.emptyMonths = (s.emptyMonths ?? 0) + 1;
      if (s.emptyMonths === WIND_UP_WARN_MONTHS)
        s.log = [{ t: `⚠️ The company has owned nothing for ${WIND_UP_WARN_MONTHS} months and cannot cover a down payment on anything for sale. Raise capital or the company is wound up in ${WIND_UP_MONTHS - WIND_UP_WARN_MONTHS} months.`, kind: "warn" }, ...s.log];
      if (s.emptyMonths >= WIND_UP_MONTHS) {
        s.gameOver = true;
        s.gameOverReason = {
          icon: "🧾",
          title: "The company is wound up",
          text: `For ${WIND_UP_MONTHS} months the company has owned no properties, collected no rent, and held too little — ${kr(s.cash)} — to cover a down payment on anything on the market. There is nothing left to run. Next run: keep a cash buffer that covers a few months of costs, and never let the portfolio go to zero without the capital to buy back in.`,
        };
        s.log = [{ t: `🧾 Wound up: a year without properties, without rent and without the capital to buy back in.`, kind: "warn" }, ...s.log];
      }
    } else if (s.emptyMonths) {
      s.emptyMonths = 0;
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
