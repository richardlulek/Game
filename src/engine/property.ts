/* ============================================================
   Fastighetsekonomi – rena, deterministiska funktioner.
   Formlerna är oförändrade från prototypen.
   ============================================================ */

import { BLOCK_OPEX_CUT, BLOCK_RENT_BONUS, blockConditionMult, hasBlockBonus } from "./blocks";
import { locationFactor } from "./city";
import { cityEventOpexMult, cityEventShopMult } from "./cityEvents";
import { rateValueFactor } from "./economyLife";
import { obsolescenceFactor } from "./lifecycle";
import { accessRentMult, accessValueMult } from "./infrastructure";
import { DISTRICTS, PROP_TYPES } from "./data";
import {
  REGULATED_RENT,
  SINGLE_TENANT_OPEX_CUT,
  SINGLE_TENANT_RENT_BONUS,
  blockMixFor,
} from "./leasing";
import { opexMult, vacancyMult } from "./progression";
import { energySynergyMult } from "./industries";
import type { GameState, PendingWork, PendingWorkKind, Property } from "./types";

/** Områdesutvecklingsfaktor – stiger när distriktet bebyggs (1.0 = neutral). */
export function districtDevOf(state: GameState, district: string): number {
  return state.districtDev?.[district] ?? 1;
}

/** Pågående beställt arbete av en viss sort (ev. specifik uppgradering).
 *  Används som en-i-taget-guard i reducern och för ⏳-lägen i UI:t. */
export function pendingWork(
  p: Property,
  kind: PendingWorkKind,
  upgradeId?: string,
): PendingWork | undefined {
  return (p.pendingWorks ?? []).find(
    (w) => w.kind === kind && (!upgradeId || w.upgradeId === upgradeId),
  );
}

/* ── Avkastningsvärdering ──────────────────────────────────────────────────
   Kommersiell fastighet värderas i verkligheten på driftnettot delat med ett
   direktavkastningskrav – inte på byggnadens fysiska egenskaper. Tidigare var
   värdet här helt substansbaserat och intäkterna justerade bara ±10 %, vilket
   gjorde att en tom byggnad var nästan lika mycket värd som en fullt uthyrd.

   Nu vägs substansvärdet mot ett avkastningsvärde. Avkastningskravet FÖRANKRAS
   i objektets egen stabiliserade avkastning, så ett fullt uthyrt objekt till
   marknadshyra värderas som förut (balansneutralt) – medan vakans, över-/
   underhyra och ränteläge slår igenom på riktigt.                            */

/** Avkastningsvärderingens vikt mot substansvärdet (0 = bara substans). */
const INCOME_WEIGHT = 0.5;
/** Premie för ett fullt uthyrt objekt till marknadshyra, mot substansvärdet.
 *  Samma nivå som den gamla beläggningspremien, så att ett stabiliserat
 *  bestånd värderas oförändrat och spelbalansen inte flyttas – det är bara
 *  AVVIKELSER från stabiliserat läge som nu får rätt genomslag. */
const FULL_LET_PREMIUM = 0.10;
/** År av uteblivet driftnetto som dras av för att fylla en vakans
 *  (uthyrningstid + rabatter) – motsvarar värderarens vakansavdrag. */
const VOID_YEARS = 2.5;
/** År som en hyra ÖVER marknadsnivå får kapitaliseras (till omförhandling). */
const TERM_YEARS = 3;
/** Riskpåslag på avkastningskravet vid full vakans (tomt = osäkrare kassaflöde). */
const VACANCY_RISK = 0.22;
/** Riskpåslag vid uselt skick (skalar mot skick 100). */
const CONDITION_RISK = 0.12;
/** Golv för avkastningsvärdet, som andel av substansvärdet. Även en tom,
 *  sliten byggnad har ett värde i sig (mark + stomme) – och golvet gör
 *  modellen robust mot objekt vars hyra är orimlig i förhållande till
 *  substansen, som annars skulle kollapsa i värde. */
const INCOME_FLOOR = 0.6;

/** Direktavkastningskrav för ett objekt: förankrat i dess egen stabiliserade
 *  avkastning, plus riskpåslag för vakans och skick. Räntans effekt ligger
 *  redan i substansvärdet via rateValueFactor och dubbelräknas därför inte. */
function capRateFor(p: Property, state: GameState, assetValue: number, stabilisedNOI: number): number {
  const implied = assetValue > 0 ? stabilisedNOI / assetValue : 0.05;
  // Kalibrering: vid full uthyrning ska den vägda värderingen landa på
  // substansvärde × (1 + FULL_LET_PREMIUM), dvs samma som före ändringen.
  const anchor = 1 + FULL_LET_PREMIUM / INCOME_WEIGHT;
  const base = Math.max(0.02, Math.min(0.15, implied / anchor));
  const occupancy = p.capacity > 0 ? p.tenants.length / p.capacity : 0;
  const vacancyRisk = VACANCY_RISK * (1 - occupancy);
  const conditionRisk = CONDITION_RISK * Math.max(0, (70 - p.condition) / 70);
  return base * (1 + vacancyRisk + conditionRisk);
}

/** Avkastningsvärde: stabiliserat driftnetto kapitaliserat, minus kostnaden
 *  att fylla vakansen (plus premie för hyra över marknadsnivå). */
export function propIncomeValue(p: Property, state: GameState, assetValue: number): number {
  const stabilisedNOI = propPotentialRent(p, state) - propAnnualOpex(p, state);
  if (stabilisedNOI <= 0) return assetValue; // olönsam typ – substansen bär värdet
  const cap = capRateFor(p, state, assetValue, stabilisedNOI);
  const capitalised = stabilisedNOI / cap;

  const actualNOI = propNOI(p, state);
  const gap = stabilisedNOI - actualNOI;
  const adj =
    gap > 0
      ? -gap * VOID_YEARS // vakans/underhyra: kostar att fylla
      : Math.min(-gap * TERM_YEARS, capitalised * 0.15); // överhyra: premie, men tak
  return Math.max(assetValue * INCOME_FLOOR, capitalised + adj);
}

/** Värdet objektet skulle ha fullt uthyrt till marknadshyra. Skillnaden mot
 *  propMarketValue är vad vakansen kostar i värde – visas i portföljkortet. */
export function propStabilisedValue(p: Property, state: GameState): number {
  if (p.capacity <= 0 || p.status !== "klar") return propMarketValue(p, state);
  const perUnit = propPotentialRent(p, state) / 12 / p.capacity;
  const template = p.tenants[0];
  const full: Property = {
    ...p,
    tenants: Array.from({ length: p.capacity }, (_, i) => ({
      id: (template?.id ?? 1) + i,
      profile: template?.profile ?? "smb",
      name: template?.name ?? "—",
      quality: template?.quality ?? 1,
      defaultRisk: template?.defaultRisk ?? 0.018,
      monthsLeft: template?.monthsLeft ?? 24,
      termTotal: template?.termTotal ?? 24,
      rent: perUnit,
    })),
  };
  return propMarketValue(full, state);
}

/** Marknadsvärde för en fastighet givet nuvarande tillstånd.
 *  Vägning av substansvärde (fysiska egenskaper, läge, skick) och
 *  avkastningsvärde (driftnetto genom avkastningskrav).
 */
export function propMarketValue(p: Property, state: GameState): number {
  const d = DISTRICTS.find((x) => x.id === p.district)!;
  const condFactor = 0.6 + (p.condition / 100) * 0.6;
  const dev = districtDevOf(state, p.district);
  // Läget på kartan (närhet till stadskärnan) slår igenom fullt på värdet.
  const loc = locationFactor(p.parcelId);
  // Räntan andas i värdet (låg ränta lyfter, hög trycker; neutral 4 %)
  // och kvarterets skick smittar (grannskapseffekt).
  const rate = rateValueFactor(state.interestRate);
  const hood = blockConditionMult(p, state);
  // Livscykel: åldrade byggnader blir omoderna och tappar i värde.
  const obs = obsolescenceFactor(p, state);
  // Infrastruktur: invigd kollektivtrafik m.m. kapitaliseras i värdet.
  const access = accessValueMult(state, p.district);
  const assetValue = p.area * d.base * condFactor * state.marketMod * d.growth * p.valueMult * dev * loc * rate * hood * obs * access;

  // Pågående bygge: halva det FÄRDIGA, stabiliserade värdet (mark + nedlagt
  // arbete). Ska inte straffas för vakans – huset har inga hyresgäster ännu.
  if (p.status === "bygger") return Math.round(assetValue * (1 + FULL_LET_PREMIUM) * 0.5);

  // Substansvärde vägt mot avkastningsvärde. Ett fullt uthyrt objekt till
  // marknadshyra landar på substansvärde × (1 + FULL_LET_PREMIUM) – samma som
  // före ändringen; vakans och hyresläge flyttar det därifrån.
  const incomeValue = propIncomeValue(p, state, assetValue);
  return Math.round(assetValue * (1 - INCOME_WEIGHT) + incomeValue * INCOME_WEIGHT);
}

/** Faktisk årshyra (summa av alla hyresgästers kontraktshyra, vakant = 0). */
export function propAnnualRent(p: Property, _state: GameState): number {
  if (p.status === "bygger") return 0;
  if (p.tenants.length > 0) return p.tenants.reduce((s, t) => s + t.rent * 12, 0);
  return 0;
}

/** Marknadspotential för hyra om lokalen vore uthyrd. */
export function propPotentialRent(p: Property, state: GameState): number {
  const t = PROP_TYPES[p.type];
  const d = DISTRICTS.find((x) => x.id === p.district)!;

  // Klusterbonus: fler ägda fastigheter i samma distrikt ger hyresboost och lägre vakans
  const ownedInDistrict = state.portfolio.filter(
    (x) => x.district === p.district && x.status === "klar",
  ).length;
  const clusterRentMult = ownedInDistrict >= 5 ? 1.10 : ownedInDistrict >= 3 ? 1.05 : 1;
  const clusterVacMult  = ownedInDistrict >= 5 ? 0.85 : ownedInDistrict >= 3 ? 0.90 : 1;

  // Logistiksynergi: logistiktillgångar i samma distrikt höjer industrifastigheters hyra
  const logistikInDistrict = (state.industryPortfolio ?? []).filter(
    (a) => a.sector === "logistik" && a.district === p.district && a.status === "klar",
  ).length;
  const logistikBonus = p.type === "industri" ? 1 + logistikInDistrict * 0.03 : 1.0;

  // Turistsynergi: egna hotell i distriktet driver gästflöden till butikerna –
  // +1 % potentialhyra per hotellstjärna, max +8 %.
  const hotelStars = (state.industryPortfolio ?? []).reduce(
    (a, x) =>
      a +
      (x.sector === "hotell" && x.district === p.district && x.status === "klar"
        ? x.hotelMeta?.starRating ?? 0
        : 0),
    0,
  );
  const hotellBonus = p.type === "butik" ? 1 + Math.min(0.08, hotelStars * 0.01) : 1.0;
  // Stadshändelser: mässor och festivaler fyller butikerna.
  const eventBonus = p.type === "butik" ? cityEventShopMult(state) : 1.0;

  // Områdesutveckling lyfter hyran (halv effekt mot värdet).
  const devRent = 1 + (districtDevOf(state, p.district) - 1) * 0.5;
  // Läget på kartan påverkar hyran med halv effekt mot värdet.
  const locRent = 1 + (locationFactor(p.parcelId) - 1) * 0.5;
  // Helkvartersbonus: hela kvarteret i bolagets ägo ⇒ samordnad drift.
  const blockRent = hasBlockBonus(p, state) ? BLOCK_RENT_BONUS : 1;
  // Single-tenant-premie: EN stor lokal betalar mer per m² (U-lokalanpassning).
  const single = p.capacity === 1 && !p.wholeBlock ? SINGLE_TENANT_RENT_BONUS : 1;
  // Kvartersmix (U4): rätt grannar lyfter hyran.
  const mix = p.owned ? blockMixFor(p, state).rentMult : 1;
  // Bostadskön (U6): reglerad hyra −20 %, men noll vakans.
  const reg = p.regulated ? REGULATED_RENT : 1;
  // Grannskapseffekt: kvarterets skick smittar hyran med halv effekt.
  const hoodRent = 1 + (blockConditionMult(p, state) - 1) * 0.5;
  // Livscykel: åldrade byggnader tappar i hyra (halv effekt mot värdet).
  const obsRent = 1 + (obsolescenceFactor(p, state) - 1) * 0.5;
  // Infrastruktur: tillgängligheten lyfter läget (infrastructure.ts).
  const accessRent = accessRentMult(state, p.district);
  const gross = p.baseRent * p.rentMult * state.demandMod * d.demand * 1.2 * clusterRentMult * devRent * locRent * logistikBonus * hotellBonus * eventBonus * blockRent * single * mix * reg * hoodRent * obsRent * accessRent;
  const vacancy = p.regulated
    ? 0
    : Math.max(
        0,
        t.vacancyBase * p.vacancyMult * clusterVacMult * vacancyMult(state) - (p.condition - 60) / 1000,
      );
  return gross * (1 - vacancy);
}

/** Årlig driftkostnad. Helägda kvarter driftas samordnat (−15 %),
 *  en enda stor hyresgäst ger lägre administration (−5 %). */
export function propAnnualOpex(p: Property, state: GameState): number {
  if (p.status === "bygger") return 0;
  const t = PROP_TYPES[p.type];
  const block = hasBlockBonus(p, state) ? BLOCK_OPEX_CUT : 1;
  const single = p.capacity === 1 && !p.wholeBlock ? SINGLE_TENANT_OPEX_CUT : 1;
  return p.baseRent * t.opexFactor * p.opexMult * state.taxMod * opexMult(state) * energySynergyMult(state) * cityEventOpexMult(state) * block * single;
}

/** Driftnetto per år (hyra − driftkostnad). */
export function propNOI(p: Property, state: GameState): number {
  return propAnnualRent(p, state) - propAnnualOpex(p, state);
}

/** Totalt investerat kapital: inköpspris (eller byggkostnad) plus
 *  ackumulerade förbättrings- och omkostnader efter förvärvet. */
export function propInvestedCost(p: Property): number {
  return (p.purchasePrice ?? p.askPrice) + (p.capexTotal ?? 0);
}

/** Yield on cost: driftnetto genom investerat kapital (inte marknadsvärde).
 *  Det är avkastningen på pengarna du faktiskt lagt in i fastigheten. */
export function propYieldOnCost(p: Property, state: GameState): number {
  const cost = propInvestedCost(p);
  return cost > 0 ? propNOI(p, state) / cost : 0;
}
