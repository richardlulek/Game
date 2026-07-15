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
    name: "Rumsrenovering",
    cost: 0.10,
    condBoost: 30,
    revenueBoost: 0.12,
    desc: "Moderniserar rummen. +12 % ADR, +30 skick.",
  },
  {
    id: "hotell_spa",
    sector: "hotell",
    name: "Spa & Wellness",
    cost: 0.18,
    revenueBoost: 0.18,
    desc: "+18 % RevPAR. Attraherar fyrstjärnigt segment.",
  },
  {
    id: "hotell_pms",
    sector: "hotell",
    name: "Revenue Mgmt System",
    cost: 0.06,
    revenueBoost: 0.08,
    desc: "Dynamisk prissättning. +8 % OCC, −5 % OTA-beroende.",
  },
  {
    id: "hotell_restaurant",
    sector: "hotell",
    name: "Restaurang & Bar",
    cost: 0.14,
    revenueBoost: 0.14,
    desc: "+14 % RevPAR via mat- och dryckesintäkter.",
  },
  {
    id: "hotell_solceller",
    sector: "hotell",
    name: "Solceller på taket",
    cost: 0.07,
    opexCut: 0.10,
    condBoost: 5,
    desc: "−10 % energiopex.",
  },

  // Energi (4)
  {
    id: "energi_panel_upg",
    sector: "energi",
    name: "Paneluppgradering",
    cost: 0.12,
    capacityBoost: 0.15,
    condBoost: 10,
    desc: "+15 % MW-kapacitet, +10 skick.",
  },
  {
    id: "energi_batteri",
    sector: "energi",
    name: "Batterilager",
    cost: 0.20,
    revenueBoost: 0.20,
    desc: "Lagra och sälja vid toppbelastning. +20 % spot-intäkt.",
  },
  {
    id: "energi_scada",
    sector: "energi",
    name: "SCADA-automationssystem",
    cost: 0.08,
    opexCut: 0.12,
    desc: "−12 % O&M-kostnad.",
  },
  {
    id: "energi_ppa_portal",
    sector: "energi",
    name: "PPA-plattform",
    cost: 0.05,
    revenueBoost: 0.07,
    desc: "+7 % PPA-intäkt. Attraherar fler B2B-kunder.",
  },

  // Logistik (5)
  {
    id: "logistik_auto1",
    sector: "logistik",
    name: "Halvautomatisering",
    cost: 0.14,
    opexCut: 0.18,
    revenueBoost: 0.08,
    desc: "Automation nivå 1. −18 % personalkostnad, +8 % kapacitet.",
  },
  {
    id: "logistik_auto2",
    sector: "logistik",
    name: "Fullautomat",
    cost: 0.22,
    opexCut: 0.28,
    revenueBoost: 0.15,
    desc: "Automation nivå 2. −28 % opex, +15 % throughput.",
  },
  {
    id: "logistik_kyl",
    sector: "logistik",
    name: "Kylkedja",
    cost: 0.12,
    revenueBoost: 0.16,
    desc: "+16 % ratePerM3 för livsmedelskunder. Ny kundprofil.",
  },
  {
    id: "logistik_soltak",
    sector: "logistik",
    name: "Solcellstak",
    cost: 0.08,
    opexCut: 0.08,
    desc: "−8 % energiopex. Synergi med energiportfölj.",
  },
  {
    id: "logistik_dock",
    sector: "logistik",
    name: "Dockförlängning",
    cost: 0.10,
    capacityBoost: 0.20,
    desc: "+20 % lossningsbryggor och throughputkapacitet.",
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
  { id: "direktbokning", name: "Direktbokning",    adrEffect: 1.00, occBonus: 0.02, commissionPct: 0 },
  { id: "ota",           name: "OTA (Booking etc)",adrEffect: 0.88, occBonus: 0.04, commissionPct: 0.12 },
  { id: "grupp",         name: "Grupparrangemang", adrEffect: 0.92, occBonus: 0.06, commissionPct: 0 },
  { id: "företag",       name: "Företagsavtal",    adrEffect: 1.04, occBonus: 0.05, commissionPct: 0 },
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
  { id: "industri_stor",  name: "Stor industrianläggning", mwhFactor: 1.2, priceFactor: 0.95, defaultRisk: 0.003, termMin: 36, termMax: 120 },
  { id: "kommuns",        name: "Kommunal verksamhet",     mwhFactor: 0.8, priceFactor: 1.05, defaultRisk: 0.001, termMin: 60, termMax: 120 },
  { id: "dc_operatoer",   name: "Datacenteroperatör",      mwhFactor: 1.5, priceFactor: 1.12, defaultRisk: 0.005, termMin: 24, termMax: 60  },
  { id: "sme_batteri",    name: "SME med batterilager",    mwhFactor: 0.5, priceFactor: 0.90, defaultRisk: 0.020, termMin: 12, termMax: 36  },
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
  { id: "ehandel",      name: "E-handelsaktör",       rateBase: 180, defaultRisk: 0.025, termMin: 12, termMax: 36, peakVolumeMult: 1.8, penaltyRisk: 0.05 },
  { id: "livsmedel",    name: "Livsmedelskedja",       rateBase: 240, defaultRisk: 0.008, termMin: 24, termMax: 72, peakVolumeMult: 1.2, requiresKyl: true, penaltyRisk: 0.02 },
  { id: "industri_kund",name: "Industriellt gods",     rateBase: 160, defaultRisk: 0.012, termMin: 36, termMax: 84, peakVolumeMult: 1.0, penaltyRisk: 0.01 },
  { id: "3pl",          name: "Tredjepartslogistiker", rateBase: 200, defaultRisk: 0.018, termMin: 24, termMax: 60, peakVolumeMult: 1.5, penaltyRisk: 0.03 },
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
  { sector: "hotell", name: "Palatshotellet",   district: "finans",   districtName: "Finansdistriktet", basePrice: 40_000_000, rooms: 150, starRating: 5, baseAdr: 3_200 },
  { sector: "hotell", name: "Boutiquehotellet", district: "innerstad",districtName: "Innerstaden",    basePrice: 15_000_000, rooms: 45,  starRating: 3, baseAdr: 1_600 },
  { sector: "hotell", name: "Centralhotellet",  district: "centrum",  districtName: "Centrum",        basePrice: 18_000_000, rooms: 80,  starRating: 3, baseAdr: 1_400 },
  { sector: "hotell", name: "Hamnhotellet",     district: "hamnen",   districtName: "Hamnen",         basePrice: 12_000_000, rooms: 60,  starRating: 2, baseAdr:   950 },
  { sector: "hotell", name: "Grand Kulle Hotel",district: "kulle",    districtName: "Villakullen",    basePrice: 28_000_000, rooms: 120, starRating: 4, baseAdr: 2_100 },
  { sector: "hotell", name: "Förorts Inn",      district: "förort",   districtName: "Förorten",       basePrice:  7_000_000, rooms: 40,  starRating: 2, baseAdr:   700 },
  { sector: "hotell", name: "Industrilounge",   district: "industri", districtName: "Industriområdet",basePrice:  5_000_000, rooms: 30,  starRating: 1, baseAdr:   550 },

  // Energi – sol
  { sector: "energi", name: "Solpark Kulle",      district: "kulle",    districtName: "Villakullen",    basePrice: 15_000_000, installedMW: 8,  subType: "sol"  },
  { sector: "energi", name: "Industrisolpark",    district: "industri", districtName: "Industriområdet",basePrice: 22_000_000, installedMW: 12, subType: "sol"  },
  { sector: "energi", name: "Förorts Solcellspark",district: "förort",  districtName: "Förorten",       basePrice: 10_000_000, installedMW: 5,  subType: "sol"  },
  // Energi – vind
  { sector: "energi", name: "Hamnens Vindpark",   district: "hamnen",   districtName: "Hamnen",         basePrice: 30_000_000, installedMW: 15, subType: "vind" },
  { sector: "energi", name: "Industrivindfarm",   district: "industri", districtName: "Industriområdet",basePrice: 20_000_000, installedMW: 10, subType: "vind" },

  // Logistik
  { sector: "logistik", name: "Hamnterminal AB",    district: "hamnen",   districtName: "Hamnen",         basePrice: 20_000_000, totalBays: 24 },
  { sector: "logistik", name: "Industrilogistik",   district: "industri", districtName: "Industriområdet",basePrice: 14_000_000, totalBays: 16 },
  { sector: "logistik", name: "Förorts Lager AB",   district: "förort",   districtName: "Förorten",       basePrice:  9_000_000, totalBays: 12 },
  { sector: "logistik", name: "E-com Centrallager", district: "industri", districtName: "Industriområdet",basePrice: 18_000_000, totalBays: 20 },
  { sector: "logistik", name: "Centrum Citylogistik",district: "centrum", districtName: "Centrum",        basePrice: 16_000_000, totalBays: 14 },
];
