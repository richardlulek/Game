/* ============================================================
   Domäntyper för Fastighetsimperium.
   Inga React-beroenden – ren TypeScript.
   ============================================================ */

export type PropTypeKey = "bostad" | "kontor" | "butik" | "industri";

export type ScenarioId =
  | "equity50" | "equity200" | "districts3" | "units25" | "sandbox"
  | "diversified" | "energyBaron" | "hotelKing" | "arvet";

// ── Industrisektorer ────────────────────────────────────────────────────────

export type IndustrySectorKey = "hotell" | "energi" | "logistik";

export type BookingChannel = "direktbokning" | "ota" | "grupp" | "företag";
export type LogisticsClientProfile = "ehandel" | "livsmedel" | "industri_kund" | "3pl";

export interface HotelMeta {
  starRating: 1 | 2 | 3 | 4 | 5;
  totalRooms: number;
  baseAdr: number;          // Average Daily Rate (kr/natt, bas)
  bookingChannels: BookingChannel[];
  reputationScore: number;  // 0–100, påverkar OCC
  revParHistory: number[];  // senaste 12 månaders RevPAR
  highOccStreak?: number;   // konsekutiva månader med OCC ≥ 80 %
}

export interface PpaContract {
  id: number;
  clientName: string;
  mwh: number;           // garanterad MWh/mån
  pricePerMwh: number;   // fast pris kr/MWh
  monthsLeft: number;
  termTotal: number;
  defaultRisk: number;
}

export interface EnergyMeta {
  subType: "sol" | "vind";
  installedMW: number;
  capacityFactor: number;   // 0–1 effektivitetskvot
  ppaContracts: PpaContract[];
  degradationPct: number;   // kumulativ kapacitetsförsämring %
  subsidyActive: boolean;   // elcertifikat
  commissionedAbs?: number; // absolut månad idrifttagning (for 15 yr subsidy)
}

export interface ThroughputContract {
  id: number;
  clientName: string;
  clientProfile: LogisticsClientProfile;
  guaranteedM3: number;   // min genomflöde per månad
  ratePerM3: number;      // kr per m³
  monthsLeft: number;
  termTotal: number;
  penaltyRisk: number;    // sannolikhet att missa SLA
  defaultRisk: number;    // sannolikhet att klienten går i konkurs
  requiresKyl?: boolean;  // kräver kylkedja-uppgradering
}

export interface LogisticsMeta {
  totalBays: number;
  automationLevel: 0 | 1 | 2 | 3;
  throughputContracts: ThroughputContract[];
  peakSurchargeActive: boolean;
}

export interface IndustryAsset {
  id: number;
  sector: IndustrySectorKey;
  name: string;
  district: string;
  districtName: string;
  /** Tomtruta på stadskartan (hotell/logistik – stadsbyggnader). */
  parcelId?: string;
  /** Fast energiläge utanför rutnätet (sol-/vindparker, se ENERGY_SITES). */
  siteId?: string;
  purchasePrice: number;
  condition: number;       // 0–100, samma skala som Property
  upgrades: string[];
  managed: boolean;
  insurance: boolean;
  status: "klar" | "bygger";
  buildLeft: number;
  monthlyRevenue: number;  // senaste simulerade månaden
  monthlyOpex: number;     // senaste simulerade månaden
  totalRevenue: number;    // livstidsackumulering
  txHistory: TxRecord[];
  hotelMeta: HotelMeta | null;
  energyMeta: EnergyMeta | null;
  logisticsMeta: LogisticsMeta | null;
}

export interface IndustryUpgrade {
  id: string;
  sector: IndustrySectorKey | "all";
  name: string;
  cost: number;          // bråkdel av currentValue
  desc: string;
  revenueBoost?: number;
  opexCut?: number;
  condBoost?: number;
  valueBoost?: number;
  capacityBoost?: number;
}

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
  /** Byggtid i månader – effekten landar först när tiden gått. */
  months?: number;
}

/** Beställt arbete på en fastighet: betalt vid beställning, effekten
 *  landar vid månadsskiftet när monthsLeft når noll. Hyresgästerna bor
 *  kvar och betalar hyra under tiden (ingen "bygger"-status). */
export type PendingWorkKind = "underhåll" | "energi" | "uppgradering" | "kampanj" | "ändrad_användning";
export interface PendingWork {
  kind: PendingWorkKind;
  monthsLeft: number;
  /** Vilken uppgradering (kind === "uppgradering"). */
  upgradeId?: string;
  /** Ny fastighetstyp (kind === "ändrad_användning"). */
  targetType?: PropTypeKey;
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
  consecutiveMonths?: number;
  isAnchor?: boolean;
  /** Nöjdhet 0–100 (U3): driver förnyelser, förtida flytt och rekommendationer. */
  satisfaction?: number;
  /** Signerad med ankaravtal (U5): rabatterad hyra, lyfter hela kvarteret. */
  anchorDeal?: boolean;
  /** Kommersiell hyresgäst som expanderat i högkonjunktur (+15 % hyra, en gång). */
  expanded?: boolean;
  /** Namngiven "notabel" hyresgäst (NOTABLE_TENANTS) – ett ansikte med en
   *  historia som flyttar in, växer och stannar lojal eller lämnar i vredesmod. */
  notableId?: string;
}

/** Ett inkommande erbjudande: oombett uppköpsbud ("buyout"), bud på en
 *  utannonserad fastighet ("listing") eller på ett helt säljpaket ("paket"). */
export interface Offer {
  id: number;
  kind: "buyout" | "listing" | "paket";
  propId: number;
  propLabel: string;
  districtName: string;
  from: string;
  amount: number;
  expiresIn: number;
  /** Paketbud: alla fastigheter som ingår. */
  propertyIds?: number[];
  packageId?: number;
}

/** Kommunalt infrastrukturprojekt: annonseras vid byggstart och lyfter
 *  distriktets områdesutveckling permanent när det invigs. */
export interface InfraProject {
  id: number;
  name: string;
  district: string;
  districtName: string;
  monthsLeft: number;
  totalMonths: number;
  boost: number;
}

/** Ett säljpaket: flera fastigheter som annonseras som en portfölj –
 *  institutionella köpare gillar volym och betalar paketpremie. */
export interface SalePackage {
  id: number;
  name: string;
  propertyIds: number[];
  ask: number;
  listedAbs: number;
}

/** Karaktärerna i berättelseläget – nycklar till porträtten i breven. */
export type PortraitId = "morfar" | "ekelof" | "rogge" | "gosta" | "ulla";

/** Ett val som spelaren måste ta ställning till innan spelet kan gå vidare. */
export interface PendingDecision {
  id: string;
  title: string;
  text: string;
  options: DecisionOption[];
  /** Avsändarens porträtt (berättelselägets brev). */
  portrait?: PortraitId;
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
  takeoverPressure?: number; // delta (positive = increase, negative = decrease)
  gameOver?: boolean;
  /** Justering av en pågående detaljplansprocess (t.ex. förlikning). */
  planSettle?: { blockId: string; monthsDelta: number };
  /** Kedjning: id på nästa skriptade beslut (slås upp i story-tabellen). */
  nextDecisionId?: string;
  /** Story-flagga som sätts när alternativet väljs. */
  storyFlag?: string;
  log: string;
  logKind: LogKind;
}

/** Svårighetsgrad – påverkar startvillkor i Friläge och scenarier
 *  (berättelseläget har sin egen balans och undantas). */
export type DifficultyId = "lätt" | "normal" | "svår" | "custom";

/** Startalternativ för ett nytt spel (Friläge-anpassning + svårighet).
 *  Ren data – följer med RESET-actionen och är sparbar. */
export interface InitOptions {
  /** Startkapital i kronor. */
  cash?: number;
  /** Startränta i procent. */
  interestRate?: number;
  /** Antal rivaler (0 till alla i AI_NAMES). */
  rivalCount?: number;
  /** Rivalernas styrka: ×kassa och ×portföljstorlek (0.7 / 1 / 1.4). */
  rivalStrength?: number;
  /** Lugnt läge: inga slumphändelser, lågkonjunkturer eller kriser. */
  calmMode?: boolean;
  /** Konkurs avstängd – kassan kan gå hur djupt som helst. */
  noBankruptcy?: boolean;
  difficulty?: DifficultyId;
  /** Slumpfrö för reproducerbart parti (default: tidsstämpel). */
  seed?: number;
}

/** Spelinställningar som måste följa med sparfilen (simuleringen läser dem). */
export interface GameSettings {
  difficulty: DifficultyId;
  calmMode?: boolean;
  noBankruptcy?: boolean;
}

/** Berättelseläget "Arvet efter morfar" – ren, sparbar data. */
export interface StoryState {
  /** Aktiv beat (id i STORY_BEATS). */
  beat: string;
  /** Satta flaggor (val spelaren gjort, utförda injects m.m.). */
  flags: string[];
  /** Fryspåse-säkerhetsnätet får bara användas en gång. */
  bailoutUsed?: boolean;
  /** Kampanjen avklarad – spelet fortsätter fritt. */
  done?: boolean;
}

/** Ett pågående stadsdelsprojekt: ett helägt kvarter rivs och byggs om
 *  till ett signaturkvarter med vald arkitektprofil (cityProjects.ts). */
export interface CityProject {
  blockId: string;
  /** Arkitektprofil (kontorskluster/bostadskvarter/kulturstråk). */
  profile: string;
  district: string;
  monthsLeft: number;
  totalMonths: number;
  cost: number;
}

/** En pågående egen detaljplansprocess på köpt råmark. */
export interface PlanProcess {  blockId: string;
  district: string;
  districtName: string;
  /** Samråd → granskning → (ev. överklagad) → laga kraft vid 0 mån. */
  stage: "samråd" | "granskning" | "överklagad";
  monthsLeft: number;
  totalMonths: number;
  /** Nedlagda plankostnader (för tomternas bokförda värde). */
  spent: number;
  /** Utmaningar som redan inträffat (för att inte upprepas). */
  challenges: string[];
  /** Tomter som skänkts som park i en eftergift (ingår ej i planen). */
  parkParcels?: string[];
}

/** En transaktion i fastighetens historik. */
export interface TxRecord {
  type: "bought" | "sold" | "built";
  price: number;
  month: number;
  year: number;
  party: string;
}

/** Konfiguration för en anställd förvaltare på en enskild fastighet. */
export interface ManagerSettings {
  /** Skicknivå (0-100) som utlöser auto-underhåll. Standard 45. */
  maintainThreshold: number;
  /** Hyresmål som bråkdel av marknadshyran, t.ex. 1.05 = 105 %. Standard 1.0. */
  rentTargetPct: number;
  /** Lägsta hyresgästkvalitet förvaltaren signerar (0 = alla). Standard 0.8. */
  minTenantQuality?: number;
}

/** En fastighet (till salu eller ägd). */
export interface Property {
  id: number;
  district: string;
  districtName: string;
  /** Tomtruta på stadskartan (sätts av placeCity när objektet är synligt). */
  parcelId?: string;
  type: PropTypeKey;
  typeLabel: string;
  area: number;
  condition: number;
  askPrice: number;
  baseRent: number;
  purchasePrice?: number;
  /** Ackumulerade förbättrings- och omkostnader efter förvärvet
   *  (underhåll, uppgraderingar, energiåtgärder, projekt).
   *  Yield on cost = driftnetto / (inköpspris + capexTotal). */
  capexTotal?: number;
  /** Utannonserad till försäljning: köpare hittas i takt med skick,
   *  uthyrningsgrad och avkastning. packageId = del av säljpaket. */
  forSale?: { ask: number; listedAbs: number; packageId?: number };
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
  txHistory?: TxRecord[];
  managerSettings?: ManagerSettings;
  shortTerm?: boolean;
  pendingZoneChange?: { targetType: PropTypeKey; monthsLeft: number };
  builtYear?: number;
  energyClass?: "A" | "B" | "C" | "D" | "E" | "F";
  insurance?: boolean;
  /** Ursprungspris innan marknadspåslag vid avslöjande ur världspoolen –
   *  återställs vid utgång så priset inte inflateras vid varje ny listning. */
  poolAskPrice?: number;
  poolBaseRent?: number;
  /** Absolutmånad då säljaren senast avvisade ett bud – spärrar budspam. */
  bidRejectedAbs?: number;
  /** Förortsmodellen: fastigheten är ETT HELT KVARTER med flera huskroppar
   *  och fler hyresgästplatser – köps, säljs och förvaltas som en enhet. */
  wholeBlock?: boolean;
  /** Pågående utvecklingsprojekt (status "bygger" med befintligt hus). */
  renovation?: { kind: RenovationKind; targetCapacity?: number };
  /** Antal genomförda utbyggnadsprojekt (påbyggnad/nybyggnation). Höjer
   *  byggnaden synligt på 3D-kartan så stadens utveckling går att följa. */
  devLevel?: number;
  /** Utgångshyra som andel av marknadshyran (0.8–1.3, standard 1.0).
   *  Styr hur många och hur bra ansökningar som kommer in. */
  askRentPct?: number;
  /** Inkomna hyresansökningar som väntar på besked. */
  applications?: Application[];
  /** Bostadskö-läget (U6): reglerad hyra −20 % men noll vakans och goodwill. */
  regulated?: boolean;
  /** Mäklaruppdrag (U8): månadsarvode vid vakans, garanterat kvalificerat flöde. */
  brokerMandate?: boolean;
  /** Berättelseläget: "arvet" = morfars hus, "revansch" = grannhuset i kap 7. */
  storyTag?: string;
  /** Signaturkvarter (stadsdelsprojekt): profil-id. Fastigheten ÄR ett helt
   *  kvarter byggt av spelaren – ritas med egen kvartersarkitektur i 3D. */
  signature?: string;
  /** Beställda arbeten (underhåll, uppgraderingar, kampanjer …) som får
   *  effekt först vid kommande månadsskiften. */
  pendingWorks?: PendingWork[];
}

/** Utvecklingsprojekt: totalrenovering, påbyggnad, lokalanpassning
 *  (ändrar antalet lokaler – single- vs multi-tenant) eller rivning &
 *  nybyggnation (livscykel: föråldrat hus rivs och ersätts av ett nytt). */
export type RenovationKind = "totalrenovering" | "påbyggnad" | "lokalanpassning" | "nybyggnation";

/** Kontraktspaket vid signering av ny hyresgäst. */
export type ContractKind = "kort" | "standard" | "långt" | "ankare";

/**
 * Bolagspolicy – företagsledarens styrdokument. Policys sätter standarder
 * för hela portföljen; inställningar på enskilda fastigheter går alltid
 * före. Automatisk VERKSTÄLLighet kräver rätt chef i organisationen:
 * uthyrning/inkorg → portföljdirektören, ekonomi → CFO,
 * skydd/energi → förvaltningschefen.
 */
export interface CompanyPolicy {
  /** Standard utgångshyra för fastigheter utan egen inställning (0.8–1.3). */
  askRentPct?: number;
  /** Direktören accepterar automatiskt bästa ansökan ≥ kvalitetskravet. */
  autoAccept?: { enabled: boolean; minQuality: number; contract: ContractKind };
  /** Ansökningar under denna kvalitet avslås automatiskt. */
  rejectBelowQuality?: number;
  /** CFO amorterar automatiskt ned mot mål-LTV när kassan tillåter. */
  autoAmort?: { enabled: boolean; ltvTarget: number; cashFloor: number };
  /** Förvaltningschefen försäkrar automatiskt fastigheter över värdegränsen. */
  autoInsure?: { enabled: boolean; minValue: number };
  /** Förvaltningschefen energiuppgraderar mot målklassen när kassan tillåter. */
  autoEnergy?: { enabled: boolean; targetClass: "A" | "B"; cashFloor: number };
}

/** En inkommen ansökan om att hyra – väntar på spelarens besked. */
export interface Application {
  id: number;
  tenant: Tenant;
  /** Absolut månad då ansökan dras tillbaka. */
  expiresAbs: number;
  /** Kedjor/myndigheter kan erbjudas ankaravtal (U5). */
  anchorEligible?: boolean;
}

/** Rivalens långsiktiga mål – syns i Topp-listan och styr beteendet. */
export interface CompetitorAgenda {
  kind: "district" | "units" | "equity";
  district?: string;
  target: number;
  label: string;
  /** Har "målet nått"-nyheten redan publicerats? */
  announced?: boolean;
}

/** Pågående detaljplaneauktion – pausar spelet tills den avgjorts. */
export interface Auction {
  blockId: string;
  district: string;
  districtName: string;
  /** Antal tomter som ingår i detaljplanen. */
  parcels: number;
  minBid: number;
  currentBid: number;
  /** null = inga bud än; "player" eller rivalens namn. */
  leader: string | null;
  round: number;
}

/** En byggbar tomt. */
export interface Lot {
  id: number;
  district: string;
  districtName: string;
  /** Tomtruta på stadskartan (sätts av placeCity). */
  parcelId?: string;
  area: number;
  price: number;
  owned?: boolean;
  listedMonth?: number;
  expiresMonth?: number;
}

export type CompetitorStrategy = "tillväxt" | "utdelning" | "värde" | "distrikt";

/** En AI-konkurrent. */
export interface Competitor {
  name: string;
  cash: number;
  units: number;
  equity: number;
  lastBuy?: string;
  monthlyNOI?: number;
  portfolio: Property[];
  strategy?: CompetitorStrategy;
  preferredDistrict?: string;
  agenda?: CompetitorAgenda;
  /** Internationell fond: kliver in i slutspelet, hålls kapitaliserad
   *  i nivå med spelaren och tävlar aggressivt om varje affär. */
  institutional?: boolean;
  /** Rivalens industritillgångar (hotell, energi, logistik) – konkurrerar
   *  på industrimarknaden och följer med vid förvärv/fusion. */
  industries?: IndustryAsset[];
}

/** Bransch på börsen. */
export type Sector = "fastighet" | "bank" | "bygg" | "handel" | "industri";

/** En bolagsspecifik nyhet i aktiens egen nyhetshistorik (detaljvyn). */
export interface StockNews {
  text: string;
  day: number;
  month: number;
  year: number;
  dir: "up" | "down" | "flat";
}

/** Ett börsnoterat bolag. */
export interface Stock {
  id: string;
  name: string;
  sector: Sector;
  price: number;
  prevPrice: number;       // gårdagens kurs (intradagsförändring + flash)
  monthClose?: number;     // kurs vid senaste månadsstängning (månadsförändring)
  targetPrice?: number;    // månadens fundamentala ankare – intradagsvandringen dras hit
  sharesOutstanding: number;
  owned: number;
  avgCost: number;
  dividendYield: number;   // årlig
  beta: number;            // känslighet mot marknadssentiment
  drift: number;           // grundtrend per månad
  volatility: number;
  history: number[];       // senaste (månads-)priserna
  competitorName?: string; // länk till en Competitor om det är en rival
  eps?: number;          // earnings per share (quarterly)
  analystRating?: "Buy" | "Hold" | "Sell";
  targetKurs?: number;   // analytikernas riktkurs
  shortQty?: number;     // player's short position (shares)
  shortAvgPrice?: number;
  newsHistory?: StockNews[]; // bolagsspecifik nyhetshistorik (detaljvyn)
  listedYear?: number;   // för "NY"-märke på nynoteringar
  listedMonth?: number;
  delisting?: number;    // månader kvar till avnotering (om markerad)
  rivalPrevUnits?: number; // föregående månads bestånd – för kausala rivalnyheter
  rivalPrevNOI?: number;   // föregående månads driftnetto
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

/** Bestående relationer (favör ↔ agg, −100…100) till rivaler, banker
 *  och kommunen. Neutralt (0/utelämnat) är utgångsläget. */
export interface Standing {
  /** Per rivalbolag (nyckel = konkurrentens namn). */
  rivals?: Record<string, number>;
  bank?: number;
  city?: number;
}

/** En rad i händelseloggen. */
export interface LogEntry {
  t: string;
  kind: LogKind;
  /** Tomtruta händelsen gäller – gör den lokaliserbar på 3D-kartan. */
  parcelId?: string;
  /** Rivalbolag händelsen rör – ger ett ansikte (porträtt) i toast/nyheter. */
  rival?: string;
  /** Datumstämpel ("June 2000") satt när posten läggs till – ger loggen och
   *  tidningen en verklig tidslinje. Sätts centralt i gameStore.dispatch. */
  at?: string;
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

/** En tillgänglig långivare. */
export interface Lender {
  id: string;
  name: string;
  desc: string;
  rateBonus: number;
  ltvBonus: number;
  minReputation: number;
}

/** Lånevillkor härledda ur reputation. */
export interface LoanTerms {
  rate: number;
  spread: number;
  maxLtv: number;
}

/** Konjunkturcykel – styr marknadspriser och efterfrågan. */
export interface MarketCycle {
  phase: "boom" | "stable" | "bust";
  monthsRemaining: number;
}

/** En kontraktsförnyelse som väntar på spelarens beslut. */
export interface PendingRenewal {
  propertyId: number;
  tenantId: number;
  tenantName: string;
  districtName: string;
  currentRent: number;
  termTotal: number;
}

/** Ett aktiv konkurrentbud på en annonserad fastighet. */
export interface CompetingBid {
  listingId: number;
  rivalName: string;
  amount: number;
  expiresAbs: number;
  /** Budkrig: vilken runda vi är i (1, 2, 3 …). Rivaler höjer per runda. */
  round?: number;
}

/** En emitterad företagsobligation. */
export interface Bond {
  id: string;
  amount: number;
  rate: number;
  matureAbs: number;
}

/** Inställningar för den globala portföljdirektören. */
export interface GlobalManagerSettings {
  active: boolean;
  minCondition: number;      // auto-maintain below this (default 40)
  minTenantQuality: number;  // auto-accept tenants with quality >= this (default 0.8)
  rentTargetPct: number;     // lease renewal target fraction (default 1.0)
}

/** Hela speltillståndet. */
export interface GameState {
  /** Ursprungsfröet för partiets slump (satt vid start). Bevaras för replay. */
  seed?: number;
  /** Aktuellt PRNG-tillstånd. Seedas/läses av dispatch-boundaryn i gameStore
      så att samma frö + samma händelsesekvens ger identiskt utfall. */
  rng?: number;
  /** Dag i månaden (1..antal dagar i månaden). Kalendern rullar dag för dag
      för mjukt flöde; den tunga ekonomin räknas fortfarande per månad i
      advanceMonth. Se engine/date.ts för kalenderkonvertering (spelår 1 =
      2000). */
  day: number;
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
  /** Aktiva säljpaket (portföljförsäljningar). */
  salePackages?: SalePackage[];
  /** Pågående kommunala infrastrukturprojekt. */
  infraProjects?: InfraProject[];
  /** Pågående stadshändelse (mässa, strejk, elkris …) – en i taget. */
  cityEvent?: { id: string; name: string; monthsLeft: number };
  /** Månadsstatistik för Statistik-panelen (rullande 120 månader). */
  statsHistory?: { abs: number; equity: number; noi: number; cash: number; portfolio: number; bestRival: number }[];
  /** Fastighetskris: månader kvar av kraschen (0/undefined = ingen kris). */
  crisisMonthsLeft?: number;
  /** Pågående megaprojekt (prestige-slutspel). */
  megaActive?: { projectId: string; blockId: string; district: string; monthsLeft: number; totalMonths: number }[];
  /** Färdigställda megaprojekt (projekt-id:n). */
  megaCompleted?: string[];
  /** Pågående stadsdelsprojekt: helägda kvarter som rivs och byggs om. */
  cityProjects?: CityProject[];
  /** Färdigställda signaturkvarter (kvarter + arkitektprofil). */
  signatureBlocks?: { blockId: string; profile: string }[];
  /** Ägarens privata förmögenhet – byggs av utdelningar. */
  ownerWealth?: number;
  /** Ägarens köpta lyx och donationer (lyx-id:n). */
  ownerLuxuries?: string[];
  /** Planområden (råmark) som spelaren köpt men ännu inte planlagt. */
  ownedPlanAreas?: string[];
  /** Pågående egna detaljplansprocesser. */
  planProcesses?: PlanProcess[];
  /** Tomter där dekorhus vuxit fram organiskt under spelets gång. */
  ambientGrown?: string[];
  /** Tomter avstådda som park (strandskydd m.m.) – bebyggs aldrig. */
  parkParcels?: string[];
  /** Absolutmånad då senaste detaljplaneauktionen startade. */
  lastAuctionAbs?: number;
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
  selectedLender?: string;
  globalManager?: GlobalManagerSettings;
  scenarioId?: ScenarioId;
  gameWon?: boolean;
  /** Bolagets namn (väljs vid nytt spel). */
  companyName?: string;
  /** Bolagsnivå 1–6 – höjs via UPGRADE_COMPANY, sjunker aldrig. */
  companyLevel?: number;
  /** Nivå som spelaren redan fått "redo att expandera"-hint för. */
  levelUpOfferedFor?: number;
  /** Helägda kvarter (för att upptäcka nya och fira dem). */
  ownedBlocks?: string[];
  /** Expansionskvarter som auktionerats ut och öppnats. */
  unlockedBlocks?: string[];
  /** Pågående detaljplaneauktion. */
  auction?: Auction | null;
  /** Senaste ESG-betyg (A–F) – för att upptäcka förändringar. */
  esgRating?: string;
  /** Senaste publika hyresgästbetyg (A–F) – för att upptäcka bandbyten. */
  tenantScoreLetter?: string;
  /** Bestående relationer till rivaler, banker och kommunen. */
  standing?: Standing;
  /** Distriktens nuvarande statusnivå (för att upptäcka byten). */
  districtTiers?: Record<string, string>;
  /** Bolagspolicy – portföljstandarder med per-fastighet-överstyrning. */
  policy?: CompanyPolicy;
  recessionMonthsLeft?: number;
  rateMode?: "variable" | "fixed";
  fixedRate?: number;
  fixedUntilAbs?: number;
  revolving?: { limit: number; used: number };
  dividendsPaid?: number;
  advisors?: string[];
  ipoActive?: boolean;
  ipoLastQuarterlyNOI?: number;
  competingBid?: CompetingBid;
  bonds?: Bond[];
  politicalCycle?: number;
  electionResult?: string;
  milestones?: string[];
  prevEquity?: number;
  insuranceCost?: number;
  marketCycle?: MarketCycle;
  /** Absolutmånad (år*12+månad) då senaste PR-kampanjen köptes – cooldown. */
  lastPrMonth?: number;
  /** Avklingande "presstemperatur": höjs vid vräkningar/stora hyreshöjningar,
   *  faller långsamt varje månad. Driver risken för en skandalhändelse. */
  pressHeat?: number;
  /** Absolutmånad då senaste skandalen bröt ut – cooldown mot nästa. */
  lastScandalMonth?: number;
  pendingRenewals?: PendingRenewal[];
  totalTaxPaid?: number;
  tutorialDismissed?: boolean;
  saveSlot?: number;
  debtMatureAbs?: number;
  ipoShares?: { total: number; public: number };
  takeoverPressure?: number;
  ipoPrice?: number;
  industryPortfolio?: IndustryAsset[];
  industryListings?: IndustryAsset[];
  energyOwnedMW?: number;
  hotelHighOccConsecutiveMonths?: number;
  /** Berättelseläget "Arvet efter morfar" (null/undefined = vanligt spel). */
  story?: StoryState | null;
  /** Svårighet + Friläge-anpassningar (undefined = normal utan anpassningar). */
  settings?: GameSettings;
}

/** Alla actions som reducern hanterar. */
export type GameAction =
  | { type: "BUY"; id: number }
  | { type: "PLACE_BID"; id: number; amount: number }
  | { type: "SELL"; id: number }
  | { type: "UPGRADE"; id: number; upg: string }
  | { type: "LEASE"; id: number }
  | { type: "LEASE_ALL" }
  | { type: "MAINTAIN_ALL"; threshold: number }
  | { type: "RENEW_ALL"; monthsLeft: number }
  | { type: "MANAGE_ALL"; managed: boolean }
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
  | { type: "LIST_FOR_SALE"; id: number; ask: number }
  | { type: "COUNTER_OFFER"; offerId: number; amount: number }
  | { type: "UNLIST"; id: number }
  | { type: "LIST_PACKAGE"; ids: number[]; ask: number }
  | { type: "UNLIST_PACKAGE"; packageId: number }
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
  | { type: "OFFER_TO_RIVAL"; competitorName: string; propertyId: number; amount: number }
  | { type: "SELECT_LENDER"; lenderId: string }
  | { type: "BID_OFFMARKET"; propertyId: number; amount: number }
  | { type: "SET_MANAGER_SETTINGS"; id: number; settings: ManagerSettings }
  | { type: "SET_GLOBAL_MANAGER"; settings: GlobalManagerSettings }
  | { type: "ACQUIRE_RIVAL"; competitorName: string; amount: number }
  | { type: "SNOOZE_DECISION" }
  | { type: "SET_SCENARIO"; scenarioId: ScenarioId }
  | { type: "SET_RATE_MODE"; mode: "variable" | "fixed"; months?: number }
  | { type: "DRAW_REVOLVING"; amount: number }
  | { type: "REPAY_REVOLVING"; amount: number }
  | { type: "PAY_DIVIDEND"; amount: number }
  | { type: "START_MEGA"; projectId: string }
  | { type: "START_CITY_PROJECT"; blockId: string; profile: string }
  | { type: "BUY_LUXURY"; luxuryId: string }
  | { type: "BUY_AMBIENT"; parcelId: string }
  | { type: "BUY_RAW_LAND"; blockId: string }
  | { type: "START_PLAN"; blockId: string }
  | { type: "TOGGLE_SHORT_TERM"; id: number }
  | { type: "APPLY_ZONE_CHANGE"; id: number; targetType: PropTypeKey }
  | { type: "INVEST_DISTRICT"; districtId: string; amount: number }
  | { type: "DO_IPO" }
  | { type: "BUY_INSURANCE"; id: number }
  | { type: "CANCEL_INSURANCE"; id: number }
  | { type: "ISSUE_BOND"; amount: number; years: number }
  | { type: "REPAY_BOND"; bondId: string }
  | { type: "SALE_LEASEBACK"; id: number }
  | { type: "ACCEPT_COMPETING_BID" }
  | { type: "PASS_COMPETING_BID" }
  | { type: "IMPROVE_ENERGY"; id: number }
  | { type: "NEGOTIATE_RENEWAL"; propertyId: number; tenantId: number; action: "raise" | "keep" | "lower" | "evict" }
  | { type: "DISMISS_TUTORIAL" }
  | { type: "MARKET_ORDER"; stockId: string; side: "buy" | "sell"; qty: number }
  | { type: "SHORT_STOCK"; stockId: string; qty: number }
  | { type: "COVER_SHORT"; stockId: string }
  | { type: "BUY_INDUSTRY"; id: number }
  | { type: "BUY_INDUSTRY_FROM_RIVAL"; competitorName: string; industryId: number; amount: number }
  | { type: "SELL_INDUSTRY"; id: number }
  | { type: "UPGRADE_INDUSTRY"; id: number; upg: string }
  | { type: "MAINTAIN_INDUSTRY"; id: number }
  | { type: "ADD_PPA"; assetId: number; contract: PpaContract }
  | { type: "CANCEL_PPA"; assetId: number; contractId: number }
  | { type: "ADD_THROUGHPUT_CONTRACT"; assetId: number; contract: ThroughputContract }
  | { type: "SET_HOTEL_CHANNEL"; assetId: number; channels: BookingChannel[] }
  | { type: "TOGGLE_INDUSTRY_MANAGER"; id: number }
  | { type: "BUY_INDUSTRY_INSURANCE"; id: number }
  | { type: "NEXT_DAY" }
  | { type: "NEXT_MONTH" }
  | { type: "LOAD"; state: GameState }
  | { type: "SET_COMPANY_NAME"; name: string }
  | { type: "UPGRADE_COMPANY" }
  | { type: "BUY_PR" }
  | { type: "START_RENOVATION"; id: number; kind: RenovationKind; targetCapacity?: number }
  | { type: "REDEVELOP"; id: number }
  | { type: "SET_ASK_RENT"; id: number; pct: number }
  | { type: "ACCEPT_APPLICATION"; id: number; applicationId: number; contract: ContractKind }
  | { type: "REJECT_APPLICATION"; id: number; applicationId: number }
  | { type: "TOGGLE_REGULATED"; id: number }
  | { type: "TOGGLE_BROKER"; id: number }
  | { type: "SET_POLICY"; policy: Partial<CompanyPolicy> }
  | { type: "AUCTION_BID" }
  | { type: "AUCTION_PASS" }
  | { type: "RESET"; scenarioId?: ScenarioId; companyName?: string; mode?: "story"; options?: InitOptions }
  | { type: "FOUND_NOTE"; id: string };
