/* ============================================================
   Persistens – sparar/laddar speltillstånd i localStorage med
   versionshantering och migrering. Ersätter prototypens
   in-memory-lösning (window[SAVE_KEY]).
   ============================================================ */

import { agendaFor } from "../engine/initState";
import { syncIdCounter } from "../engine/random";
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
export const SAVE_VERSION = 25;

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
  // Migrering 2–18 (före stadskartan 3.0) var död kod: MIN_SAVE_VERSION
  // avvisar sådana sparfiler innan migreringsloopen körs. Borttagna.
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
  // v24 → v25: beställda arbeten (pendingWorks) – gamla sparfiler har inga.
  24: (s) => ({
    ...s,
    portfolio: ((s as GameState).portfolio ?? []).map((p) => ({
      ...p,
      pendingWorks: p.pendingWorks ?? [],
    })),
  }),
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

/** Tolkar rå sparfils-JSON: versionskontroll + migreringar. */
function parseSaveFile(raw: string): GameState | null {
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
  return parseSaveFile(raw);
}

/**
 * Export/import av sparfiler som JSON – försäkring mot att Safari på
 * iPad rensar localStorage för sällan besökta sajter. En importerad fil
 * körs genom samma versionskontroll och migreringar som localStorage.
 */
export function exportSaveFile(state: GameState): string {
  const payload: SaveFile = { version: SAVE_VERSION, savedAt: new Date().toISOString(), state };
  return JSON.stringify(payload);
}

export function importSaveFile(raw: string): GameState | null {
  const state = parseSaveFile(raw);
  if (!state || !Array.isArray(state.portfolio) || typeof state.cash !== "number") return null;
  return state;
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
