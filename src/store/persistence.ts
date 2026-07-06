/* ============================================================
   Persistens – sparar/laddar speltillstånd i localStorage med
   versionshantering och migrering. Ersätter prototypens
   in-memory-lösning (window[SAVE_KEY]).
   ============================================================ */

import { claimFirstFreeParcel, parcelById, usedParcelIds } from "../engine/city";
import { DISTRICTS, PROP_TYPES, START_DISTRICTS } from "../engine/data";
import { syncIdCounter } from "../engine/random";
import type { GameState, PropTypeKey, RivalHolding } from "../engine/types";

const SAVE_KEY = "fastighetsimperium:save";

/** Höj denna när sparfilsformatet ändras och lägg till en migrering nedan. */
export const SAVE_VERSION = 4;

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
  // v2 → v3: objekten fick en plats på stadskartan (parcelId).
  2: (s) => {
    const occupied = usedParcelIds(s);
    const place = <T extends { district: string; parcelId?: string }>(o: T): T =>
      o.parcelId && parcelById(o.parcelId)
        ? o
        : { ...o, parcelId: claimFirstFreeParcel(o.district, occupied).id };
    return {
      ...s,
      portfolio: s.portfolio.map(place),
      listings: s.listings.map(place),
      lots: s.lots.map(place),
    };
  },
  // v3 → v4: konkurrenter fick riktiga innehav och distrikt kan låsas upp.
  3: (s) => {
    const occupied = usedParcelIds(s);
    const typeKeys = Object.keys(PROP_TYPES) as PropTypeKey[];
    let seed = 0;
    const competitors = s.competitors.map((c) => {
      if (c.holdings?.length) return c;
      const holdings: RivalHolding[] = [];
      for (let i = 0; i < c.units; i++) {
        const district = START_DISTRICTS[seed % START_DISTRICTS.length];
        const parcel = claimFirstFreeParcel(district, occupied);
        const type = typeKeys[seed % typeKeys.length];
        holdings.push({
          id: 100_000 + seed, // syncIdCounter lyfter id-räknaren förbi dessa
          parcelId: parcel.id,
          district,
          districtName: DISTRICTS.find((d) => d.id === district)?.name ?? district,
          type,
          typeLabel: PROP_TYPES[type].label,
          area: 1200,
        });
        seed += 1;
      }
      return { ...c, holdings, units: holdings.length };
    });
    return {
      ...s,
      competitors,
      unlockedDistricts: s.unlockedDistricts ?? [...START_DISTRICTS],
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
