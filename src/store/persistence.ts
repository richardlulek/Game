/* ============================================================
   Persistens – sparar/laddar speltillstånd i localStorage med
   versionshantering och migrering. Ersätter prototypens
   in-memory-lösning (window[SAVE_KEY]).
   ============================================================ */

import { placeCity } from "../engine/city";
import { DEFAULT_COMPANY_NAME, computedLevel } from "../engine/company";
import { agendaFor } from "../engine/initState";
import { syncIdCounter } from "../engine/random";
import { initStocks } from "../engine/stocks";
import type { GameState } from "../engine/types";

const SAVE_KEY_LEGACY = "fastighetsimperium:save"; // slot 1 (bakåtkompatibel nyckel)
const SAVE_KEY_PREFIX = "fastighetsimperium:save";
const ACTIVE_SLOT_KEY = "fastighetsimperium:slot";

function getSaveKey(slot: number): string {
  return slot === 1 ? SAVE_KEY_LEGACY : `${SAVE_KEY_PREFIX}:${slot}`;
}

export function getActiveSlot(): number {
  try { return Math.max(1, Math.min(3, parseInt(localStorage.getItem(ACTIVE_SLOT_KEY) ?? "1") || 1)); }
  catch { return 1; }
}

export function setActiveSlot(slot: number): void {
  try { localStorage.setItem(ACTIVE_SLOT_KEY, String(slot)); } catch { /* ignore */ }
}

export interface SlotInfo {
  slot: number;
  exists: boolean;
  savedAt?: string;
  year?: number;
  month?: number;
  equity?: number;
}

export function listSaveSlots(): SlotInfo[] {
  return [1, 2, 3].map((slot) => {
    try {
      const raw = localStorage.getItem(getSaveKey(slot));
      if (!raw) return { slot, exists: false };
      const parsed = JSON.parse(raw) as Partial<SaveFile>;
      // För gamla sparfiler (före stadskartan 3.0) visas som tomma.
      if ((typeof parsed.version === "number" ? parsed.version : 1) < MIN_SAVE_VERSION)
        return { slot, exists: false };
      const st = parsed.state as GameState | undefined;
      const equity = st
        ? Math.round(st.cash + (st.portfolio ?? []).reduce((a, p) => a + p.askPrice, 0) - st.debt)
        : undefined;
      return { slot, exists: true, savedAt: parsed.savedAt, year: st?.year, month: st?.month, equity };
    } catch {
      return { slot, exists: false };
    }
  });
}

/** Höj denna när sparfilsformatet ändras och lägg till en migrering nedan. */
export const SAVE_VERSION = 24;

/** Äldsta version som kan laddas. Stadskarta 3.0 (v19) ritade om
 *  distrikten i grunden – äldre sparfiler går inte att migrera. */
export const MIN_SAVE_VERSION = 19;

interface SaveFile {
  version: number;
  savedAt: string;
  state: GameState;
}

/**
 * Migreringar från en version till nästa. Nyckeln är versionen man migrerar
 * *från*. Exempel: migrations[1] tar en v1-sparfil och gör den till v2.
 */
const migrations: Record<number, (state: GameState) => GameState> = {
  // 1: (s) => ({ ...s, nyttFält: standardvärde }),
  2: (s) => ({
    ...s,
    portfolio: (s.portfolio as any[]).map((p: any) => ({
      ...p,
      tenants: p.tenant ? [p.tenant] : [],
      capacity: Math.min(4, Math.floor((p.area ?? 1000) / 1000) + 1),
      tenant: undefined,
    })),
    listings: (s.listings as any[]).map((p: any) => ({
      ...p,
      tenants: p.tenant ? [p.tenant] : [],
      capacity: Math.min(4, Math.floor((p.area ?? 1000) / 1000) + 1),
      tenant: undefined,
    })),
  }),
  3: (s) => ({
    ...s,
    offers: (s as any).offers ?? [],
    pendingDecision: (s as any).pendingDecision ?? null,
  }),
  4: (s) => ({
    ...s,
    stocks: (s as any).stocks ?? initStocks((s as any).competitors ?? []),
    marketSentiment: (s as any).marketSentiment ?? 1,
    sentimentHistory: (s as any).sentimentHistory ?? [1],
    subsidiaries: (s as any).subsidiaries ?? [],
    dividendsReceived: (s as any).dividendsReceived ?? 0,
  }),
  5: (s) => ({
    ...s,
    districtDev: (s as any).districtDev ?? { centrum: 1, hamnen: 1, industri: 1, förort: 1, kulle: 1 },
    buildCostMod: (s as any).buildCostMod ?? 1,
    researchDone: (s as any).researchDone ?? [],
    activeResearch: (s as any).activeResearch ?? null,
    staff: (s as any).staff ?? {},
  }),
  6: (s) => ({
    ...s,
    stockOrders: (s as any).stockOrders ?? [],
    portfolioValueHistory: (s as any).portfolioValueHistory ?? [0],
  }),
  7: (s) => ({
    ...s,
    listings: (s.listings ?? []).map((p: any) => ({
      ...p,
      listedMonth: p.listedMonth ?? 0,
      expiresMonth: p.expiresMonth ?? 9999,
    })),
    lots: (s.lots ?? []).map((l: any) => ({
      ...l,
      listedMonth: l.listedMonth ?? 0,
      expiresMonth: l.expiresMonth ?? 9999,
    })),
  }),
  8: (s) => ({
    ...s,
    competitors: (s.competitors ?? []).map((c: any) => ({
      ...c,
      portfolio: c.portfolio ?? [],
    })),
    worldPool: (s as any).worldPool ?? [],
    worldTotal:
      (s as any).worldTotal ??
      (s.portfolio ?? []).length +
        (s.listings ?? []).length +
        (s.competitors ?? []).reduce((a: number, c: any) => a + (c.units ?? 0), 0),
  }),
  9: (s) => {
    const STRATEGIES = ["tillväxt", "utdelning", "värde", "distrikt"] as const;
    const DISTRICTS_IDS = ["centrum", "hamnen", "industri", "förort", "kulle"];
    return {
      ...s,
      selectedLender: (s as any).selectedLender ?? undefined,
      competitors: (s.competitors ?? []).map((c: any, i: number) => ({
        ...c,
        strategy: c.strategy ?? STRATEGIES[i % STRATEGIES.length],
        preferredDistrict: c.preferredDistrict ?? (c.strategy === "distrikt" || STRATEGIES[i % STRATEGIES.length] === "distrikt" ? DISTRICTS_IDS[i % DISTRICTS_IDS.length] : undefined),
      })),
    };
  },
  10: (s) => ({
    ...s,
    globalManager: (s as any).globalManager ?? undefined,
  }),
  11: (s) => ({
    ...s,
    scenarioId: (s as any).scenarioId ?? "sandbox",
    gameWon: (s as any).gameWon ?? false,
    recessionMonthsLeft: (s as any).recessionMonthsLeft ?? 0,
  }),
  15: (s) => ({
    ...s,
    ipoShares: (s as any).ipoShares ?? undefined,
    takeoverPressure: (s as any).ipoActive ? ((s as any).takeoverPressure ?? 0) : undefined,
    ipoPrice: (s as any).ipoPrice ?? undefined,
  }),
  14: (s) => ({
    ...s,
    marketCycle: (s as any).marketCycle ?? { phase: "stable", monthsRemaining: 18 },
    pendingRenewals: (s as any).pendingRenewals ?? [],
    totalTaxPaid: (s as any).totalTaxPaid ?? 0,
    tutorialDismissed: (s as any).tutorialDismissed ?? true, // existing saves skip tutorial
  }),
  13: (s) => ({
    ...s,
    competingBid: (s as any).competingBid ?? undefined,
    bonds: (s as any).bonds ?? [],
    politicalCycle: (s as any).politicalCycle ?? undefined,
    electionResult: (s as any).electionResult ?? undefined,
    milestones: (s as any).milestones ?? [],
    prevEquity: (s as any).prevEquity ?? undefined,
    insuranceCost: (s as any).insuranceCost ?? 0,
    portfolio: (s.portfolio ?? []).map((p: any) => ({
      ...p,
      energyClass: p.energyClass ?? "D",
      insurance: p.insurance ?? false,
    })),
  }),
  12: (s) => ({
    ...s,
    rateMode: (s as any).rateMode ?? "variable",
    fixedRate: (s as any).fixedRate ?? undefined,
    fixedUntilAbs: (s as any).fixedUntilAbs ?? undefined,
    revolving: (s as any).revolving ?? undefined,
    dividendsPaid: (s as any).dividendsPaid ?? 0,
    advisors: (s as any).advisors ?? [],
    ipoActive: (s as any).ipoActive ?? false,
    ipoLastQuarterlyNOI: (s as any).ipoLastQuarterlyNOI ?? undefined,
    portfolio: (s.portfolio ?? []).map((p: any) => ({
      ...p,
      shortTerm: p.shortTerm ?? false,
      pendingZoneChange: p.pendingZoneChange ?? undefined,
      builtYear: p.builtYear ?? undefined,
    })),
    competitors: (s.competitors ?? []).map((c: any) => ({
      ...c,
      portfolio: (c.portfolio ?? []).map((p: any) => ({
        ...p,
        shortTerm: p.shortTerm ?? false,
        builtYear: p.builtYear ?? undefined,
      })),
    })),
  }),
  // v16 → v17: spatial stadskarta – alla synliga objekt får en tomtruta.
  16: (s) => placeCity(s),
  // v17 → v18: bolagsresa – namn och nivå (nivån räknas fram ur tillståndet).
  17: (s) => ({
    ...s,
    companyName: s.companyName ?? DEFAULT_COMPANY_NAME,
    companyLevel: s.companyLevel ?? computedLevel(s),
  }),
  // v20 → v21: uthyrning 2.0 – utgångshyra, ansökningar och nöjdhet.
  20: (s) => ({
    ...s,
    portfolio: s.portfolio.map((p) => ({
      ...p,
      askRentPct: p.askRentPct ?? 1,
      applications: p.applications ?? [],
      tenants: p.tenants.map((t) => ({ ...t, satisfaction: t.satisfaction ?? 60 })),
    })),
  }),
  // v19 → v20: mekanikpaketet – rivalagendor och nya spårningsfält.
  19: (s) => ({
    ...s,
    ownedBlocks: s.ownedBlocks ?? [],
    unlockedBlocks: s.unlockedBlocks ?? [],
    auction: s.auction ?? null,
    competitors: s.competitors.map((c) =>
      c.agenda ? c : { ...c, agenda: agendaFor(c.strategy ?? "tillväxt", c.preferredDistrict) },
    ),
  }),
  // v21 → v22: rullande kalender – dag i månaden ovanpå månadsmodellen.
  // Året förblir 1-baserat (spelår 1 = kalenderår 2000, se engine/date.ts),
  // så inga andra fält behöver konverteras.
  21: (s) => ({
    ...s,
    day: (s as { day?: number }).day ?? 1,
  }),
  // v22 → v23: berättelseläget "Arvet efter morfar". Gamla sparfiler har
  // inget story-tillstånd – de fortsätter som vanligt spel (story = null).
  22: (s) => ({
    ...s,
    story: (s as GameState).story ?? null,
  }),
  // v23 → v24: svårighet + Friläge-anpassningar. Gamla sparfiler saknar
  // inställningar och spelar vidare på grundbalansen (settings = undefined).
  23: (s) => s,
};

/** Sparar nuvarande tillstånd till localStorage (slot 1–3, standard aktiv slot). */
export function saveGame(state: GameState, slot?: number): boolean {
  const s = slot ?? getActiveSlot();
  const payload: SaveFile = {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    state,
  };
  try {
    localStorage.setItem(getSaveKey(s), JSON.stringify(payload));
    return true;
  } catch (e) {
    console.warn("Kunde inte spara spelet:", e);
    return false;
  }
}

/** Laddar sparat tillstånd, kör eventuella migreringar, eller null om inget finns. */
export function loadGame(slot?: number): GameState | null {
  const s = slot ?? getActiveSlot();
  let raw: string | null;
  try {
    raw = localStorage.getItem(getSaveKey(s));
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<SaveFile>;
    // Stöd även oversionerade/äldre sparfiler som var rå GameState.
    let version = typeof parsed.version === "number" ? parsed.version : 1;
    let state = (parsed.state ?? (parsed as unknown as GameState)) as GameState;

    if (version < MIN_SAVE_VERSION) {
      console.warn(`Sparfil v${version} är äldre än stadskartan 3.0 (v${MIN_SAVE_VERSION}) – kan inte laddas.`);
      return null;
    }

    while (version < SAVE_VERSION) {
      const migrate = migrations[version];
      if (migrate) state = migrate(state);
      version += 1;
    }

    // Säkerställ att id-räknaren inte krockar med laddade objekt.
    syncIdCounter(state);
    return state;
  } catch (e) {
    console.warn("Trasig sparfil – ignoreras:", e);
    return null;
  }
}

/** Finns det en sparfil i given slot (standard: aktiv slot)? */
export function hasSave(slot?: number): boolean {
  const s = slot ?? getActiveSlot();
  try {
    return localStorage.getItem(getSaveKey(s)) != null;
  } catch {
    return false;
  }
}

/** Raderar sparfilen i given slot (standard: aktiv slot). */
export function clearSave(slot?: number): void {
  const s = slot ?? getActiveSlot();
  try {
    localStorage.removeItem(getSaveKey(s));
  } catch {
    /* ignoreras */
  }
}
