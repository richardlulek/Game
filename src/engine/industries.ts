/* ============================================================
   Industrisektorer – rena, deterministiska formler.
   Hotell (RevPAR), Förnybar energi (spot+PPA), Logistik (throughput).
   Inga React-beroenden.
   ============================================================ */

import { INDUSTRY_UPGRADES, HOTEL_BOOKING_CHANNELS } from "./industryData";
import { hotelRevParBoost, energySpotBoost, logisticsThroughputBoost } from "./progression";
import type {
  GameState,
  IndustryAsset,
  LogEntry,
  HotelMeta,
  EnergyMeta,
  LogisticsMeta,
} from "./types";
import { kr } from "./format";

// ── Gemensamma hjälpare ────────────────────────────────────────────────────

/** Skickfaktor (0,6–1,2) – identisk med propMarketValue. */
function condFactor(condition: number): number {
  return 0.6 + (condition / 100) * 0.6;
}

/** Säsongsfaktor för hotell och energi. */
function seasonFactor(month: number, sectorType: "hotell" | "spot"): number {
  if (sectorType === "hotell") {
    if (month >= 6 && month <= 8) return 1.22;  // sommar
    if (month === 12 || month <= 2) return 0.82; // vinter
    return 1.0;
  }
  // Elpris: vinter högt, sommar lågt
  if (month === 12 || month <= 2) return 1.35;
  if (month >= 6 && month <= 8)   return 0.78;
  return 1.0;
}

/** Summa av revenueBoost för applicerade uppgraderingar. */
function upgRevBoost(asset: IndustryAsset): number {
  let boost = 0;
  for (const upg of INDUSTRY_UPGRADES) {
    if (asset.upgrades.includes(upg.id) && upg.revenueBoost) boost += upg.revenueBoost;
  }
  return boost;
}

/** Summa av opexCut för applicerade uppgraderingar. */
function upgOpexCut(asset: IndustryAsset): number {
  let cut = 0;
  for (const upg of INDUSTRY_UPGRADES) {
    if (asset.upgrades.includes(upg.id) && upg.opexCut) cut += upg.opexCut;
  }
  return cut;
}

// ── Hotell ─────────────────────────────────────────────────────────────────

const STAR_ADR_MULT  = [1.0, 1.2, 1.5, 1.9, 2.6]; // index = starRating - 1
const STAR_CAP_RATE  = [0.085, 0.075, 0.065, 0.055, 0.045]; // cap-rate per stjärnnivå

export function hotelMonthlyRevenue(asset: IndustryAsset, state: GameState): number {
  const meta = asset.hotelMeta;
  if (!meta) return 0;

  const star = meta.starRating;
  const starMult = STAR_ADR_MULT[star - 1];
  const baseOcc = 0.45 + (star - 1) * 0.06;
  const sf = seasonFactor(state.month, "hotell");
  const cf = condFactor(asset.condition);

  // ADR med kanalmix och uppgraderingsboost
  let adrMult = starMult * sf * cf;
  let occBonus = 0;
  for (const chanId of meta.bookingChannels) {
    const ch = HOTEL_BOOKING_CHANNELS.find((c) => c.id === chanId);
    if (ch) {
      adrMult *= ch.adrEffect;
      occBonus += ch.occBonus;
    }
  }
  adrMult *= 1 + upgRevBoost(asset);
  adrMult *= hotelRevParBoost(state);

  const adr = meta.baseAdr * adrMult;

  // OCC
  const occ = Math.min(
    0.98,
    Math.max(0.25, (baseOcc + occBonus) * state.demandMod * sf * cf),
  );

  const revpar = adr * occ;
  return Math.round(revpar * meta.totalRooms * 30.5);
}

export function hotelMonthlyOpex(asset: IndustryAsset, state: GameState): number {
  const meta = asset.hotelMeta;
  if (!meta) return 0;
  const baseOpex = meta.totalRooms * 3_500; // 3 500 kr/rum/mån
  const cut = upgOpexCut(asset);
  const energySyn = energySynergyMult(state);
  return Math.round(baseOpex * (1 - cut) * energySyn);
}

export function hotelMarketValue(asset: IndustryAsset, state: GameState): number {
  if (asset.status === "bygger") return Math.round(asset.purchasePrice * 0.5);
  const meta = asset.hotelMeta;
  if (!meta) return asset.purchasePrice;
  const star = meta.starRating;
  const capRate = STAR_CAP_RATE[star - 1];
  const annualNOI = (hotelMonthlyRevenue(asset, state) - hotelMonthlyOpex(asset, state)) * 12;
  return Math.max(asset.purchasePrice * 0.4, Math.round(annualNOI / capRate));
}

export function tickHotel(asset: IndustryAsset, state: GameState): [number, number, LogEntry[]] {
  const events: LogEntry[] = [];
  const meta = asset.hotelMeta!;
  const revenue = hotelMonthlyRevenue(asset, state);
  const opex = hotelMonthlyOpex(asset, state);

  // Reputationspoäng: dålig review om dåligt skick
  if (meta.reputationScore < 30 && asset.condition < 40) {
    events.push({ t: `⭐ Dålig recension för ${asset.name} — lågt skick påverkar kundupplevelsen.`, kind: "warn" });
  }

  // Beläggningsgrad för hotelKing-scenario
  const occ = revenue / (meta.baseAdr * STAR_ADR_MULT[meta.starRating - 1] * meta.totalRooms * 30.5);
  const highOcc = occ >= 0.80;
  const streak = (meta.highOccStreak ?? 0);
  asset.hotelMeta = { ...meta, highOccStreak: highOcc ? streak + 1 : 0 };

  return [revenue, opex, events];
}

// ── Förnybar energi ────────────────────────────────────────────────────────

const BASE_SPOT_PRICE = 650; // kr/MWh
const SOLAR_CF = 0.13;       // genomsnittlig kapacitetsfaktor sol (Sverige)
const WIND_CF  = 0.28;       // genomsnittlig kapacitetsfaktor vind

export function energyMonthlyRevenue(asset: IndustryAsset, state: GameState): number {
  const meta = asset.energyMeta;
  if (!meta) return 0;

  const cf = meta.subType === "sol" ? SOLAR_CF : WIND_CF;
  const degradFactor = 1 - meta.degradationPct / 100;
  const hoursInMonth = 730;
  const monthlyMWh = meta.installedMW * cf * hoursInMonth * degradFactor;

  // PPA-kontrakt löses av först
  const ppaMWh = meta.ppaContracts.reduce((s, c) => s + c.mwh, 0);
  const ppaRev = meta.ppaContracts.reduce((s, c) => s + c.mwh * c.pricePerMwh, 0);

  // Elcertifikat
  const subsidyPerMwh = meta.subsidyActive ? 85 : 0;
  const ppaSubsidy = ppaMWh * subsidyPerMwh;

  // Spot för resterande MWh
  const spotMWh = Math.max(0, monthlyMWh - ppaMWh);
  const spotPrice = BASE_SPOT_PRICE * state.marketSentiment * seasonFactor(state.month, "spot");
  const spotBoostMult = 1 + upgRevBoost(asset) + energySpotBoost(state) - 1; // net of base 1
  const spotRev = spotMWh * spotPrice * Math.max(0.5, spotBoostMult);

  const spotSubsidy = spotMWh * subsidyPerMwh;

  return Math.round(ppaRev + spotRev + ppaSubsidy + spotSubsidy);
}

export function energyMonthlyOpex(asset: IndustryAsset, _state: GameState): number {
  const meta = asset.energyMeta;
  if (!meta) return 0;
  // Nätavgift + O&M
  const gridFee = 12_000;
  const omBase = (meta.installedMW * 4_500) / 12;
  const cut = upgOpexCut(asset);
  return Math.round((gridFee + omBase) * (1 - cut));
}

export function energyMarketValue(asset: IndustryAsset, state: GameState): number {
  if (asset.status === "bygger") return Math.round(asset.purchasePrice * 0.5);
  const meta = asset.energyMeta;
  if (!meta) return asset.purchasePrice;
  const degradFactor = 1 - meta.degradationPct / 100;
  const cf = condFactor(asset.condition);
  return Math.round(meta.installedMW * 8_000_000 * degradFactor * cf * state.marketMod);
}

export function tickEnergy(asset: IndustryAsset, state: GameState): [number, number, LogEntry[]] {
  const events: LogEntry[] = [];
  const meta = asset.energyMeta!;
  const revenue = energyMonthlyRevenue(asset, state);
  const opex = energyMonthlyOpex(asset, state);

  // Degradering: sol 0,5 %/år = 0,042 %/mån, vind 0,3 %/år = 0,025 %/mån
  const degradRate = meta.subType === "sol" ? 0.5 / 12 : 0.3 / 12;
  asset.energyMeta = { ...meta, degradationPct: +(meta.degradationPct + degradRate).toFixed(4) };

  // PPA-förfallokontroll: om monthsLeft === 0 → ta bort (simulationsloopen dekrementerar)
  const expiredPPA = meta.ppaContracts.filter((c) => c.monthsLeft <= 1);
  for (const c of expiredPPA) {
    events.push({ t: `⚡ PPA-kontrakt med ${c.clientName} löper ut för ${asset.name}.`, kind: "warn" });
  }

  return [revenue, opex, events];
}

// ── Logistik ───────────────────────────────────────────────────────────────

const AUTO_THROUGHPUT = [1.0, 1.08, 1.18, 1.30]; // automationLevel 0–3

export function logisticsMonthlyRevenue(asset: IndustryAsset, state: GameState): number {
  const meta = asset.logisticsMeta;
  if (!meta) return 0;

  const autoMult = AUTO_THROUGHPUT[meta.automationLevel];
  const throughputBoost = logisticsThroughputBoost(state);
  const isQ4 = state.month >= 10;

  let total = 0;
  for (const c of meta.throughputContracts) {
    let revenue = c.guaranteedM3 * c.ratePerM3 * autoMult * throughputBoost;
    if (isQ4 && meta.peakSurchargeActive) {
      const peakProfile = ["ehandel", "3pl"].includes(c.clientProfile);
      if (peakProfile) revenue *= 1.28;
    }
    total += revenue;
  }
  total *= 1 + upgRevBoost(asset);
  return Math.round(total);
}

export function logisticsMonthlyOpex(asset: IndustryAsset, state: GameState): number {
  const meta = asset.logisticsMeta;
  if (!meta) return 0;
  const staffCost = meta.totalBays * 3_200 * (1 - meta.automationLevel * 0.22);
  const baseCost = meta.totalBays * 8_500;
  const cut = upgOpexCut(asset);
  const energySyn = energySynergyMult(state);
  return Math.round((baseCost + staffCost) * (1 - cut) * energySyn);
}

export function logisticsMarketValue(asset: IndustryAsset, state: GameState): number {
  if (asset.status === "bygger") return Math.round(asset.purchasePrice * 0.5);
  const annualNOI = (logisticsMonthlyRevenue(asset, state) - logisticsMonthlyOpex(asset, state)) * 12;
  const cf = condFactor(asset.condition);
  return Math.max(asset.purchasePrice * 0.4, Math.round((annualNOI / 0.07) * cf));
}

export function tickLogistik(asset: IndustryAsset, state: GameState): [number, number, LogEntry[]] {
  const events: LogEntry[] = [];
  const meta = asset.logisticsMeta!;
  let revenue = logisticsMonthlyRevenue(asset, state);
  const opex = logisticsMonthlyOpex(asset, state);

  // SLA-risk och konkurscheck per kontrakt
  const updatedContracts = meta.throughputContracts.map((c) => {
    if (Math.random() < c.defaultRisk) {
      const penalty = Math.round(c.ratePerM3 * c.guaranteedM3);
      revenue = Math.max(0, revenue - penalty);
      events.push({ t: `📦 Klientkonkurs: ${c.clientName} hos ${asset.name} – kontrakt avslutat (${kr(penalty)}).`, kind: "warn" });
      return null;
    }
    if (Math.random() < c.penaltyRisk) {
      const sla = Math.round(c.ratePerM3 * c.guaranteedM3 * 0.15);
      revenue = Math.max(0, revenue - sla);
      events.push({ t: `⚠️ SLA-miss hos ${asset.name}: ${kr(sla)} i straffavgift.`, kind: "expense" });
    }
    return c;
  }).filter(Boolean) as typeof meta.throughputContracts;

  // Aktivera Q4-peak i oktober
  const peakActive = state.month >= 10;
  asset.logisticsMeta = { ...meta, throughputContracts: updatedContracts, peakSurchargeActive: peakActive };

  // Förfallokontroll
  const expiredContracts = updatedContracts.filter((c) => c.monthsLeft <= 1);
  for (const c of expiredContracts) {
    events.push({ t: `📋 Logistikkontrakt med ${c.clientName} löper ut för ${asset.name}.`, kind: "info" });
  }

  return [revenue, opex, events];
}

// ── Gemensam dispatcher ────────────────────────────────────────────────────

export function industryAssetValue(asset: IndustryAsset, state: GameState): number {
  switch (asset.sector) {
    case "hotell":   return hotelMarketValue(asset, state);
    case "energi":   return energyMarketValue(asset, state);
    case "logistik": return logisticsMarketValue(asset, state);
  }
}

export function industryMonthlyRevenue(asset: IndustryAsset, state: GameState): number {
  switch (asset.sector) {
    case "hotell":   return hotelMonthlyRevenue(asset, state);
    case "energi":   return energyMonthlyRevenue(asset, state);
    case "logistik": return logisticsMonthlyRevenue(asset, state);
  }
}

export function industryMonthlyOpex(asset: IndustryAsset, state: GameState): number {
  switch (asset.sector) {
    case "hotell":   return hotelMonthlyOpex(asset, state);
    case "energi":   return energyMonthlyOpex(asset, state);
    case "logistik": return logisticsMonthlyOpex(asset, state);
  }
}

/** Energisynergi: ägda MW minskar driftkostnad för fastigheterna. */
export function energySynergyMult(state: GameState): number {
  const mw = state.energyOwnedMW ?? 0;
  return Math.max(0.85, 1 - Math.min(0.15, mw * 0.005));
}

/** Skapa en ny industritillgång (används av reducer och initState). */
export function makeIndustryAssetFromTemplate(
  template: import("./industryData").IndustryAssetTemplate,
  id: number,
  state: GameState,
): IndustryAsset {
  const absMonth = state.year * 12 + state.month;

  let hotelMeta: HotelMeta | null = null;
  let energyMeta: EnergyMeta | null = null;
  let logisticsMeta: LogisticsMeta | null = null;

  if (template.sector === "hotell") {
    hotelMeta = {
      starRating: (template.starRating ?? 2) as 1 | 2 | 3 | 4 | 5,
      totalRooms: template.rooms ?? 60,
      baseAdr: template.baseAdr ?? 1_000,
      bookingChannels: ["direktbokning", "ota"],
      reputationScore: 60,
      revParHistory: [],
    };
  } else if (template.sector === "energi") {
    const cfBase = template.subType === "vind" ? WIND_CF : SOLAR_CF;
    energyMeta = {
      subType: template.subType ?? "sol",
      installedMW: template.installedMW ?? 10,
      capacityFactor: cfBase,
      ppaContracts: [],
      degradationPct: 0,
      subsidyActive: true,
      commissionedAbs: absMonth,
    };
  } else {
    logisticsMeta = {
      totalBays: template.totalBays ?? 16,
      automationLevel: 0,
      throughputContracts: [],
      peakSurchargeActive: false,
    };
  }

  return {
    id,
    sector: template.sector,
    name: template.name,
    district: template.district,
    districtName: template.districtName,
    purchasePrice: template.basePrice,
    condition: 80,
    upgrades: [],
    managed: false,
    insurance: false,
    status: "klar",
    buildLeft: 0,
    monthlyRevenue: 0,
    monthlyOpex: 0,
    totalRevenue: 0,
    txHistory: [],
    hotelMeta,
    energyMeta,
    logisticsMeta,
  };
}
