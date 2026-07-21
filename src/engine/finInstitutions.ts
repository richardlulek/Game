/* ============================================================
   Finansiella institut – ägt bankhus och försäkringsbolag
   (Capitalism Labs Banking & Finance-DLC, anpassat till nischen).

   BANKEN tar emot insättningar från staden (växer med stadens
   ekonomi) och lånar ut till stadens aktörer. Intäkten är ränte-
   marginalen på utlånad volym; risken är kreditförluster som
   exploderar i lågkonjunktur. Utlåningshållningen är spakarna:
   försiktig/balanserad/aggressiv styr utnyttjande OCH förlustrisk.
   Synergi: egen bank pressar bolagets egen låneränta.

   FÖRSÄKRINGSBOLAGET tecknar fastighetsförsäkringar i staden.
   Premienivån styr tillväxt kontra marginal (låg premie växer
   snabbt med tunn marginal). Katastrofmånader ger skadetoppar.
   Synergi: egna fastigheters försäkringspremie −40 %.

   Ren logik utan React-beroenden; simulationen anropar tick-
   funktionerna månadsvis och reducern äger köp/sälj/inställningar.
   ============================================================ */

import { rnd } from "./random";
import type { BankStance, GameState, InsurerPricing, LogEntry, OwnedBank, OwnedInsurer } from "./types";

/* ── Priser och nyckeltal ───────────────────────────────────────────── */

export const BANK_MIN_PRICE = 25_000_000;
export const INSURER_MIN_PRICE = 15_000_000;

/** Köpeskilling: skalar med bolagets storlek så köpet alltid är ett beslut.
 *  (Balansrundan: banken prissattes förr på 12 % av equity medan intjäningen
 *  satt fast vid stadens 60M-tak → ROI ~0,2 %/år. Nu skalar inlåningen med
 *  imperiet (se tickBank) och priset är 5 % → ROI ~5–13 % beroende på
 *  hållning och konjunktur.) */
export function bankPurchasePrice(equity: number): number {
  return Math.max(BANK_MIN_PRICE, Math.round(equity * 0.05));
}
export function insurerPurchasePrice(equity: number): number {
  return Math.max(INSURER_MIN_PRICE, Math.round(equity * 0.08));
}

const STANCE_UTIL: Record<BankStance, number> = { försiktig: 0.5, balanserad: 0.65, aggressiv: 0.8 };
const STANCE_SPREAD: Record<BankStance, number> = { försiktig: 1.8, balanserad: 2.2, aggressiv: 2.8 };
/** Månatlig kreditförlust i % av utlånat, per hållning – normalläge. */
const STANCE_LOSS: Record<BankStance, number> = { försiktig: 0.02, balanserad: 0.05, aggressiv: 0.12 };

const PRICING_GROWTH: Record<InsurerPricing, number> = { låg: 0.08, marknad: 0.045, hög: 0.008 };
const PRICING_PREMIUM: Record<InsurerPricing, number> = { låg: 0.8, marknad: 1.0, hög: 1.28 };
/** Skadekvot (andel av premier som går till skador) per prisnivå. */
const PRICING_LOSS_RATIO: Record<InsurerPricing, number> = { låg: 0.82, marknad: 0.70, hög: 0.55 };
/** Kundtapp per månad: höga premier eroderar boken mot en liten, fet nisch.
 *  (Balansrundan: "hög" dominerade förr – 30 %/år utan nackdel.) */
const PRICING_CHURN: Record<InsurerPricing, number> = { låg: 0, marknad: 0.002, hög: 0.015 };

const PREMIUM_PER_POLICY = 4_200; // kr/mån vid marknadspris

/* ── Värdering (ingår i eget kapital) ───────────────────────────────── */

export function bankValue(bank: OwnedBank, state: GameState): number {
  const annualNet = bankMonthlyNet(bank, state) * 12;
  // Kapital + insättningsbas + kapitaliserad intjäning (P/E ~7).
  return Math.max(0, Math.round(bankCapitalOf(bank) + bank.deposits * 0.1 + Math.max(0, annualNet) * 7));
}

export function insurerValue(ins: OwnedInsurer, state: GameState): number {
  const annualNet = insurerMonthlyNet(ins, state) * 12;
  return Math.max(0, Math.round(ins.policies * 3_000 + Math.max(0, annualNet) * 9));
}

export function finInstitutionsValue(state: GameState): number {
  return (
    (state.ownedBank ? bankValue(state.ownedBank, state) : 0) +
    (state.ownedInsurer ? insurerValue(state.ownedInsurer, state) : 0)
  );
}

/* ── Bankens månad ──────────────────────────────────────────────────── */

/** Förväntat netto i nuläget (utan slump) – för UI och värdering. */
export function bankMonthlyNet(bank: OwnedBank, state: GameState): number {
  const lendRate = state.interestRate + STANCE_SPREAD[bank.stance];
  const depositRate = state.interestRate * 0.5;
  const margin = (lendRate - depositRate) / 100;
  const opex = 40_000 + bank.deposits * 0.0004;
  const cross = state.ownedInsurer ? CROSS_SELL_BOOST : 1;
  return Math.round((bank.loansOut * margin * cross) / 12 - opex);
}

/** Månadstick: insättningar följer stadens ekonomi, utlåning följer
 *  hållningen, marginalen bokas och kreditförluster dras. Muterar inte –
 *  returnerar ny bank + kassaflödesnetto + händelser. */
export function tickBank(
  bank: OwnedBank,
  state: GameState,
): { bank: OwnedBank; net: number; events: LogEntry[] } {
  const events: LogEntry[] = [];
  const phase = state.marketCycle?.phase ?? "stable";
  // Insättningsbasen: stadens välstånd (marknadsnivå + rivalernas ekonomi)
  // PLUS ägarimperiets tyngd – en bank i en stor koncern drar stora
  // inlåningsvolymer. Utan equity-termen fastnade banken vid stadens
  // 60M-tak medan köpeskillingen växte med spelaren (ROI ~0).
  const empire = Math.max(0, state.prevEquity ?? 0) * 0.15;
  // Inlåningskampanj: högre mål och snabbare inflöde medan den pågår.
  const campaign = (bank.campaignMonthsLeft ?? 0) > 0;
  const cityScale =
    (60_000_000 + empire) * state.marketMod * (1 + state.competitors.length * 0.08) *
    (phase === "boom" ? 1.1 : phase === "bust" ? 0.92 : 1) *
    (campaign ? DEPOSIT_CAMPAIGN_BOOST : 1);
  const converge = campaign ? 0.09 : 0.05;
  const deposits = Math.round(bank.deposits + (cityScale - bank.deposits) * converge + rnd(-0.01, 0.01) * bank.deposits);
  // Kapitalkravet: räcker inte kapitalet till full utlåning stryps den –
  // banken kan inte växa fortare än ägaren kapitaliserar den.
  const capital = bankCapitalOf(bank);
  const fullLoans = deposits * STANCE_UTIL[bank.stance];
  const capitalOK = capital >= fullLoans * BANK_CAPITAL_FLOOR;
  const loansOut = Math.round(fullLoans * (capitalOK ? 1 : 0.75));
  if (!capitalOK && rnd(0, 1) < 0.12) {
    events.push({
      t: `🏦 ${bank.name}: the capital ratio is below ${Math.round(BANK_CAPITAL_FLOOR * 100)}% — lending is throttled to 75% until the owner injects capital.`,
      kind: "warn",
    });
  }
  const nb: OwnedBank = {
    ...bank,
    deposits: Math.max(5_000_000, deposits),
    loansOut,
    capital,
    campaignMonthsLeft: campaign ? (bank.campaignMonthsLeft ?? 0) - 1 : undefined,
  };

  let net = bankMonthlyNet(nb, state);
  // Kreditförluster: hållningen sätter basrisken; bust dubblar, kris × 3,5.
  const crisis = (state.crisisMonthsLeft ?? 0) > 0;
  const lossMult = crisis ? 3.5 : phase === "bust" ? 2 : 1;
  const lossPct = (STANCE_LOSS[nb.stance] / 100) * lossMult;
  const losses = Math.round(nb.loansOut * lossPct * rnd(0.6, 1.4));
  if (losses > 0) {
    net -= losses;
    if (lossMult > 1)
      events.push({
        t: `🏦 ${nb.name}: credit losses of ${Math.round(losses / 1000)}k in the downturn (${nb.stance} lending).`,
        kind: "expense",
      });
  }
  return { bank: nb, net, events };
}

/* ── Försäkringsbolagets månad ──────────────────────────────────────── */

/** Hyresgarantins premie per försäkring och skadekvot per konjunkturläge:
 *  fin marginal i stabilt läge, blöder rejält i bust/kris – en medvetet
 *  kontracyklisk risk mot fastighetsboken. */
export const RENT_GUARANTEE_PREMIUM = 900;
export function rentGuaranteeClaimRatio(state: GameState): number {
  if ((state.crisisMonthsLeft ?? 0) > 0) return 2.2;
  if ((state.recessionMonthsLeft ?? 0) > 0) return 1.8;
  if (state.marketCycle?.phase === "bust") return 1.6;
  return 0.45;
}

export function insurerMonthlyNet(ins: OwnedInsurer, state: GameState): number {
  const cross = state.ownedBank ? CROSS_SELL_BOOST : 1;
  const premiums = ins.policies * PREMIUM_PER_POLICY * PRICING_PREMIUM[ins.pricing] * cross;
  const expectedClaims = premiums * PRICING_LOSS_RATIO[ins.pricing];
  // Hyresgarantiprodukten: extra premier, men skadekvoten följer
  // konjunkturen och passerar 100 % i nedgång.
  const gPrem = ins.rentGuarantee ? ins.policies * RENT_GUARANTEE_PREMIUM * cross : 0;
  const gClaims = gPrem * rentGuaranteeClaimRatio(state);
  const opex = 40_000 + ins.policies * 350;
  // Återförsäkring: en fast andel av premierna avstås (skadetopparna
  // dämpas i stället i tickInsurer).
  const ceded = ins.reinsured ? (premiums + gPrem) * REINSURANCE_CEDE : 0;
  return Math.round(premiums + gPrem - expectedClaims - gClaims - opex - ceded);
}

export function tickInsurer(
  ins: OwnedInsurer,
  state: GameState,
): { insurer: OwnedInsurer; net: number; events: LogEntry[] } {
  const events: LogEntry[] = [];
  // Marknaden: stadens fastighetsstock sätter taket på antalet försäkringar.
  const cityStock =
    state.portfolio.length +
    state.competitors.reduce((a, c) => a + (c.portfolio ?? []).length, 0) +
    state.listings.length;
  const capacity = Math.max(120, cityStock * 9); // ~9 försäkringsbara enheter per hus
  const growth = PRICING_GROWTH[ins.pricing];
  // Nyteckning mot taket minus prisdrivet kundtapp: hög premie hittar
  // jämvikt i en liten, lönsam nisch i stället för att äga hela boken.
  const churned = ins.policies * (1 - PRICING_CHURN[ins.pricing]);
  const policies = Math.round(
    Math.min(capacity, churned + (capacity - churned) * growth * rnd(0.7, 1.3)),
  );
  const ni: OwnedInsurer = { ...ins, policies: Math.max(40, policies) };

  let net = insurerMonthlyNet(ni, state);
  // Katastrofmånad: ~2,5 % chans (mer i kris) → skadetopp.
  const crisis = (state.crisisMonthsLeft ?? 0) > 0;
  if (rnd(0, 1) < (crisis ? 0.06 : 0.025)) {
    const spikeMult = ni.reinsured ? REINSURANCE_SPIKE_MULT : 1;
    const spike = Math.round(ni.policies * 2_400 * rnd(0.7, 1.5) * spikeMult);
    net -= spike;
    events.push({
      t: `🌊 ${ni.name}: a claims spike hits the book — ${Math.round(spike / 1_000_000 * 10) / 10}M paid out to policyholders.`,
      kind: "expense",
    });
  }
  return { insurer: ni, net, events };
}

/** Förväntad månadstakt inkl. normala kreditförluster (för bokslutet).
 *  bankMonthlyNet är brutto före förluster; här dras basrisken av så
 *  resultaträkningens rad speglar vad en typisk månad faktiskt ger. */
export function bankRunRate(bank: OwnedBank, state: GameState): number {
  return Math.round(bankMonthlyNet(bank, state) - bank.loansOut * (STANCE_LOSS[bank.stance] / 100));
}

/* ── Finanskoncernen: korsförsäljning ───────────────────────────────── */

/** Äger koncernen BÅDE bank och försäkringsbolag korsförsäljs kunderna:
 *  +6 % på bankens räntenetto och försäkringspremierna. */
export const CROSS_SELL_BOOST = 1.06;

/* ── Bankkapital ────────────────────────────────────────────────────── */

/** Kapitalrelationens golv: kapital ≥ 8 % av utlåningen, annars stryps
 *  utlåningen till 75 % tills ägaren injicerar mer kapital. */
export const BANK_CAPITAL_FLOOR = 0.08;

/** Bankens kapital (äldre sparfiler saknar fältet → 8 % av inlåningen). */
export function bankCapitalOf(bank: OwnedBank): number {
  return bank.capital ?? Math.round(bank.deposits * BANK_CAPITAL_FLOOR);
}

/** Kapitalkravet vid nuvarande utlåningsambition. */
export function bankRequiredCapital(bank: OwnedBank): number {
  return Math.round(bank.deposits * STANCE_UTIL[bank.stance] * BANK_CAPITAL_FLOOR);
}

/* ── Inlåningskampanj (banken) ──────────────────────────────────────── */

/** Kampanjens längd i månader och lyft på inlåningsmålet. */
export const DEPOSIT_CAMPAIGN_MONTHS = 12;
export const DEPOSIT_CAMPAIGN_BOOST = 1.25;
/** Kampanjkostnad: marknadsföring + ränteerbjudanden. */
export function depositCampaignCost(bank: OwnedBank): number {
  return Math.max(500_000, Math.round(bank.deposits * 0.015));
}

/* ── Återförsäkring (försäkringsbolaget) ────────────────────────────── */

/** Andel av premierna som avstås till återförsäkraren. */
export const REINSURANCE_CEDE = 0.12;
/** Skadetopparnas storlek med återförsäkring (60 % dämpning). */
export const REINSURANCE_SPIKE_MULT = 0.4;

/* ── Synergier ──────────────────────────────────────────────────────── */

/** Egen bank pressar bolagets egen låneränta. */
export const OWN_BANK_RATE_DELTA = -0.3;
/** Eget försäkringsbolag: egna fastigheters premier −40 %. */
export const OWN_INSURER_PREMIUM_MULT = 0.6;
