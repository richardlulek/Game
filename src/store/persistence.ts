/* ============================================================
   Persistens – sparar/laddar speltillstånd i localStorage med
   versionshantering och migrering. Ersätter prototypens
   in-memory-lösning (window[SAVE_KEY]).
   ============================================================ */

import { equityOf } from "../engine/finance";
import { calcCapacity } from "../engine/generators";
import { industryListPrice } from "../engine/industries";
import { agendaFor } from "../engine/initState";
import { syncIdCounter } from "../engine/random";
import { isDesktop, readSlotFile, writeSlotFile } from "../native";
import type { GameState, Property } from "../engine/types";

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
  properties?: number;
}

export function listSaveSlots(): SlotInfo[] {
  return [1, 2, 3].map((slot) => {
    try {
      const raw = localStorage.getItem(getSaveKey(slot));
      if (!raw) return { slot, exists: false };
      const parsed = JSON.parse(raw) as Partial<SaveFile>;
      // Samma migreringsväg som riktig laddning, så siffrorna nedan räknas
      // på ett komplett tillstånd (gamla filer före v19 ger null → tomma).
      const st = parseSaveFile(raw);
      if (!st) return { slot, exists: false };
      // Samma equity som spelet visar (marknadsvärden, industrier, aktier,
      // institut …). Tidigare visades kassa + inköpspriser − skuld, vilket
      // kunde skilja sig rejält från siffran i spelet.
      let equity: number;
      try {
        equity = Math.round(equityOf(st));
      } catch {
        equity = Math.round(st.cash + (st.portfolio ?? []).reduce((a, p) => a + p.askPrice, 0) - st.debt);
      }
      return {
        slot,
        exists: true,
        savedAt: parsed.savedAt,
        year: st.year,
        month: st.month,
        equity,
        properties: (st.portfolio ?? []).length,
      };
    } catch {
      return { slot, exists: false };
    }
  });
}

/** Höj denna när sparfilsformatet ändras och lägg till en migrering nedan. */
export const SAVE_VERSION = 29;

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
  // v25 → v26: prisgolv i Finansdistriktet – inga små billiga hus bland
  // osålda objekt. Ytan växer upp till golvet (priset per m² bevaras);
  // ägda fastigheter (spelarens och rivalernas böcker) lämnas orörda.
  25: (s) => {
    const FLOOR = 250_000_000;
    const grow = (p: Property): Property => {
      if (p.district !== "finans" || p.owned || p.askPrice >= FLOOR || p.askPrice <= 0) return p;
      const f = FLOOR / p.askPrice;
      const area = Math.ceil(p.area * f);
      return {
        ...p,
        area,
        askPrice: FLOOR,
        baseRent: Math.round(p.baseRent * f),
        capacity: calcCapacity(area, p.wholeBlock),
        tenants: (p.tenants ?? []).map((t) => ({ ...t, rent: Math.round(t.rent * f) })),
      };
    };
    return {
      ...s,
      listings: (s.listings ?? []).map(grow),
      worldPool: (s.worldPool ?? []).map(grow),
      lots: (s.lots ?? []).map((l) =>
        l.district === "finans" && l.area < 4000
          ? { ...l, area: 4000, price: Math.round(l.price * (4000 / Math.max(1, l.area))) }
          : l,
      ),
    };
  },
  // v26 → v27: föräldralösa rivalaktier avnoteras. Tidigare lämnade förvärv
  // och fusioner kvar aktier vars bolag inte längre fanns – zombiepapper som
  // drev på ren slump. Spelarens innehav löses ut till kurs (blankning stängs).
  26: (s) => {
    const names = new Set(s.competitors.map((c) => c.name));
    let payout = 0;
    const stocks = (s.stocks ?? []).filter((st) => {
      if (!st.competitorName || st.competitorName === "__player__" || names.has(st.competitorName))
        return true;
      payout += st.owned * st.price;
      const shortQty = st.shortQty ?? 0;
      if (shortQty > 0) {
        const avg = st.shortAvgPrice ?? st.price;
        payout += Math.max(0, Math.round(avg * shortQty * 1.5) + Math.round(shortQty * (avg - st.price)));
      }
      return false;
    });
    if (stocks.length === (s.stocks ?? []).length) return s;
    const liveIds = new Set(stocks.map((st) => st.id));
    return {
      ...s,
      stocks,
      cash: s.cash + Math.round(payout),
      stockOrders: (s.stockOrders ?? []).filter((o) => liveIds.has(o.stockId)),
    };
  },

  // v27 → v28: industriobjekt TILL SALU omprissätts från kapitaliserat
  // driftnetto. Mallpriserna var frikopplade från intäktsmodellen – hotell
  // och energiparker kunde köpas till bråkdelar av sitt bokförda värde.
  // Ägda tillgångar rörs inte (gjorda affärer är gjorda).
  27: (s) => ({
    ...s,
    industryListings: (s.industryListings ?? []).map((a) => ({
      ...a,
      purchasePrice: industryListPrice(a, s),
    })),
  }),
  // v28 → v29: seedad RNG. Saknas frö i en gammal sparfil initieras det till
  // ett färskt värde – determinism gäller framåt, vilket räcker.
  28: (s) => {
    const seed = s.seed ?? s.rng ?? (Date.now() >>> 0);
    return { ...s, seed, rng: s.rng ?? seed };
  },
};

/** Sparar nuvarande tillstånd till localStorage (slot 1–3, standard aktiv slot).
 *  På desktop speglas sparningen dessutom till en riktig fil (se hydrateFromDisk).
 *  Spegling sker i bakgrunden så att autosparet aldrig hackar spelet. */
export function saveGame(state: GameState, slot?: number): boolean {
  const s = slot ?? getActiveSlot();
  const payload: SaveFile = {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    state,
  };
  const raw = JSON.stringify(payload);
  try {
    localStorage.setItem(getSaveKey(s), raw);
  } catch (e) {
    console.warn("Could not save the game:", e);
    return false;
  }
  void writeSlotFile(s, raw); // desktop: no-op på webben
  return true;
}

/** Tidsstämpeln i en rå sparfil (0 om den saknas/är trasig). */
function savedAtMs(raw: string | null): number {
  if (!raw) return 0;
  try {
    const t = (JSON.parse(raw) as Partial<SaveFile>).savedAt;
    const ms = t ? Date.parse(t) : NaN;
    return Number.isFinite(ms) ? ms : 0;
  } catch {
    return 0;
  }
}

/**
 * Desktop: läser in sparfiler från disk till localStorage vid uppstart.
 * Filen vinner när den är nyare än localStorage – så en sparning som Steam
 * Cloud hämtat från en annan dator, eller som ligger kvar efter att
 * webview-datan rensats, plockas upp automatiskt.
 *
 * Anropas under laddbilden, innan slot-listan visas. Tyst no-op på webben.
 * Returnerar antalet slots som hämtades från disk.
 */
export async function hydrateFromDisk(): Promise<number> {
  if (!isDesktop()) return 0;
  let restored = 0;
  for (const slot of [1, 2, 3]) {
    try {
      const fromDisk = await readSlotFile(slot);
      if (!fromDisk) continue;
      const key = getSaveKey(slot);
      const local = localStorage.getItem(key);
      if (savedAtMs(fromDisk) <= savedAtMs(local)) continue; // localStorage är lika ny/nyare
      if (!parseSaveFile(fromDisk)) continue;                // trasig fil – rör inte localStorage
      localStorage.setItem(key, fromDisk);
      restored += 1;
    } catch (e) {
      console.warn(`Could not read slot ${slot} from disk:`, e);
    }
  }
  return restored;
}

/**
 * Desktop: skriver localStorage-sparningar till disk om filen saknas eller är
 * äldre. Kör en gång vid uppstart så att spelare som redan har sparningar från
 * en tidigare version får dem migrerade till filer (och därmed till Steam Cloud).
 */
export async function backfillToDisk(): Promise<number> {
  if (!isDesktop()) return 0;
  let written = 0;
  for (const slot of [1, 2, 3]) {
    try {
      const local = localStorage.getItem(getSaveKey(slot));
      if (!local) continue;
      const onDisk = await readSlotFile(slot);
      if (savedAtMs(local) <= savedAtMs(onDisk)) continue;
      if (await writeSlotFile(slot, local)) written += 1;
    } catch (e) {
      console.warn(`Could not write slot ${slot} to disk:`, e);
    }
  }
  return written;
}

/** Synkar sparningar åt båda håll vid uppstart (disk ↔ localStorage). */
export async function syncSavesWithDisk(): Promise<{ restored: number; written: number }> {
  const restored = await hydrateFromDisk();
  const written = await backfillToDisk();
  return { restored, written };
}

/**
 * Tolkar rå sparfils-JSON: versionskontroll + migreringar.
 *
 * Exporterad för att sparfilernas BAKÅTKOMPATIBILITET ska gå att testa –
 * se `src/__tests__/saveCompat.test.ts`, som laddar en riktig fil från varje
 * släppt version. Regeln vid patchning står i RELEASE.md: ett nytt VALFRITT
 * fält kräver ingen migrering, ett fält som byter form eller försvinner
 * kräver höjd SAVE_VERSION och en post i `migrations`.
 */
export function parseSaveFile(raw: string): GameState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SaveFile>;
    // Stöd även oversionerade/äldre sparfiler som var rå GameState.
    let version = typeof parsed.version === "number" ? parsed.version : 1;
    let state = (parsed.state ?? (parsed as unknown as GameState)) as GameState;

    if (version < MIN_SAVE_VERSION) {
      console.warn(`Save file v${version} is older than city map 3.0 (v${MIN_SAVE_VERSION}) – cannot be loaded.`);
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
    console.warn("Corrupt save file – ignored:", e);
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
