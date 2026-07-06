/* ============================================================
   Speldata – konstanter för Fastighetsimperium.
   Balansering och formler är oförändrade från prototypen.
   ============================================================ */

import type {
  District,
  GameEvent,
  PropTypeDef,
  PropTypeKey,
  TenantProfile,
  Upgrade,
} from "./types";

export const DISTRICTS: District[] = [
  { id: "centrum", name: "Centrum", base: 32000, growth: 1.0, demand: 0.9, prestige: 1.4 },
  { id: "hamnen", name: "Hamnen", base: 21000, growth: 1.25, demand: 0.75, prestige: 1.1 },
  { id: "industri", name: "Industriområdet", base: 11000, growth: 0.9, demand: 0.6, prestige: 0.7 },
  { id: "förort", name: "Förorten", base: 16000, growth: 1.1, demand: 0.8, prestige: 0.9 },
  { id: "kulle", name: "Villakullen", base: 28000, growth: 1.05, demand: 0.85, prestige: 1.3 },
  // Låst vid spelstart – öppnas när staden växer (se simulation.ts).
  { id: "storängen", name: "Storängen", base: 14000, growth: 1.35, demand: 0.7, prestige: 0.8 },
];

/** Distrikt som är öppna från spelstart. */
export const START_DISTRICTS = ["centrum", "hamnen", "industri", "förort", "kulle"];

/** Distriktet som låses upp av stadsexpansionen. */
export const EXPANSION_DISTRICT = "storängen";

export const PROP_TYPES: Record<PropTypeKey, PropTypeDef> = {
  bostad: {
    label: "Bostadshus",
    rentFactor: 0.0042,
    opexFactor: 0.28,
    vacancyBase: 0.04,
    buildCostM2: 24000,
    buildMonths: 10,
  },
  kontor: {
    label: "Kontor",
    rentFactor: 0.0055,
    opexFactor: 0.32,
    vacancyBase: 0.1,
    buildCostM2: 28000,
    buildMonths: 12,
  },
  butik: {
    label: "Butik",
    rentFactor: 0.006,
    opexFactor: 0.3,
    vacancyBase: 0.12,
    buildCostM2: 26000,
    buildMonths: 11,
  },
  industri: {
    label: "Industri/Lager",
    rentFactor: 0.0038,
    opexFactor: 0.22,
    vacancyBase: 0.08,
    buildCostM2: 14000,
    buildMonths: 8,
  },
};

export const UPGRADES: Upgrade[] = [
  {
    id: "renovering",
    name: "Renovering",
    cost: 0.12,
    rentBoost: 0.18,
    condBoost: 35,
    desc: "Höjer hyra och skick.",
  },
  {
    id: "energi",
    name: "Energiåtgärd",
    cost: 0.08,
    opexCut: 0.2,
    condBoost: 10,
    desc: "Sänker driftkostnad.",
  },
  {
    id: "tillbygg",
    name: "Tillbyggnad",
    cost: 0.22,
    valueBoost: 0.25,
    rentBoost: 0.1,
    desc: "Ökar yta och värde.",
  },
  { id: "smart", name: "Smart fastighet", cost: 0.06, vacancyCut: 0.3, desc: "Sänker vakans." },
];

// Hyresgästprofiler (kvalitet påverkar hyra, kontraktslängd, risk)
export const TENANT_PROFILES: TenantProfile[] = [
  {
    id: "stat",
    name: "Statlig myndighet",
    quality: 1.15,
    termMin: 60,
    termMax: 120,
    defaultRisk: 0.002,
  },
  {
    id: "kedja",
    name: "Etablerad kedja",
    quality: 1.08,
    termMin: 36,
    termMax: 84,
    defaultRisk: 0.006,
  },
  { id: "smb", name: "Mindre företag", quality: 1.0, termMin: 24, termMax: 60, defaultRisk: 0.018 },
  {
    id: "privat",
    name: "Privatperson",
    quality: 0.97,
    termMin: 12,
    termMax: 36,
    defaultRisk: 0.012,
  },
  { id: "startup", name: "Startup", quality: 1.05, termMin: 12, termMax: 36, defaultRisk: 0.035 },
];

export const EVENTS: GameEvent[] = [
  {
    id: "rate_up",
    text: "Riksbanken höjer styrräntan med 0,25 %.",
    apply: (s) => ({ ...s, interestRate: +(s.interestRate + 0.25).toFixed(2) }),
  },
  {
    id: "rate_down",
    text: "Riksbanken sänker styrräntan med 0,25 %.",
    apply: (s) => ({ ...s, interestRate: Math.max(0.5, +(s.interestRate - 0.25).toFixed(2)) }),
  },
  {
    id: "boom",
    text: "Högkonjunktur! Marknadsvärden stiger.",
    apply: (s) => ({ ...s, marketMod: +(s.marketMod * 1.06).toFixed(3) }),
  },
  {
    id: "bust",
    text: "Lågkonjunktur. Marknadsvärden faller.",
    apply: (s) => ({ ...s, marketMod: +(s.marketMod * 0.94).toFixed(3) }),
  },
  {
    id: "tenant_demand",
    text: "Ökad efterfrågan på lokaler i staden.",
    apply: (s) => ({ ...s, demandMod: +(s.demandMod * 1.05).toFixed(3) }),
  },
  {
    id: "tax",
    text: "Höjd fastighetsskatt aviseras.",
    apply: (s) => ({ ...s, taxMod: +(s.taxMod * 1.04).toFixed(3) }),
  },
  {
    id: "pr",
    text: "Positiv press om ditt bolag. Reputation +5.",
    apply: (s) => ({ ...s, reputation: Math.min(100, s.reputation + 5) }),
  },
];

export const AI_NAMES = ["Nordhem Fastigheter", "Brunnsparken Invest", "Kustlinjen AB"];
