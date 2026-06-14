/* ============================================================
   Persistens – sparar/laddar speltillstånd i localStorage med
   versionshantering och migrering. Ersätter prototypens
   in-memory-lösning (window[SAVE_KEY]).
   ============================================================ */

import { syncIdCounter } from "../engine/random";
import type { GameState } from "../engine/types";

const SAVE_KEY = "fastighetsimperium:save";

/** Höj denna när sparfilsformatet ändras och lägg till en migrering nedan. */
export const SAVE_VERSION = 3;

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
