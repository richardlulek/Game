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
import { msek } from "./format";
import { orgLoadOf } from "./company";
import { DOMINANCE_REVIEW_SHARE, districtShareOf } from "./lateGame";
import type { GameState, PendingDecision } from "./types";
import type { LogEntry } from "./types";

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

/** Ett känt-i-förväg framtidsspår: en händelse med ETA som ger läsaren
 *  en chans att positionera sig innan priserna rör sig. */
export interface UpcomingItem {
  id: string;
  /** Kort etikett (versaliseras i UI), t.ex. "PLAN PROCESS". */
  kicker: string;
  text: string;
  /** Distrikt-id att zooma till vid klick. */
  district?: string;
  /** Månader kvar (0 = pågår nu); styr sortering. */
  eta: number;
}

const districtName = (id: string): string => DISTRICTS.find((d) => d.id === id)?.name ?? id;
const moLeft = (n: number) => `${n} month${n === 1 ? "" : "s"}`;

/**
 * Kommande rubriker: händelser staden redan vet om – detaljplaner på väg
 * mot laga kraft, pågående signaturkvarter/megaprojekt/infrastruktur, en
 * öppen planauktion och distrikt som närmar sig ett statusbyte. Sorteras
 * efter ETA så det mest näraliggande ligger överst. Klick zoomar dit.
 */
export function upcomingHeadlines(state: GameState): UpcomingItem[] {
  const out: UpcomingItem[] = [];

  // Öppen planauktion – pågår nu.
  if (state.auction) {
    const a = state.auction;
    out.push({
      id: `auction-${a.blockId}`,
      kicker: "Auction",
      text: `A detailed-plan auction for ${a.districtName} is open now — ${a.parcels} lots on the block, leader ${a.leader ?? "none yet"}.`,
      district: a.district,
      eta: 0,
    });
  }

  // Egna detaljplaner på väg mot laga kraft.
  for (const p of state.planProcesses ?? []) {
    out.push({
      id: `plan-${p.blockId}`,
      kicker: "Plan process",
      text: `${p.districtName} detailed plan clears ${p.stage === "överklagad" ? "its appeal" : "review"} in ${moLeft(p.monthsLeft)} — new buildable land ahead.`,
      district: p.district,
      eta: p.monthsLeft,
    });
  }

  // Signaturkvarter under uppförande.
  for (const c of state.cityProjects ?? []) {
    out.push({
      id: `cityproj-${c.blockId}`,
      kicker: "Redevelopment",
      text: `A signature block is rising in ${districtName(c.district)} — completes in ${moLeft(c.monthsLeft)}.`,
      district: c.district,
      eta: c.monthsLeft,
    });
  }

  // Megaprojekt (slutspel).
  for (const m of state.megaActive ?? []) {
    out.push({
      id: `mega-${m.blockId}`,
      kicker: "Mega-project",
      text: `A landmark project in ${districtName(m.district)} is ${moLeft(m.monthsLeft)} from completion.`,
      district: m.district,
      eta: m.monthsLeft,
    });
  }

  // Kommunal infrastruktur som lyfter ett distrikt.
  for (const inf of state.infraProjects ?? []) {
    out.push({
      id: `infra-${inf.id}`,
      kicker: "Infrastructure",
      text: `${inf.name} in ${inf.districtName} opens in ${moLeft(inf.monthsLeft)}, lifting the district.`,
      district: inf.district,
      eta: inf.monthsLeft,
    });
  }

  // Distrikt nära ett statusbyte – en trend att köpa före.
  for (const d of DISTRICTS) {
    const dev = state.districtDev?.[d.id] ?? 1;
    const tier = districtTier(state, d.id);
    const next = nextDistrictTier(tier);
    if (!next) continue;
    const gap = next.min - dev;
    if (gap > 0 && gap <= 0.04) {
      out.push({
        id: `trend-${d.id}`,
        kicker: "District trend",
        text: `${d.name} is closing on "${next.name}" status ${next.icon} — values tend to follow a reclassification.`,
        district: d.id,
        eta: 90, // ingen exakt månad: sorteras efter de tidsbestämda.
      });
    }
  }

  return out.sort((a, b) => a.eta - b.eta).slice(0, 5);
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

/* ── Skandaler: när tidningen vänder sig mot dig ──────────────────── */

type ScandalKind = "tenants" | "vacancy" | "dominance";

/** Genomsnittlig hyresgästnöjdhet över hela beståndet (0 om tomt). */
function avgSatisfaction(state: GameState): number {
  const tenants = state.portfolio.flatMap((p) => p.tenants);
  if (tenants.length === 0) return 100;
  return tenants.reduce((a, t) => a + (t.satisfaction ?? 60), 0) / tenants.length;
}

/** Den starkaste skandalsignalen just nu, med en 0–1-vikt. */
function scandalSignal(state: GameState): { kind: ScandalKind; weight: number } {
  // Presstemperatur (vräkningar/hyreshöjningar) väger tyngst.
  const heat = (state.pressHeat ?? 0) / 20;
  const vac = portfolioVacancy(state);
  const share = Math.max(0, ...DISTRICTS.map((d) => districtShareOf(state, d.id)));
  const sat = avgSatisfaction(state);

  const tenantsW = Math.min(1, heat * 0.8 + (sat < 45 ? 0.25 : 0));
  const vacancyW = vac > 0.28 ? Math.min(1, (vac - 0.28) * 2.2) : 0;
  const dominanceW = share >= DOMINANCE_REVIEW_SHARE ? Math.min(1, (share - DOMINANCE_REVIEW_SHARE) * 2 + 0.3) : 0;

  const ranked = ([
    { kind: "tenants", weight: tenantsW },
    { kind: "vacancy", weight: vacancyW },
    { kind: "dominance", weight: dominanceW },
  ] as { kind: ScandalKind; weight: number }[]).sort((a, b) => b.weight - a.weight);
  return ranked[0];
}

/** Sammanlagd skandalrisk 0–1 – simuleringen jämför mot en tröskel. */
export function scandalRisk(state: GameState): number {
  return scandalSignal(state).weight;
}

/**
 * Skandalhistoria: bygger ett PendingDecision (serialiserbara effekter) med
 * tre utvägar — dementera billigt, köpa in en PR-byrå dyrt, eller strunta i
 * det och ta ryktesfallet. Flavor väljs efter den starkaste signalen.
 * Kostnaderna skalar med bolagets storlek. Ren funktion, ingen RNG.
 */
export function makeScandal(state: GameState): PendingDecision {
  const { kind } = scandalSignal(state);
  const level = state.companyLevel ?? 1;
  const statementCost = Math.round(120_000 * level);
  const prCost = Math.round(400_000 * level);

  const flavor: Record<ScandalKind, { title: string; text: string }> = {
    tenants: {
      title: "Tenants go to the press",
      text: "The Property Post runs a front-page story: evicted families and steep rent hikes across your buildings. The city is talking, and not kindly.",
    },
    vacancy: {
      title: "“Landlord lets it rot”",
      text: "A reporter counts the dark windows in your portfolio and calls you a warehouser of empty homes while the city needs housing. The photos are damning.",
    },
    dominance: {
      title: "Competition watchdog circles",
      text: "Commentators warn that one company now controls too much of a district. The Property Post asks whether it is time regulators stepped in.",
    },
  };

  const f = flavor[kind];
  return {
    id: "scandal",
    title: f.title,
    text: f.text,
    options: [
      {
        label: `Issue a statement (${msek(statementCost)})`,
        detail: `−${msek(statementCost)} · reputation −2`,
        effect: {
          cash: -statementCost,
          reputation: -2,
          log: "Issued a measured statement — the story loses some of its sting.",
          logKind: "warn",
        },
      },
      {
        label: `Hire a PR firm (${msek(prCost)})`,
        detail: `−${msek(prCost)} · reputation +1`,
        effect: {
          cash: -prCost,
          reputation: 1,
          log: "A PR firm reframed the story — the campaign all but erases the damage.",
          logKind: "info",
        },
      },
      {
        label: "Ignore it",
        detail: "reputation −8",
        effect: {
          reputation: -8,
          log: "Let the scandal run its course — the city remembers.",
          logKind: "warn",
        },
      },
    ],
  };
}
