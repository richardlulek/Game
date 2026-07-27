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
import { OWN_INSURER_PREMIUM_MULT } from "./finInstitutions";
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

   Nu vägs substansvärdet mot ett avkastningsvärde: stabiliserat driftnetto
   delat med ett avkastningskrav som sätts av TILLGÅNGSSLAG och LÄGE (se
   BASE_YIELD och DISTRICT_YIELD_MULT nedan). Samma driftnetto är alltså värt
   olika mycket beroende på vad och var objektet är – precis som på riktigt –
   och vakans, över-/underhyra och skick slår igenom på värdet.               */

/** Avkastningsvärderingens vikt mot substansvärdet (0 = bara substans). */
const INCOME_WEIGHT = 0.7;
/** Andel av det färdiga värdet som ett pågående bygge är värt (mark plus
 *  nedlagt arbete). */
const BUILD_STAGE_SHARE = 0.5;
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
const INCOME_FLOOR = 0.5;
/** Tak för avkastningsvärdet. Skyddar mot att ett objekt med extrem hyra
 *  i förhållande till substansen skenar i värde. */
const INCOME_CEILING = 1.7;

/* ── Avkastningskrav per tillgångsslag ────────────────────────────────────
   Marknadens prissättning av RISK: samma driftnetto är värt olika mycket
   beroende på vad och var det är. Bostäder har den stabilaste efterfrågan
   och handlas därför på lägst avkastningskrav; industri den mest cykliska
   och specialiserade efterfrågan och därmed högst.

       bostad  <  kontor  <  butik  <  industri

   Justera nivåerna här om marknadssynen ändras – det är den enda plats
   yieldstrukturen sätts. */
const BASE_YIELD: Record<string, number> = {
  bostad: 0.0475,   // stabilast kassaflöde, djupast investerarmarknad
  kontor: 0.055,  // längre kontrakt men konjunkturkänsligt
  butik: 0.0605,   // omsättningsberoende hyresgäster, strukturell risk
  industri: 0.0685, // cykliskt, specialiserade lokaler, tunnare andrahandsmarknad
};
const DEFAULT_YIELD = 0.0575;

/* Områdesrisk: läget prissätts som ett påslag/avdrag på avkastningskravet.
   Ett A-läge betalas med lägre yield, ett osäkert läge kräver högre – det
   gäller ALLA tillgångsslag, även bostäder. */
const DISTRICT_YIELD_MULT: Record<string, number> = {
  finans: 0.92,    // A-läge, djupast marknad
  centrum: 0.95,   // etablerat city
  kulle: 0.98,     // attraktivt bostadsläge
  innerstad: 1.0,  // referensläge
  hamnen: 1.06,    // omvandlingsområde – högre osäkerhet
  förort: 1.08,    // tunnare hyresmarknad
  industri: 1.15,  // smalast köparkrets
};

/** Direktavkastningskrav för ett objekt: marknadens krav för tillgångsslaget
 *  och läget, plus riskpåslag för vakans och eftersatt skick. Räntans effekt
 *  ligger redan i substansvärdet via rateValueFactor och dubbelräknas inte. */
function capRateFor(p: Property, state: GameState): number {
  const base = BASE_YIELD[p.type] ?? DEFAULT_YIELD;
  const district = DISTRICT_YIELD_MULT[p.district] ?? 1;
  // Områdesutveckling: ett distrikt som lyfts prissätts som ett bättre läge.
  const dev = districtDevOf(state, p.district);
  const devAdj = 1 / Math.max(0.85, Math.min(1.2, dev));
  const occupancy = p.capacity > 0 ? p.tenants.length / p.capacity : 0;
  const vacancyRisk = VACANCY_RISK * (1 - occupancy);
  const conditionRisk = CONDITION_RISK * Math.max(0, (70 - p.condition) / 70);
  return base * district * devAdj * (1 + vacancyRisk + conditionRisk);
}

/** Avkastningskravet för ett objekt – exponerat för UI och tester. */
export function propCapRate(p: Property, state: GameState): number {
  return capRateFor(p, state);
}

/** Avkastningsvärde: stabiliserat driftnetto kapitaliserat, minus kostnaden
 *  att fylla vakansen (plus premie för hyra över marknadsnivå).
 *  `asStabilised` värderar objektet som fullt uthyrt till marknadshyra – används
 *  för pågående byggen och för att visa vad vakansen kostar. */
export function propIncomeValue(
  p: Property,
  state: GameState,
  assetValue: number,
  asStabilised = false,
): number {
  const stabilisedNOI = propPotentialRent(p, state) - propAnnualOpex(p, state);
  if (stabilisedNOI <= 0) return assetValue; // olönsam typ – substansen bär värdet
  const forCap = asStabilised
    ? { ...p, tenants: Array.from({ length: Math.max(1, p.capacity) }, () => p.tenants[0] ?? null) }
    : p;
  const capitalised = stabilisedNOI / capRateFor(forCap as Property, state);

  const actualNOI = asStabilised ? stabilisedNOI : propNOI(p, state);
  const gap = stabilisedNOI - actualNOI;
  const adj =
    gap > 0
      ? -gap * VOID_YEARS // vakans/underhyra: kostar att fylla
      : Math.min(-gap * TERM_YEARS, capitalised * 0.15); // överhyra: premie, men tak
  return Math.max(
    assetValue * INCOME_FLOOR,
    Math.min(assetValue * INCOME_CEILING, capitalised + adj),
  );
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

/* ── Försäkringspremien ────────────────────────────────────────────
   0,40 % av marknadsvärdet per år, med ett golv på 2 000 kr/mån. Golvet
   biter bara under ~6 MSEK i värde – ovanför det är premien värdebaserad,
   och ett hus på 46 MSEK kostar drygt 15 000 kr i månaden.

   Ligger här, inte inne i simulationen, för att panelerna ska kunna visa
   samma siffra som faktiskt debiteras. Tidigare stod "$2,000/mo" hårdkodat
   i både fastighetskortet och kvittot i loggen – för de flesta hus en
   underskattning på flera gånger pengarna. */
export const INSURANCE_RATE = 0.004;
export const INSURANCE_FLOOR = 2_000;

/** Månadspremien för ETT hus, inklusive rabatten om bolaget äger ett eget
 *  försäkringsbolag (det tecknar de egna husen till självkostnad). */
export function propInsurancePremium(p: Property, state: GameState): number {
  const base = Math.max(INSURANCE_FLOOR, Math.round((propMarketValue(p, state) * INSURANCE_RATE) / 12));
  return Math.round(base * (state.ownedInsurer ? OWN_INSURER_PREMIUM_MULT : 1));
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

  // Pågående bygge: halva det FÄRDIGA värdet (mark + nedlagt arbete). Räknas
  // som om huset stod uthyrt – det ska inte straffas för en vakans som ännu
  // inte kan fyllas. BUILD_STAGE_SHARE = andelen av färdigvärdet.
  const finished = p.status === "bygger" ? { ...p, status: "klar" as const } : p;
  const incomeValue = propIncomeValue(finished, state, assetValue, p.status === "bygger");
  const blended = assetValue * (1 - INCOME_WEIGHT) + incomeValue * INCOME_WEIGHT;
  return Math.round(p.status === "bygger" ? blended * BUILD_STAGE_SHARE : blended);
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
