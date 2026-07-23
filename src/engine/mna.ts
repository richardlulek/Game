/* ============================================================
   Förvärvsvärdering (M&A) – vad är ett rivalbolag värt FÖR DIG?

   Ersätter panelens gamla schablon (askPrice × 1.05) med en riktig
   kalkyl som går att fatta beslut på:

   · SUBSTANSVÄRDE (NAV): portföljen till marknadsvärde + industri-
     tillgångar + kassan − skulden som följer med köpet. Sedan fas 3
     bär rivalerna riktig skuld – den ska synas i kalkylen (och tas
     över på riktigt i ACQUIRE_RIVAL).
   · SYNERGIER – det spelet redan modellerar, kapitaliserat:
     – Distriktsöverlapp: rivalens hus i distrikt där du redan är
       etablerad (≥ 2 färdiga hus) är värda mer i dina händer
       (samordnad förvaltning, kvartersmix, prissättningsmakt).
     – Energisynergi: dina ägda MW sänker driftkostnaden även för de
       förvärvade husen – besparingen kapitaliseras över ~8 år.
     – Stordrift: overhead per hus faller med portföljstorleken.

   Ren logik, inga React-beroenden.
   ============================================================ */

import { msek, pct } from "./format";
import { energySynergyMult, industryAssetValue } from "./industries";
import { propAnnualOpex, propMarketValue, propPotentialRent } from "./property";
import { random01, rnd } from "./random";
import { aggressionOf, rivalQuote } from "./rivalPersonas";
import { adjustStanding, rivalStanding } from "./standing";
import type { Competitor, DealFinancing, GameState } from "./types";

/** Värdelyft per rivalfastighet i distrikt där du redan är etablerad. */
export const DISTRICT_OVERLAP_LIFT = 0.05;
/** Så många färdiga egna hus i distriktet krävs för överlappssynergi. */
export const OVERLAP_MIN_HOLDINGS = 2;
/** Kapitaliseringsmultipel på årliga driftbesparingar (~8 års nuvärde). */
export const SYNERGY_CAP_MULTIPLE = 8;
/** Stordrift: värdelyft per 5 egna färdiga hus, med tak. */
export const SCALE_STEP = 0.004;
export const SCALE_CAP = 0.03;

export interface AcquisitionValuation {
  /** Rivalens fastigheter till marknadsvärde (propMarketValue). */
  propertyValue: number;
  /** Industritillgångar (hotell, energi, logistik) till värde. */
  industryValue: number;
  /** Kassan som följer med köpet. */
  cash: number;
  /** Skulden som följer med köpet (dras av – och tas över på riktigt). */
  debt: number;
  /** Substansvärde: tillgångar + kassa − skuld. */
  nav: number;
  synergies: {
    district: number;
    energy: number;
    scale: number;
    total: number;
  };
  /** NAV + synergier: vad bolaget är värt i DINA händer. */
  totalValue: number;
}

export function acquisitionValuation(s: GameState, comp: Competitor): AcquisitionValuation {
  const props = comp.portfolio ?? [];
  const propertyValue = Math.round(props.reduce((a, p) => a + propMarketValue(p, s), 0));
  const industryValue = Math.round(
    (comp.industries ?? []).reduce((a, x) => a + industryAssetValue(x, s), 0),
  );
  const cash = Math.round(comp.cash ?? 0);
  const debt = Math.round(comp.debt ?? 0);
  const nav = propertyValue + industryValue + cash - debt;

  // Distriktsöverlapp: räkna dina färdiga hus per distrikt en gång.
  const mine = new Map<string, number>();
  for (const p of s.portfolio) {
    if (p.status === "klar") mine.set(p.district, (mine.get(p.district) ?? 0) + 1);
  }
  const district = Math.round(
    props.reduce(
      (a, p) =>
        (mine.get(p.district) ?? 0) >= OVERLAP_MIN_HOLDINGS
          ? a + propMarketValue(p, s) * DISTRICT_OVERLAP_LIFT
          : a,
      0,
    ),
  );

  // Energisynergi: propAnnualOpex för DIG inkluderar redan rabatten från
  // dina MW – besparingen mot rivalens drift är skillnaden upp till basen.
  const eMult = energySynergyMult(s);
  const energy =
    eMult < 1
      ? Math.round(
          props.reduce((a, p) => a + propAnnualOpex(p, s) * (1 / eMult - 1), 0) *
            SYNERGY_CAP_MULTIPLE,
        )
      : 0;

  // Stordrift: förvaltningsoverhead per hus faller med portföljstorleken.
  const myKlar = s.portfolio.filter((p) => p.status === "klar").length;
  const scale = Math.round(propertyValue * Math.min(SCALE_CAP, SCALE_STEP * Math.floor(myKlar / 5)));

  const total = district + energy + scale;
  return {
    propertyValue,
    industryValue,
    cash,
    debt,
    nav,
    synergies: { district, energy, scale, total },
    totalValue: nav + total,
  };
}

/* ── Förhandlingen (M&A 2.0, batch 1) ──────────────────────────────
   Budet är en dialog, inte en knapp: ägaren svarar accept/motbud/
   avvisat utifrån premie mot sin egen värdering, personans aggression,
   relationen till dig och den egna balansräkningens press. */

/** Ägarens grundpremie över substansvärdet. */
export const OWNER_PREMIUM = 1.25;
/** Rundor innan ägaren tröttnar (tredje motbudet är slutbud). */
export const MAX_DEAL_ROUNDS = 3;
/** Månader i frysbox efter avvisad/avbruten förhandling. */
export const DEAL_COOLDOWN_MONTHS = 12;

/** Vad ägaren egentligen vill ha för bolaget. */
export function ownerAskPrice(s: GameState, comp: Competitor): number {
  const val = acquisitionValuation(s, comp);
  const base = Math.max(val.nav, comp.equity, 1_000_000) * OWNER_PREMIUM;
  const agg = aggressionOf(comp.name);
  let mult = 1 + (agg - 0.5) * 0.3; // Sonny Lund ~0.94 … Harborwick ~1.12
  const st = rivalStanding(s, comp.name);
  if (st >= 30) mult -= 0.05;
  else if (st <= -30) mult += 0.15; // fiender säljer inte billigt till DIG
  // Pressade ägare mjuknar: tom kassa, sviktande räntetäckning eller bust.
  const stressed =
    comp.cash < 0 || (comp.icrBadMonths ?? 0) >= 2 || (s.marketCycle?.phase ?? "stable") === "bust";
  if (stressed) mult *= 0.85;
  // Toehold: en stor ägarpost pressar styrelsen (batch 3).
  const stock = s.stocks.find((x) => x.competitorName === comp.name);
  const ownFrac = stock && stock.sharesOutstanding > 0 ? stock.owned / stock.sharesOutstanding : 0;
  if (ownFrac >= 0.10) mult -= 0.05;
  return Math.round(base * mult);
}

export type OwnerResponse =
  | { kind: "accept" }
  | { kind: "counter"; amount: number }
  | { kind: "reject" };

/** Ägarens svar på ett bud i runda `round`. Deterministiskt – personligheten
 *  bor i ownerAskPrice, inte i tärningen. */
export function ownerResponse(s: GameState, comp: Competitor, offer: number, round: number): OwnerResponse {
  const ask = ownerAskPrice(s, comp);
  // I sista rundan prutar ägaren hellre än tappar affären helt.
  if (offer >= ask * (round >= MAX_DEAL_ROUNDS ? 0.97 : 1)) return { kind: "accept" };
  if (offer >= ask * 0.85 && round < MAX_DEAL_ROUNDS)
    return { kind: "counter", amount: Math.round((ask + offer) / 2) };
  return { kind: "reject" };
}

/* ── Genomförandet ─────────────────────────────────────────────────
   Ett enda säte för allt som händer när ett bolag går in i koncernen:
   finansiering, kassa/skuld, aktieavnotering, standing – och (senare
   batchar) lik i garderoben, integration och konkurrensprövning. */

/* Integrationen (batch 4): synergier är ett mål, inte en knapp. */
export const INTEGRATION_MONTHS = 9;
export const INTEGRATION_COST_SHARE = 0.02;
/** Integrationsfriktion: förhöjd drift i de förvärvade husen tills klart. */
export const INTEGRATION_FRICTION = 1.15;
/** Fientliga köp realiserar bara 70 % av synergimålet. */
export const HOSTILE_REALIZE = 0.7;
/** Rea-stämpel: snabb vidareförsäljning inom 12 mån säljs med rabatt. */
export const FLIP_STAMP_MONTHS = 12;
export const FLIP_DISCOUNT = 0.9;

/** Integrationspoäng 0.6–1.0: staben avgör hur mycket av synergierna som
 *  faktiskt hämtas hem. */
export function integrationScore(s: GameState): number {
  const staffLevels = Object.values(s.staff ?? {}).reduce((a, n) => a + n, 0);
  return Math.min(1, 0.6 + staffLevels * 0.02);
}

/** Leveraged buyout: liten kontantinsats + arrangörsarvode på förvärvsskulden. */
export const LBO_DOWN = 0.10;
export const LBO_FEE_PCT = 0.02;

/** Break-up (asset stripping): fokuspremie på styckesförsäljningen … */
export const BREAKUP_PREMIUM = 1.10;
/** … men raider-stämpeln kostar rykte och relationer. */
export const BREAKUP_REP_HIT = 6;
export const BREAKUP_STANDING_HIT = 4;

/** Aktieägaraktivism: minsta ägarandel i rivalen för en kampanj. */
export const ACTIVIST_MIN_STAKE = 0.10;
/** Andel av rivalens kassa som en tvingad extrautdelning tömmer. */
export const ACTIVIST_PAYOUT_SHARE = 0.5;
/** Relationskostnaden – aktivism är fientligt. */
export const ACTIVIST_STANDING_HIT = 6;
/** Månader innan du kan driva en ny kampanj mot samma rival. */
export const ACTIVIST_COOLDOWN = 12;

/** Retention-paket vid integration: avgift som andel av synergimålet … */
export const RETENTION_FEE_PCT = 0.03;
/** … som lyfter det realiserade synergiutfallet … */
export const RETENTION_REALIZE_BONUS = 0.12;
/** … och skär ned kulturkrock-churnen till en bråkdel. */
export const RETENTION_CHURN_MULT = 0.25;

export function executeAcquisition(
  state: GameState,
  rivalName: string,
  amount: number,
  financing: DealFinancing,
  opts?: { hostile?: boolean },
): { state: GameState; error?: string } {
  const rival = state.competitors.find((c) => c.name === rivalName);
  if (!rival) return { state, error: "The company no longer exists." };
  if ((rival.portfolio ?? []).length === 0)
    return { state, error: `${rival.name} owns no properties to acquire.` };
  // Synergimålet låses vid affären – integrationen avgör vad som infrias.
  const dealSynergies = acquisitionValuation(state, rival).synergies.total;

  // Din befintliga aktiepost räknas av – du köper bara resten.
  const stock = state.stocks.find((x) => x.competitorName === rival.name);
  const ownFrac = stock && stock.sharesOutstanding > 0
    ? Math.min(1, stock.owned / stock.sharesOutstanding)
    : 0;
  const price = Math.round(amount * (1 - ownFrac));

  // Finansieringen: kassa/lån/aktier/earn-out.
  let cashOut = 0;
  let newLoan = 0;
  let ipoShares = state.ipoShares;
  let takeoverDelta = 0;
  let earnOuts = state.earnOuts ?? [];
  if (financing === "kontant") {
    if (state.cash < price) return { state, error: `Cash purchase requires ${msek(price)}.` };
    cashOut = price;
  } else if (financing === "lan") {
    cashOut = Math.round(price * 0.25);
    newLoan = price - cashOut;
    if (state.cash < cashOut) return { state, error: `You need ${msek(cashOut)} (25% down payment).` };
  } else if (financing === "aktier") {
    if (!state.ipoActive) return { state, error: "Share payment requires a listed company (IPO)." };
    const own = state.stocks.find((x) => x.competitorName === "__player__");
    const sharePrice = own?.price ?? 0;
    if (sharePrice <= 0) return { state, error: "Your share has no market price." };
    const shares = state.ipoShares ?? { total: 10_000_000, public: 3_000_000 };
    const newShares = Math.ceil(price / sharePrice);
    // Riktad emission till säljaren: ingen kassa ut, men utspädning och
    // en ny storägare på listan (uppköpstrycket ökar).
    ipoShares = { total: shares.total + newShares, public: shares.public + newShares };
    takeoverDelta = 2;
  } else if (financing === "lbo") {
    // Leveraged buyout: bara LBO_DOWN kontant, resten hög-belånad förvärvs-
    // skuld (+ arrangörsarvode). Målets EGEN hyra ska bära skulden – går
    // yield över räntan finansierar affären sig själv, annars en skuldspiral.
    const down = Math.round(price * LBO_DOWN);
    const loanBase = price - down;
    const fee = Math.round(loanBase * LBO_FEE_PCT);
    cashOut = down + fee;
    newLoan = loanBase;
    if (state.cash < cashOut) return { state, error: `An LBO needs ${msek(cashOut)} (${Math.round(LBO_DOWN * 100)}% down + arrangement fee).` };
  } else {
    // Earn-out: 75 % nu (25 % kontant / 75 % lån av den delen), resten
    // betalas om 24 mån OM beståndet håller 85 % av dagens driftnetto.
    const nowPart = Math.round(price * 0.75);
    cashOut = Math.round(nowPart * 0.25);
    newLoan = nowPart - cashOut;
    if (state.cash < cashOut) return { state, error: `You need ${msek(cashOut)} (25% down on the upfront part).` };
    const noiNow = (rival.portfolio ?? []).reduce(
      (a, p) => a + (propPotentialRent(p, state) - propAnnualOpex(p, state)) / 12,
      0,
    );
    earnOuts = [
      ...earnOuts,
      {
        target: rival.name,
        amount: price - nowPart,
        dueAbs: state.year * 12 + state.month + 24,
        noiTarget: Math.round(noiNow * 0.85),
        propertyIds: (rival.portfolio ?? []).map((p) => p.id),
      },
    ];
  }

  const absNow = state.year * 12 + state.month;
  let acquired = (rival.portfolio ?? []).map((p) => ({
    ...p,
    owned: true,
    purchasePrice: p.askPrice,
    // Integrationsfriktion: dubbel förvaltning tills integrationen är klar,
    // och rea-stämpel om huset flippas vidare inom ett år.
    opexMult: +(p.opexMult * INTEGRATION_FRICTION).toFixed(3),
    integrationUntilAbs: absNow + FLIP_STAMP_MONTHS,
    // Kulturkrock: förvärvade hyresgäster är oroliga för nya ägare.
    tenants: (p.tenants ?? []).map((t) => ({ ...t, satisfaction: Math.max(0, (t.satisfaction ?? 60) - 10) })),
    txHistory: [
      ...(p.txHistory ?? []),
      { type: "bought" as const, price: p.askPrice, month: state.month, year: state.year, party: `Acquisition of ${rival.name}` },
    ],
  }));

  // Lik i garderoben (batch 2): utan genomförd due diligence riskerar du
  // att böckerna ljög – dolda skickproblem dyker upp efter tillträdet.
  let skeletonNote = "";
  let pressHeatDelta = 0;
  if (!ddDoneFor(state, rivalName) && random01() < SKELETON_RISK) {
    acquired = acquired.map((p, i) =>
      i % 3 === 0 ? { ...p, condition: Math.max(10, Math.round(p.condition - rnd(15, 25))) } : p,
    );
    pressHeatDelta = 2;
    skeletonNote = " 💀 SKELETONS IN THE CLOSET: the surveys were rosier than the buildings — hidden maintenance debt surfaces across the portfolio.";
  }

  // Egen blankning i bolaget stängs till kurs vid avnoteringen.
  const shortSettle = stock && (stock.shortQty ?? 0) > 0
    ? Math.max(0, Math.round((stock.shortAvgPrice ?? stock.price) * stock.shortQty! * 1.5) + Math.round(stock.shortQty! * ((stock.shortAvgPrice ?? stock.price) - stock.price)))
    : 0;

  // Uppköpet skrämmer de överlevande rivalerna.
  let acqStanding = state.standing;
  for (const c of state.competitors) {
    if (c.name !== rivalName) acqStanding = adjustStanding(acqStanding, { kind: "rival", name: c.name }, -6);
  }

  const q = rivalQuote(rival.name, "uppköpt", state.month);
  const integrationCost = Math.round(price * INTEGRATION_COST_SHARE);
  const out: GameState = {
      ...state,
      cash: state.cash - cashOut - integrationCost + Math.round(rival.cash ?? 0) + shortSettle,
      // Skulden följer med köpet (rivalFinance) – plus ev. förvärvslån.
      debt: state.debt + newLoan + Math.round(rival.debt ?? 0),
      ipoShares,
      takeoverPressure: takeoverDelta > 0 ? (state.takeoverPressure ?? 0) + takeoverDelta : state.takeoverPressure,
      earnOuts,
      standing: acqStanding,
      portfolio: [...state.portfolio, ...acquired],
      industryPortfolio: [...(state.industryPortfolio ?? []), ...(rival.industries ?? [])],
      competitors: state.competitors.filter((c) => c.name !== rivalName),
      stocks: stock ? state.stocks.filter((x) => x.id !== stock.id) : state.stocks,
      stockOrders: stock ? (state.stockOrders ?? []).filter((o) => o.stockId !== stock.id) : state.stockOrders,
      pendingDeal: null,
      integrations: [
        ...(state.integrations ?? []),
        {
          target: rival.name,
          startAbs: absNow,
          months: INTEGRATION_MONTHS,
          synergyGoal: dealSynergies,
          hostile: !!opts?.hostile,
          propertyIds: acquired.map((p) => p.id),
        },
      ],
      ddDone: (state.ddDone ?? []).filter((n) => n !== rivalName),
      pressHeat: pressHeatDelta > 0 ? +(((state.pressHeat ?? 0) + pressHeatDelta)).toFixed(2) : state.pressHeat,
      reputation: Math.min(100, state.reputation + 8),
      log: [
        {
          t: `🏢 ACQUISITION: ${rival.name} is merged into the group for ${msek(price)}${ownFrac > 0 ? ` (your ${pct(ownFrac)} stake was offset)` : ""} via ${financing === "kontant" ? "cash" : financing === "lan" ? "bank financing" : financing === "aktier" ? "a share issue" : financing === "lbo" ? "a leveraged buyout" : "an earn-out structure"} – ${acquired.length} properties, ${msek(Math.round(rival.cash ?? 0))} in cash${(rival.debt ?? 0) > 0 ? ` and ${msek(Math.round(rival.debt ?? 0))} of assumed debt` : ""} added!${q ? " " + q : ""}${skeletonNote}`,
          rival: rival.name,
          kind: "buy" as const,
        },
        ...state.log,
      ],
    };
  // Konkurrensprövning (batch 5): dominansaffärer får villkor.
  const breach = competitionBreach(out);
  if (breach && !(out.divestOrders ?? []).some((o) => o.district === breach.district)) {
    const dueAbs = out.year * 12 + out.month + DIVEST_MONTHS;
    out.divestOrders = [...(out.divestOrders ?? []), { ...breach, dueAbs }];
    out.log = [
      {
        t: `⚖️ COMPETITION REVIEW: the deal gives you dominance in the district — divest down to ${breach.maxAllowed} completed properties there within ${DIVEST_MONTHS} months or face fines.`,
        kind: "warn" as const,
      },
      ...out.log,
    ];
  }
  return { state: out };
}

/* ── Underrättelser & due diligence (M&A 2.0, batch 2) ─────────────
   Vad köper du egentligen? Investmentbanken säljer överblick, DD säljer
   sanning – och den som hoppar över DD riskerar lik i garderoben. */

/** Investmentbankens månadsarvode. */
export const MA_ADVISOR_FEE = 250_000;
/** DD-kostnad: andel av målets substansvärde (med golv). */
export const DD_COST_SHARE = 0.005;
export const DD_COST_FLOOR = 500_000;
/** DD tar två månader. */
export const DD_MONTHS = 2;
/** Risk för lik i garderoben vid förvärv UTAN genomförd DD. */
export const SKELETON_RISK = 0.25;
/** Osäkerhetsintervall på värderingen utan DD (±10 %). */
export const VALUATION_UNCERTAINTY = 0.10;

export function ddCostFor(s: GameState, comp: Competitor): number {
  const val = acquisitionValuation(s, comp);
  return Math.max(DD_COST_FLOOR, Math.round(Math.abs(val.nav) * DD_COST_SHARE));
}

export function ddDoneFor(s: GameState, name: string): boolean {
  return (s.ddDone ?? []).includes(name);
}

/* ── Fientliga uppköp via börsen (M&A 2.0, batch 3) ────────────────
   När ägaren säger nej finns aktieägarna. Smygköp pressar styrelsen,
   30 % utlöser budplikt, och ett fientligt bud möts av försvar:
   vit riddare (allierad rival), återköp – eller kapitulation. */

/** Ägarandel som utlöser budplikt. */
export const MANDATORY_BID_THRESHOLD = 0.30;
/** Budplikt: du får sälja ned dig till denna nivå i stället (5 % rabatt). */
export const SELL_DOWN_TO = 0.25;
export const SELL_DOWN_DISCOUNT = 0.95;
/** Fientligt bud kräver denna premie mot börsvärdet. */
export const HOSTILE_PREMIUM = 1.25;
/** Månader en rivals motbud på ditt förhandlingsmål står innan ägaren väljer rivalen. */
export const RIVAL_BID_GRACE_MONTHS = 2;

export function marketCapOf(s: GameState, rivalName: string): number {
  const stock = s.stocks.find((x) => x.competitorName === rivalName);
  return stock ? Math.round(stock.price * stock.sharesOutstanding) : 0;
}

export type HostileOutcome =
  | { kind: "white_knight"; ally: string }
  | { kind: "buyback"; newFloor: number }
  | { kind: "capitulate" };

/** Styrelsens försvar mot ett fientligt bud. Deterministisk kaskad:
 *  1) en allierad rival med kassa kliver in som vit riddare,
 *  2) aggressiva ledningar köper tillbaka aktier och höjer golvet,
 *  3) annars kapitulerar styrelsen. */
export function hostileDefense(s: GameState, target: Competitor, offer: number): HostileOutcome {
  const allies = (s.rivalRelations ?? [])
    .filter((r) => r.kind === "alliance" && (r.a === target.name || r.b === target.name))
    .map((r) => (r.a === target.name ? r.b : r.a))
    .map((n) => s.competitors.find((c) => c.name === n))
    .filter((c): c is Competitor => !!c && c.cash >= offer * 0.4);
  if (allies.length > 0) {
    const ally = allies.sort((a, b) => b.cash - a.cash)[0];
    return { kind: "white_knight", ally: ally.name };
  }
  if (aggressionOf(target.name) >= 0.6) {
    const cap = marketCapOf(s, target.name);
    const newFloor = Math.round(cap * 1.15 * HOSTILE_PREMIUM);
    if (offer < newFloor) return { kind: "buyback", newFloor };
  }
  return { kind: "capitulate" };
}

/* ── Partiella affärer & konkurrensvakten (M&A 2.0, batch 5) ───────
   Alla affärer är inte hela bolag: köp en rivals distriktsdivision i
   ett paket, byt hus med varandra, eller sälj ett eget distriktspaket
   som bolag. Och när en affär ger dominans kliver myndigheten in. */

/** Paketpremie vid divisionsköp (en förhandling i stället för N). */
export const DIVISION_PREMIUM = 1.05;
/** Paketförsäljningens prisfaktor per konjunkturfas. */
export const PACKAGE_PHASE_MULT = { boom: 1.05, stable: 0.97, bust: 0.85 } as const;
/** Minsta paket för bolagsförsäljning. */
export const PACKAGE_MIN_PROPS = 3;
/** Dominanströsklar som utlöser konkurrensprövning. */
export const DOMINANCE_DISTRICT_SHARE = 0.45;
export const DOMINANCE_CITY_SHARE = 0.35;
/** Månader att uppfylla ett avyttringskrav – därefter vite. */
export const DIVEST_MONTHS = 6;
/** Vite: andel av eget kapital per försutten frist. */
export const DIVEST_FINE_SHARE = 0.02;

/** Priset för en rivals hela distriktsbestånd (marknadsvärde + premie). */
export function divisionPrice(s: GameState, comp: Competitor, district: string): number {
  const props = (comp.portfolio ?? []).filter((p) => p.district === district);
  return Math.round(props.reduce((a, p) => a + propMarketValue(p, s), 0) * DIVISION_PREMIUM);
}

/** Byteshandelns acceptregel: distriktsbolag vill ha SIN stadsdel, andra
 *  kräver en varm relation. Deterministisk – värdeskillnaden regleras
 *  alltid kontant, så det som avgör är strategisk passform. */
export function swapAccepted(s: GameState, comp: Competitor, myDistrict: string): boolean {
  if (comp.strategy === "distrikt" && comp.preferredDistrict === myDistrict) return true;
  return rivalStanding(s, comp.name) >= 20;
}

/** Spelarens BEHÅLLNA ägarandel i ett PropCo (1 om huset inte är avknoppat). */
function retainedStake(s: GameState, spinOffId: string | undefined): number {
  if (!spinOffId) return 1;
  const spin = (s.spinOffs ?? []).find((x) => x.id === spinOffId);
  if (!spin) return 1;
  const st = s.stocks.find((x) => x.id === spin.stockId);
  if (!st || st.sharesOutstanding <= 0) return 1;
  return Math.max(0, Math.min(1, st.owned / st.sharesOutstanding));
}

/** Spelarens andel av ett distrikts totala bestånd (färdiga hus).
 *  Avknoppade hus (PropCo) räknas bara efter den ägarandel du BEHÅLLER –
 *  floatar du ut en majoritet sjunker din räknade dominans, så avknoppning
 *  blir ett lagligt sätt att möta konkurrensvillkoren utan brandförsäljning.
 *  Husen finns kvar i distriktet, så de räknas fullt i nämnaren. */
export function districtShareAfter(s: GameState, district: string): { share: number; mine: number; total: number } {
  const myBuildings = s.portfolio.filter((p) => p.district === district && p.status === "klar");
  const mine = myBuildings.reduce((a, p) => a + retainedStake(s, p.spinOffId), 0);
  const rivals = s.competitors.reduce(
    (a, c) => a + (c.portfolio ?? []).filter((p) => p.district === district).length,
    0,
  );
  const listings = s.listings.filter((p) => p.district === district && p.status === "klar").length;
  const total = myBuildings.length + rivals + listings;
  return { share: total > 0 ? mine / total : 0, mine, total };
}

/** Konkurrensprövning efter en affär: bryter något distrikt dominans-
 *  tröskeln (med meningsfull marknad, ≥ 6 hus) krävs avyttring. */
export function competitionBreach(s: GameState): { district: string; maxAllowed: number } | null {
  const seen = new Set<string>();
  for (const p of s.portfolio) {
    if (p.status !== "klar" || seen.has(p.district)) continue;
    seen.add(p.district);
    const d = districtShareAfter(s, p.district);
    if (d.total >= 6 && d.share > DOMINANCE_DISTRICT_SHARE) {
      return { district: p.district, maxAllowed: Math.floor(d.total * DOMINANCE_DISTRICT_SHARE) };
    }
  }
  return null;
}

/** Rivalfusioner prövas också (tunna delar 5/7): myndigheten blockerar en
 *  fusion som ger det sammanslagna bolaget flagrant dominans (> 55 %) i ett
 *  distrikt. Tröskeln är högre än spelarens – myndigheten synar hårdast den
 *  störste – men rena monopol stoppas oavsett vem. Returnerar distriktet. */
export const RIVAL_MERGER_BLOCK_SHARE = 0.55;
export function rivalMergerBlocked(s: GameState, buyer: Competitor, target: Competitor): string | null {
  const combined = new Map<string, number>();
  for (const p of [...(buyer.portfolio ?? []), ...(target.portfolio ?? [])]) {
    combined.set(p.district, (combined.get(p.district) ?? 0) + 1);
  }
  for (const [district, mergedCount] of combined) {
    const playerHere = s.portfolio.filter((p) => p.district === district && p.status === "klar").length;
    const otherRivals = s.competitors
      .filter((c) => c.name !== buyer.name && c.name !== target.name)
      .reduce((a, c) => a + (c.portfolio ?? []).filter((p) => p.district === district).length, 0);
    const listings = s.listings.filter((p) => p.district === district && p.status === "klar").length;
    const total = mergedCount + playerHere + otherRivals + listings;
    if (total >= 6 && mergedCount / total > RIVAL_MERGER_BLOCK_SHARE) return district;
  }
  return null;
}
