/* ============================================================
   Redaktionen – rena härledda hjälpfunktioner som gör tidningen
   användbar: en redaktionell rådgivare ("The Post's View"), en
   marknadsprognos, kommande rubriker (förvarning) och skandaler.
   Inga React-beroenden, inga sidoeffekter – allt härleds ur GameState
   så att tidningen kan navigera, varna och driva spelet framåt.
   ============================================================ */

import { DISTRICTS } from "./data";
import { districtTier, nextDistrictTier } from "./districtTiers";
import { esgRatingOf } from "./esg";
import { equityOf, loanTerms, ltvOf } from "./finance";
import { orgLoadOf } from "./company";
import type { GameState, LogEntry } from "./types";

/** En redaktionell notis: kort handlingsinriktad prosa med ett navmål. */
export interface EditorNote {
  id: string;
  /** Rubrikliknande etikett (versaliseras i UI). */
  kicker: string;
  text: string;
  /** uiStore-fönster att öppna vid klick (t.ex. "finance", "tenants"). */
  target?: string;
  /** Distrikt-id att zooma till i stället för ett fönster. */
  district?: string;
  /** Högre = mer akut; styr sortering och urval. */
  priority: number;
}

const MSEK = (n: number) => `${(n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })} MSEK`;

/** Var en artikel leder vid klick – gör tidningen till en navigeringsyta. */
export type NavIntent =
  | { type: "parcel"; parcelId: string }
  | { type: "open"; window: string }
  | { type: "district"; district: string };

const KEYWORD_TARGETS: [RegExp, string][] = [
  [/\b(rate|bank|loan|covenant|amort|refinanc|bond|leverage|debt|credit)\b/i, "finance"],
  [/\b(stock|share|ipo|dividend|exchange|listing on|analyst)\b/i, "stocks"],
  [/\b(tenant|lease|vacancy|evict|rent|renewal|occupanc)\b/i, "tenants"],
  [/\b(auction|zoning|detailed plan|plan process|adopted)\b/i, "districts"],
  [/\b(for sale|listed|off-market|acquired|bought|sold|listing)\b/i, "market"],
  [/\b(esg|energy class|green loan)\b/i, "finance"],
];

/**
 * Vart en loggpost pekar när läsaren klickar. Prioriterar en konkret
 * fastighet (parcelId), sedan ett rivalbolag, sedan ett distriktsnamn i
 * texten, och faller till en nyckelordskarta mot rätt fönster.
 */
export function articleTarget(entry: LogEntry, _state?: GameState): NavIntent | null {
  if (entry.parcelId) return { type: "parcel", parcelId: entry.parcelId };
  if (entry.rival) return { type: "open", window: "rivals" };
  const t = entry.t;
  // Distriktsnamn nämnt i rubriken → zooma dit.
  const d = DISTRICTS.find((x) => t.includes(x.name));
  if (d) return { type: "district", district: d.id };
  for (const [re, win] of KEYWORD_TARGETS) if (re.test(t)) return { type: "open", window: win };
  return null;
}

/** Portföljens vakans (0–1) räknat på färdiga fastigheter. */
function portfolioVacancy(state: GameState): number {
  const done = state.portfolio.filter((p) => p.status === "klar");
  const cap = done.reduce((a, p) => a + p.capacity, 0);
  const occ = done.reduce((a, p) => a + p.tenants.length, 0);
  return cap > 0 ? 1 - occ / cap : 0;
}

/**
 * The Post's View: 1–3 handlingsinriktade råd härledda ur tillståndet.
 * Varje notis pekar mot fönstret/distriktet där spelaren kan agera, så att
 * tidningen blir en rådgivare snarare än en passiv logg. Sorteras efter
 * akutgrad; UI:t visar de främsta.
 */
export function editorNotes(state: GameState): EditorNote[] {
  const notes: EditorNote[] = [];
  const done = state.portfolio.filter((p) => p.status === "klar");

  // Hävstång: nära det bankmässiga taket är en sårbarhet.
  const ltv = ltvOf(state);
  const { maxLtv } = loanTerms(state);
  if (done.length > 0 && ltv >= maxLtv * 0.9) {
    notes.push({
      id: "leverage",
      kicker: "On leverage",
      text: `Gearing runs hot at ${Math.round(ltv * 100)}% loan-to-value — a single downturn could trip a covenant. Amortize or slow the buying.`,
      target: "finance",
      priority: ltv >= maxLtv ? 95 : 80,
    });
  }

  // Vakans: tomma lägenheter blöder.
  const vac = portfolioVacancy(state);
  if (done.length > 0 && vac >= 0.15) {
    notes.push({
      id: "vacancy",
      kicker: "On vacancy",
      text: `Nearly ${Math.round(vac * 100)}% of your units stand empty. Empty space earns nothing while it still costs to hold — lease up or trim rents.`,
      target: "tenants",
      priority: 70 + Math.round(vac * 30),
    });
  }

  // Kontraktsförnyelser: lås hyresgästerna innan de går.
  const renewals = state.pendingRenewals?.length ?? 0;
  if (renewals > 0) {
    notes.push({
      id: "renewals",
      kicker: "On leases",
      text: `${renewals} lease${renewals > 1 ? "s are" : " is"} up for renewal. Settle terms before a tenant walks and the unit turns cold.`,
      target: "tenants",
      priority: 60 + Math.min(20, renewals * 4),
    });
  }

  // Organisationen överbelastad: administrationen läcker.
  const load = orgLoadOf(state);
  if (load.over > 0) {
    notes.push({
      id: "orgload",
      kicker: "On management",
      text: `Your organization runs ${load.over} propert${load.over > 1 ? "ies" : "y"} over capacity — overhead leaks every month until you hire managers or delegate.`,
      target: "staff",
      priority: 50 + Math.min(25, load.over * 3),
    });
  }

  // ESG: svagt betyg fördyrar varje ny krona.
  const esg = esgRatingOf(state);
  if (done.length >= 3 && (esg.letter === "E" || esg.letter === "F")) {
    notes.push({
      id: "esg",
      kicker: "On green terms",
      text: `An ESG grade of ${esg.letter} adds a premium to every new loan. Energy upgrades would pay for themselves in cheaper capital.`,
      target: "finance",
      priority: 45,
    });
  }

  // Ledig kassa: marknaden belönar utplacerat kapital.
  const eq = equityOf(state);
  if (state.cash >= 8_000_000 && (eq <= 0 || state.cash / eq >= 0.35)) {
    notes.push({
      id: "idlecash",
      kicker: "On idle capital",
      text: `${MSEK(state.cash)} sits idle in the account. Cash on the sidelines loses ground to a market that rewards the deployed.`,
      target: "market",
      priority: 40,
    });
  }

  // Ett distrikt på väg upp ett steg: köp innan priset följer.
  const rising = DISTRICTS.map((d) => {
    const dev = state.districtDev?.[d.id] ?? 1;
    const tier = districtTier(state, d.id);
    const next = nextDistrictTier(tier);
    return next ? { d, dev, next, gap: next.min - dev } : null;
  })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.gap > 0 && x.gap <= 0.07)
    .sort((a, b) => a.gap - b.gap)[0];
  if (rising) {
    notes.push({
      id: `rising-${rising.d.id}`,
      kicker: "On the map",
      text: `${rising.d.name} is inching toward "${rising.next.name}" status. Buy before the reclassification lifts prices across the district.`,
      district: rising.d.id,
      priority: 42,
    });
  }

  return notes.sort((a, b) => b.priority - a.priority);
}

/**
 * Marknadsprognos: en enda mening som läser av cykeln och stämningen.
 * Härleds enbart (marketCycle + sentimentHistory) – ingen motorändring.
 */
export function marketForecast(state: GameState): string {
  const cycle = state.marketCycle;
  const hist = state.sentimentHistory ?? [];
  // Stämningstrend: jämför de senaste mätvärdena.
  const n = hist.length;
  const trend = n >= 3 ? hist[n - 1] - hist[n - 3] : 0;
  const rising = trend > 0.015;
  const falling = trend < -0.015;

  if (cycle?.phase === "boom") {
    if (cycle.monthsRemaining <= 4) return `Analysts expect the boom to cool within ${cycle.monthsRemaining} months.`;
    return falling ? "The boom looks tired — sentiment is slipping." : "Buyers stay hungry; the boom has room to run.";
  }
  if (cycle?.phase === "bust") {
    if (cycle.monthsRemaining <= 4) return `A recovery is penciled in within ${cycle.monthsRemaining} months.`;
    return rising ? "Green shoots appear — sentiment is firming off the bottom." : "The downturn grinds on; the cautious hold cash.";
  }
  if (rising) return "Sentiment is firming — a warmer market may be forming.";
  if (falling) return "Sentiment is softening; expect a cooler few months.";
  return "A steady market — no turn on the horizon.";
}
