/* ============================================================
   Persistens – sparar/laddar speltillstånd i localStorage med
   versionshantering och migrering. Ersätter prototypens
   in-memory-lösning (window[SAVE_KEY]).
   ============================================================ */

import { syncIdCounter } from "../engine/random";
import { initStocks } from "../engine/stocks";
import type { GameState } from "../engine/types";

const SAVE_KEY = "fastighetsimperium:save";

/** Höj denna när sparfilsformatet ändras och lägg till en migrering nedan. */
export const SAVE_VERSION = 10;

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
};

/** Sparar nuvarande tillstånd till localStorage. */
export function saveGame(state: GameState): boolean {
  const payload: SaveFile = {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    state,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    console.warn("Kunde inte spara spelet:", e);
    return false;
  }
}

/** Laddar sparat tillstånd, kör eventuella migreringar, eller null om inget finns. */
export function loadGame(): GameState | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<SaveFile>;
    // Stöd även oversionerade/äldre sparfiler som var rå GameState.
    let version = typeof parsed.version === "number" ? parsed.version : 1;
    let state = (parsed.state ?? (parsed as unknown as GameState)) as GameState;

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

/** Finns det en sparfil? */
export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) != null;
  } catch {
    return false;
  }
}

/** Raderar sparfilen. */
export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignoreras */
  }
}
