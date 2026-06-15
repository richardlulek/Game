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
  /** Kategorin (t.ex. "Etablerad kedja") – name är numera affärsnamnet. */
  profileName?: string;
  quality: number;
  defaultRisk: number;
  monthsLeft: number;
  termTotal: number;
  rent: number;
}

/** Ett inkommande erbjudande (t.ex. en rival som vill köpa din fastighet). */
export interface Offer {
  id: number;
  kind: "buyout";
  propId: number;
  propLabel: string;
  districtName: string;
  from: string;
  amount: number;
  expiresIn: number;
}

/** Ett val som spelaren måste ta ställning till innan spelet kan gå vidare. */
export interface PendingDecision {
  id: string;
  title: string;
  text: string;
  options: DecisionOption[];
}

/** Ett alternativ i ett beslut – effekten är ren data (serialiserbar). */
export interface DecisionOption {
  label: string;
  detail: string;
  effect: DecisionEffect;
}

/** Deterministisk, serialiserbar effekt av ett beslutsalternativ. */
export interface DecisionEffect {
  cash?: number;
  reputation?: number;
  demandMod?: number;
  marketMod?: number;
  taxMod?: number;
  addLot?: boolean;
  log: string;
  logKind: LogKind;
}

/** En fastighet (till salu eller ägd). */
export interface Property {
  id: number;
  district: string;
  districtName: string;
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
  tenants: Tenant[];
  capacity: number;
  status: PropStatus;
  buildLeft: number;
  totalEarnedRent?: number;
  managed?: boolean;
  listedMonth?: number;
  expiresMonth?: number;
}

/** En byggbar tomt. */
export interface Lot {
  id: number;
  district: string;
  districtName: string;
  area: number;
  price: number;
  owned?: boolean;
  listedMonth?: number;
  expiresMonth?: number;
}

/** En AI-konkurrent. */
export interface Competitor {
  name: string;
  cash: number;
  units: number;
  equity: number;
  lastBuy?: string;
  monthlyNOI?: number;
  portfolio: Property[];
}

/** Bransch på börsen. */
export type Sector = "fastighet" | "bank" | "bygg" | "handel" | "industri";

/** Ett börsnoterat bolag. */
export interface Stock {
  id: string;
  name: string;
  sector: Sector;
  price: number;
  prevPrice: number;
  sharesOutstanding: number;
  owned: number;
  avgCost: number;
  dividendYield: number;   // årlig
  beta: number;            // känslighet mot marknadssentiment
  drift: number;           // grundtrend per månad
  volatility: number;
  history: number[];       // senaste priserna
  competitorName?: string; // länk till en Competitor om det är en rival
}

/** Ett förvärvat dotterbolag som ger månadsintäkt. */
export interface Subsidiary {
  name: string;
  monthlyIncome: number;
}

/** Ett pågående forskningsprojekt. */
export interface ActiveResearch {
  id: string;
  monthsLeft: number;
  monthsTotal: number;
}

/** En aktiv limitorder på börsen. */
export interface LimitOrder {
  id: string;
  stockId: string;
  stockName: string;
  side: "buy" | "sell";
  qty: number;
  limitPrice: number;
  createdMonth: number;
}

/** En rad i händelseloggen. */
export interface LogEntry {
  t: string;
  kind: LogKind;
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
  log: LogEntry[];
  history: HistoryPoint[];
  gameOver: boolean;
  offers: Offer[];
  pendingDecision: PendingDecision | null;
  stocks: Stock[];
  marketSentiment: number;
  sentimentHistory: number[];
  subsidiaries: Subsidiary[];
  dividendsReceived: number;
  districtDev: Record<string, number>;
  buildCostMod: number;
  researchDone: string[];
  activeResearch: ActiveResearch | null;
  staff: Record<string, number>;
  stockOrders: LimitOrder[];
  portfolioValueHistory: number[];
  worldPool: Property[];
  worldTotal: number;
}

/** Alla actions som reducern hanterar. */
export type GameAction =
  | { type: "BUY"; id: number }
  | { type: "PLACE_BID"; id: number; amount: number }
  | { type: "SELL"; id: number }
  | { type: "UPGRADE"; id: number; upg: string }
  | { type: "LEASE"; id: number }
  | { type: "EVICT"; id: number; tenantId: number }
  | { type: "RENEW_LEASE"; id: number; tenantId: number }
  | { type: "MAINTAIN"; id: number }
  | { type: "BUY_LOT"; id: number }
  | { type: "BUILD"; id: number; propType: PropTypeKey }
  | { type: "AMORT"; amount: number }
  | { type: "REFINANCE"; amount: number }
  | { type: "LEASE_TENANT"; id: number; tenant: Tenant }
  | { type: "RAISE_RENT"; id: number; tenantId: number; increasePercent: number }
  | { type: "LOWER_RENT"; id: number; tenantId: number; decreasePercent: number }
  | { type: "TOGGLE_MANAGER"; id: number }
  | { type: "MARKET_BOOST"; id: number }
  | { type: "HIRE_BROKER" }
  | { type: "HIRE_BROKER_LOTS" }
  | { type: "RESOLVE_DECISION"; optionIndex: number }
  | { type: "ACCEPT_OFFER"; offerId: number }
  | { type: "DECLINE_OFFER"; offerId: number }
  | { type: "BUY_SHARES"; stockId: string; qty: number }
  | { type: "SELL_SHARES"; stockId: string; qty: number }
  | { type: "ACQUIRE_COMPANY"; stockId: string }
  | { type: "CHANGE_USE"; id: number; propType: PropTypeKey }
  | { type: "START_RESEARCH"; id: string }
  | { type: "HIRE_STAFF"; role: string }
  | { type: "FIRE_STAFF"; role: string }
  | { type: "SELL_SUBSIDIARY"; name: string }
  | { type: "PLACE_LIMIT_ORDER"; stockId: string; qty: number; limitPrice: number; side: "buy" | "sell" }
  | { type: "CANCEL_LIMIT_ORDER"; orderId: string }
  | { type: "NEXT_MONTH" }
  | { type: "FAST_FORWARD"; months: number }
  | { type: "LOAD"; state: GameState }
  | { type: "RESET" };
