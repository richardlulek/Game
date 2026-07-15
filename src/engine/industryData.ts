/* ============================================================
   Statisk data för industrisektorer.
   Samma mönster som data.ts för fastigheter.
   ============================================================ */

import type { IndustryUpgrade, LogisticsClientProfile } from "./types";

// ── Uppgraderingar ──────────────────────────────────────────────────────────

/** Fasta energilägen UTANFÖR stadsrutnätet – sol- och vindparker hör hemma
 *  på åkrarna och åsarna runt staden, inte på kvarterstomter. Punkterna är
 *  reserverade (inga kollisioner med tomtsystemet) och kopplade till sitt
 *  distrikts utkant. */
export interface EnergySite {
  id: string;
  district: string;
  x: number;
  z: number;
}

export const ENERGY_SITES: EnergySite[] = [
  { id: "energi-vast",     district: "förort",   x: -560, z: 150 },  // åkrarna väster om Förorten
  { id: "energi-nordvast", district: "kulle",    x: -510, z: -330 }, // åsen bortom Villakullen
  { id: "energi-nordost",  district: "industri", x: 600,  z: -300 }, // fälten nordost om industrin
  { id: "energi-ost",      district: "industri", x: 660,  z: -80 },  // östra slätten
  { id: "energi-kust",     district: "hamnen",   x: 600,  z: 280 },  // kustremsan öster om Hamnen
  { id: "energi-nord",     district: "innerstad",x: 140,  z: -430 }, // norr om Innerstaden
];

export const INDUSTRY_UPGRADES: IndustryUpgrade[] = [
  // Hotell (5)
  {
    id: "hotell_renovering",
    sector: "hotell",
    name: "Room renovation",
    cost: 0.10,
    condBoost: 30,
    revenueBoost: 0.12,
    desc: "Modernizes the rooms. +12% ADR, +30 condition.",
  },
  {
    id: "hotell_spa",
    sector: "hotell",
    name: "Spa & Wellness",
    cost: 0.18,
    revenueBoost: 0.18,
    desc: "+18% RevPAR. Attracts the four-star segment.",
  },
  {
    id: "hotell_pms",
    sector: "hotell",
    name: "Revenue Mgmt System",
    cost: 0.06,
    revenueBoost: 0.08,
    desc: "Dynamic pricing. +8% OCC, −5% OTA reliance.",
  },
  {
    id: "hotell_restaurant",
    sector: "hotell",
    name: "Restaurant & Bar",
    cost: 0.14,
    revenueBoost: 0.14,
    desc: "+14% RevPAR via food and beverage revenue.",
  },
  {
    id: "hotell_solceller",
    sector: "hotell",
    name: "Rooftop solar",
    cost: 0.07,
    opexCut: 0.10,
    condBoost: 5,
    desc: "−10% energy opex.",
  },

  // Energi (4)
  {
    id: "energi_panel_upg",
    sector: "energi",
    name: "Panel upgrade",
    cost: 0.12,
    capacityBoost: 0.15,
    condBoost: 10,
    desc: "+15% MW capacity, +10 condition.",
  },
  {
    id: "energi_batteri",
    sector: "energi",
    name: "Battery storage",
    cost: 0.20,
    revenueBoost: 0.20,
    desc: "Store and sell at peak load. +20% spot revenue.",
  },
  {
    id: "energi_scada",
    sector: "energi",
    name: "SCADA automation",
    cost: 0.08,
    opexCut: 0.12,
    desc: "−12% O&M cost.",
  },
  {
    id: "energi_ppa_portal",
    sector: "energi",
    name: "PPA platform",
    cost: 0.05,
    revenueBoost: 0.07,
    desc: "+7% PPA revenue. Attracts more B2B customers.",
  },

  // Logistik (5)
  {
    id: "logistik_auto1",
    sector: "logistik",
    name: "Semi-automation",
    cost: 0.14,
    opexCut: 0.18,
    revenueBoost: 0.08,
    desc: "Automation level 1. −18% labor cost, +8% capacity.",
  },
  {
    id: "logistik_auto2",
    sector: "logistik",
    name: "Full automation",
    cost: 0.22,
    opexCut: 0.28,
    revenueBoost: 0.15,
    desc: "Automation level 2. −28% opex, +15% throughput.",
  },
  {
    id: "logistik_kyl",
    sector: "logistik",
    name: "Cold chain",
    cost: 0.12,
    revenueBoost: 0.16,
    desc: "+16% ratePerM3 for grocery clients. New client profile.",
  },
  {
    id: "logistik_soltak",
    sector: "logistik",
    name: "Rooftop solar",
    cost: 0.08,
    opexCut: 0.08,
    desc: "−8% energy opex. Synergy with the energy portfolio.",
  },
  {
    id: "logistik_dock",
    sector: "logistik",
    name: "Dock extension",
    cost: 0.10,
    capacityBoost: 0.20,
    desc: "+20% loading docks and throughput capacity.",
  },
];

// ── Bokningskanaler för hotell ─────────────────────────────────────────────

export interface BookingChannelDef {
  id: string;
  name: string;
  adrEffect: number;   // multiplikator på ADR
  occBonus: number;    // ökning av OCC (0–1)
  commissionPct: number; // avgift som % av omsättning
}

export const HOTEL_BOOKING_CHANNELS: BookingChannelDef[] = [
  { id: "direktbokning", name: "Direct booking",     adrEffect: 1.00, occBonus: 0.02, commissionPct: 0 },
  { id: "ota",           name: "OTA (Booking etc)",  adrEffect: 0.88, occBonus: 0.04, commissionPct: 0.12 },
  { id: "grupp",         name: "Group bookings",     adrEffect: 0.92, occBonus: 0.06, commissionPct: 0 },
  { id: "företag",       name: "Corporate contracts",adrEffect: 1.04, occBonus: 0.05, commissionPct: 0 },
];

// ── PPA-klientprofiler ─────────────────────────────────────────────────────

export interface PpaClientDef {
  id: string;
  name: string;
  mwhFactor: number;    // multiplikator på baseMWh
  priceFactor: number;  // multiplikator på basSpotPris
  defaultRisk: number;
  termMin: number;
  termMax: number;
}

export const PPA_CLIENT_PROFILES: PpaClientDef[] = [
  { id: "industri_stor",  name: "Large industrial plant",  mwhFactor: 1.2, priceFactor: 0.95, defaultRisk: 0.003, termMin: 36, termMax: 120 },
  { id: "kommuns",        name: "Municipal operations",    mwhFactor: 0.8, priceFactor: 1.05, defaultRisk: 0.001, termMin: 60, termMax: 120 },
  { id: "dc_operatoer",   name: "Data center operator",    mwhFactor: 1.5, priceFactor: 1.12, defaultRisk: 0.005, termMin: 24, termMax: 60  },
  { id: "sme_batteri",    name: "SME with battery storage",mwhFactor: 0.5, priceFactor: 0.90, defaultRisk: 0.020, termMin: 12, termMax: 36  },
];

// ── Logistik-klientprofiler ───────────────────────────────────────────────

export interface LogisticsClientDef {
  id: LogisticsClientProfile;
  name: string;
  rateBase: number;       // kr/m³
  defaultRisk: number;
  termMin: number;
  termMax: number;
  peakVolumeMult: number; // Q4-toppmultiplikator
  requiresKyl?: boolean;
  penaltyRisk: number;
}

export const LOGISTICS_CLIENT_PROFILES: LogisticsClientDef[] = [
  { id: "ehandel",      name: "E-commerce operator",   rateBase: 180, defaultRisk: 0.025, termMin: 12, termMax: 36, peakVolumeMult: 1.8, penaltyRisk: 0.05 },
  { id: "livsmedel",    name: "Grocery chain",         rateBase: 240, defaultRisk: 0.008, termMin: 24, termMax: 72, peakVolumeMult: 1.2, requiresKyl: true, penaltyRisk: 0.02 },
  { id: "industri_kund",name: "Industrial freight",    rateBase: 160, defaultRisk: 0.012, termMin: 36, termMax: 84, peakVolumeMult: 1.0, penaltyRisk: 0.01 },
  { id: "3pl",          name: "Third-party logistics", rateBase: 200, defaultRisk: 0.018, termMin: 24, termMax: 60, peakVolumeMult: 1.5, penaltyRisk: 0.03 },
];

// ── Industritillgångs-marknadsdata: startupplägg för marknadslistor ────────

export interface IndustryAssetTemplate {
  sector: "hotell" | "energi" | "logistik";
  name: string;
  district: string;
  districtName: string;
  basePrice: number;
  // sektor-specifik data
  rooms?: number;
  starRating?: 1 | 2 | 3 | 4 | 5;
  baseAdr?: number;
  installedMW?: number;
  subType?: "sol" | "vind";
  totalBays?: number;
}

export const INDUSTRY_TEMPLATES: IndustryAssetTemplate[] = [
  // Hotell – graderingen följer läget: palats i Finansdistriktet, boutique i
  // Innerstaden, vandrarhemsklass i Förorten och truckerhotell vid industrin.
  { sector: "hotell", name: "The Palace Hotel",   district: "finans",   districtName: "Financial District", basePrice: 40_000_000, rooms: 150, starRating: 5, baseAdr: 3_200 },
  { sector: "hotell", name: "The Boutique Hotel", district: "innerstad",districtName: "Inner City",       basePrice: 15_000_000, rooms: 45,  starRating: 3, baseAdr: 1_600 },
  { sector: "hotell", name: "The Central Hotel",  district: "centrum",  districtName: "Downtown",         basePrice: 18_000_000, rooms: 80,  starRating: 3, baseAdr: 1_400 },
  { sector: "hotell", name: "The Harbor Hotel",   district: "hamnen",   districtName: "The Harbor",       basePrice: 12_000_000, rooms: 60,  starRating: 2, baseAdr:   950 },
  { sector: "hotell", name: "Grand Hill Hotel",   district: "kulle",    districtName: "Villa Hill",       basePrice: 28_000_000, rooms: 120, starRating: 4, baseAdr: 2_100 },
  { sector: "hotell", name: "Suburb Inn",         district: "förort",   districtName: "The Suburbs",      basePrice:  7_000_000, rooms: 40,  starRating: 2, baseAdr:   700 },
  { sector: "hotell", name: "Industry Lounge",    district: "industri", districtName: "Industrial District",basePrice: 5_000_000, rooms: 30,  starRating: 1, baseAdr:   550 },

  // Energi – sol
  { sector: "energi", name: "Hill Solar Park",      district: "kulle",    districtName: "Villa Hill",       basePrice: 15_000_000, installedMW: 8,  subType: "sol"  },
  { sector: "energi", name: "Industry Solar Park",  district: "industri", districtName: "Industrial District",basePrice: 22_000_000, installedMW: 12, subType: "sol"  },
  { sector: "energi", name: "Suburb Solar Farm",    district: "förort",   districtName: "The Suburbs",      basePrice: 10_000_000, installedMW: 5,  subType: "sol"  },
  // Energi – vind
  { sector: "energi", name: "Harbor Wind Farm",     district: "hamnen",   districtName: "The Harbor",       basePrice: 30_000_000, installedMW: 15, subType: "vind" },
  { sector: "energi", name: "Industry Wind Farm",   district: "industri", districtName: "Industrial District",basePrice: 20_000_000, installedMW: 10, subType: "vind" },

  // Logistik
  { sector: "logistik", name: "Harbor Terminal Ltd", district: "hamnen",   districtName: "The Harbor",       basePrice: 20_000_000, totalBays: 24 },
  { sector: "logistik", name: "Industry Logistics",  district: "industri", districtName: "Industrial District",basePrice: 14_000_000, totalBays: 16 },
  { sector: "logistik", name: "Suburb Warehouse Ltd",district: "förort",   districtName: "The Suburbs",      basePrice:  9_000_000, totalBays: 12 },
  { sector: "logistik", name: "E-com Central Depot", district: "industri", districtName: "Industrial District",basePrice: 18_000_000, totalBays: 20 },
  { sector: "logistik", name: "Downtown City Logistics",district: "centrum",districtName: "Downtown",        basePrice: 16_000_000, totalBays: 14 },
];
