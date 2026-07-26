/* Skyddar sparfilernas hållbarhet på desktop: sparningar speglas till fil,
   och vid uppstart vinner den NYASTE av fil och localStorage. Det är den
   mekanismen som gör att Steam Cloud (och en manuell backup) fungerar –
   går den sönder tappar spelare progression, vilket är svårt att upptäcka
   utan test. */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Simulerat desktop-skal: native-bron läser/skriver mot en fejkad "disk".
const disk = new Map<number, string>();
vi.mock("../native", () => ({
  isDesktop: () => true,
  readSlotFile: async (slot: number) => disk.get(slot) ?? null,
  writeSlotFile: async (slot: number, json: string) => { disk.set(slot, json); return true; },
  saveFolder: async () => "/fake/saves",
}));

import { makeState } from "./factories";
import { SAVE_VERSION, saveGame, syncSavesWithDisk } from "../store/persistence";

const KEY = "fastighetsimperium:save"; // slot 1

/** Bygger en rå sparfil med given tidsstämpel och årtal. */
function rawSave(savedAt: string, year: number): string {
  return JSON.stringify({
    version: SAVE_VERSION,
    savedAt,
    state: makeState({ year }),
  });
}

const yearIn = (raw: string | null) =>
  raw ? (JSON.parse(raw).state.year as number) : null;

describe("sparfiler på disk (desktop)", () => {
  beforeEach(() => {
    disk.clear();
    // localStorage-stub för node-miljön (samma grepp som persistence.test.ts).
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
  });

  it("speglar en sparning till disk", async () => {
    saveGame(makeState({ year: 7 }), 1);
    // spegling sker i bakgrunden
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(disk.has(1)).toBe(true);
    expect(yearIn(disk.get(1)!)).toBe(7);
  });

  it("hämtar en nyare fil från disk (t.ex. via Steam Cloud)", async () => {
    localStorage.setItem(KEY, rawSave("2026-01-01T00:00:00.000Z", 3));
    disk.set(1, rawSave("2026-06-01T00:00:00.000Z", 12)); // nyare
    await syncSavesWithDisk();
    expect(yearIn(localStorage.getItem(KEY))).toBe(12);
  });

  it("låter localStorage vinna när den är nyare än filen", async () => {
    localStorage.setItem(KEY, rawSave("2026-06-01T00:00:00.000Z", 20));
    disk.set(1, rawSave("2026-01-01T00:00:00.000Z", 4)); // äldre
    await syncSavesWithDisk();
    expect(yearIn(localStorage.getItem(KEY))).toBe(20);
    expect(yearIn(disk.get(1)!)).toBe(20); // och filen uppdateras
  });

  it("återställer progression när webview-datan rensats", async () => {
    disk.set(1, rawSave("2026-06-01T00:00:00.000Z", 15));
    // localStorage tomt = rensad appdata / ny installation
    await syncSavesWithDisk();
    expect(yearIn(localStorage.getItem(KEY))).toBe(15);
  });

  it("skriver befintliga localStorage-sparningar till disk första gången", async () => {
    localStorage.setItem(KEY, rawSave("2026-03-01T00:00:00.000Z", 9));
    await syncSavesWithDisk();
    expect(yearIn(disk.get(1)!)).toBe(9);
  });

  it("rör inte ett fungerande spar när filen är trasig", async () => {
    localStorage.setItem(KEY, rawSave("2026-01-01T00:00:00.000Z", 5));
    disk.set(1, '{"version":99,"savedAt":"2027-01-01T00:00:00.000Z","state":'); // nyare men trasig
    await syncSavesWithDisk();
    expect(yearIn(localStorage.getItem(KEY))).toBe(5);
  });

  it("hanterar tomma slots utan att skapa skräp", async () => {
    await syncSavesWithDisk();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(disk.size).toBe(0);
  });
});
