/* ============================================================
   Domäntyper för Fastighetsimperium.
   Inga React-beroenden – ren TypeScript.
   ============================================================ */

export type PropTypeKey = "bostad" | "kontor" | "butik" | "industri";

export type PropStatus = "klar" | "bygger";

export type LogKind = "info" | "warn" | "buy" | "sell" | "upg" | "income" | "expense" | "event";

/** Ett distrikt på marknaden. */
export interface District {
  id: string;
  name: string;
  base: number;
  growth: number;
  demand: number;
  prestige: number;
}

/** Definition av en fastighetstyp (bostad, kontor, ...). */
export interface PropTypeDef {
  label: string;
  rentFactor: number;
  opexFactor: number;
  vacancyBase: number;
  buildCostM2: number;
  buildMonths: number;
}

/** En uppgradering som kan göras på en ägd fastighet. */
export interface Upgrade {
  id: string;
  name: string;
  cost: number;
  desc: string;
  rentBoost?: number;
  opexCut?: number;
  condBoost?: number;
  valueBoost?: number;
  vacancyCut?: number;
}

/** Profil för en typ av hyresgäst. */
export interface TenantProfile {
  id: string;
  name: string;
  quality: number;
  termMin: number;
  termMax: number;
  defaultRisk: number;
}

/** En aktiv hyresgäst med kontrakt. */
export interface Tenant {
  id: number;
  profile: string;
  name: string;
  quality: number;
  defaultRisk: number;
  monthsLeft: number;
  termTotal: number;
  rent: number;
}

/** En fastighet (till salu eller ägd). */
export interface Property {
  id: number;
  district: string;
  districtName: string;
  /** Tomtruta på stadskartan (se engine/city.ts). */
  parcelId: string;
  type: PropTypeKey;
  typeLabel: string;
  area: number;
  condition: number;
  askPrice: number;
  baseRent: number;
  purchasePrice?: number;
  upgrades: string[];
  owned: boolean;
  rentMult: number;
  opexMult: number;
  vacancyMult: number;
  valueMult: number;
  tenant: Tenant | null;
  status: PropStatus;
  buildLeft: number;
}

/** En byggbar tomt. */
export interface Lot {
  id: number;
  district: string;
  districtName: string;
  /** Tomtruta på stadskartan (se engine/city.ts). */
  parcelId: string;
  area: number;
  price: number;
  owned?: boolean;
}

/** En fastighet som ägs av en AI-konkurrent. */
export interface RivalHolding {
  id: number;
  parcelId: string;
  district: string;
  districtName: string;
  type: PropTypeKey;
  typeLabel: string;
  area: number;
}

/** En AI-konkurrent. */
export interface Competitor {
  name: string;
  cash: number;
  /** Antal fastigheter – hålls synkat med holdings.length. */
  units: number;
  equity: number;
  /** Konkurrentens innehav – syns som byggnader på kartan. */
  holdings: RivalHolding[];
}

/** En rad i händelseloggen. */
export interface LogEntry {
  t: string;
  kind: LogKind;
  /** Tomtruta händelsen gäller – gör den lokaliserbar på kartan. */
  parcelId?: string;
}

/** En punkt i utvecklingen av eget kapital. */
export interface HistoryPoint {
  month: number;
  equity: number;
}

/** En makrohändelse som kan inträffa varje månad. */
export interface GameEvent {
  id: string;
  text: string;
  apply: (s: GameState) => GameState;
}

/** Lånevillkor härledda ur reputation. */
export interface LoanTerms {
  rate: number;
  spread: number;
  maxLtv: number;
}

/** Hela speltillståndet. */
export interface GameState {
  month: number;
  year: number;
  cash: number;
  debt: number;
  interestRate: number;
  marketMod: number;
  demandMod: number;
  taxMod: number;
  reputation: number;
  portfolio: Property[];
  listings: Property[];
  lots: Lot[];
  competitors: Competitor[];
  /** Distrikt som är öppna för exploatering – nya låses upp när staden växer. */
  unlockedDistricts: string[];
  log: LogEntry[];
  history: HistoryPoint[];
  gameOver: boolean;
}

/** Alla actions som reducern hanterar. */
export type GameAction =
  | { type: "BUY"; id: number }
  | { type: "SELL"; id: number }
  | { type: "UPGRADE"; id: number; upg: string }
  | { type: "LEASE"; id: number }
  | { type: "BUY_LOT"; id: number }
  | { type: "BUILD"; id: number; propType: PropTypeKey }
  | { type: "AMORT"; amount: number }
  | { type: "REFRESH_LISTINGS" }
  | { type: "NEXT_MONTH" }
  | { type: "LOAD"; state: GameState }
  | { type: "RESET" };
