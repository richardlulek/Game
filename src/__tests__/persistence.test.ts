import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parcelById } from "../engine/city";
import { newId } from "../engine/random";
import { clearSave, hasSave, loadGame, SAVE_VERSION, saveGame } from "../store/persistence";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

// Enkel localStorage-stub för node-miljön.
function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
}

beforeEach(() => installLocalStorage());
afterEach(() => vi.unstubAllGlobals());

describe("persistens", () => {
  it("sparar med versionsstämpel och laddar tillbaka likadant tillstånd", () => {
    const s = makeState({ cash: 1_234_567, reputation: 73 });
    expect(saveGame(s)).toBe(true);
    expect(hasSave()).toBe(true);

    const raw = JSON.parse(localStorage.getItem("fastighetsimperium:save")!);
    expect(raw.version).toBe(SAVE_VERSION);
    expect(typeof raw.savedAt).toBe("string");

    const loaded = loadGame();
    expect(loaded?.cash).toBe(1_234_567);
    expect(loaded?.reputation).toBe(73);
  });

  it("synkar id-räknaren vid load så nya id:n inte krockar", () => {
    const p = makeProperty({ id: 500, tenant: makeTenantFixture({ id: 750 }) });
    saveGame(makeState({ portfolio: [p] }));
    loadGame();
    expect(newId()).toBe(751); // max(500, 750) + 1
  });

  it("returnerar null när ingen sparfil finns", () => {
    expect(loadGame()).toBeNull();
    expect(hasSave()).toBe(false);
  });

  it("klarar trasig sparfil utan att krascha", () => {
    localStorage.setItem("fastighetsimperium:save", "{ inte giltig json");
    expect(loadGame()).toBeNull();
  });

  it("migrerar v2-sparfil: alla objekt får en giltig, unik parcelId", () => {
    const strip = <T extends { parcelId: string }>(o: T): Omit<T, "parcelId"> => {
      const rest: Record<string, unknown> = { ...o };
      delete rest.parcelId;
      return rest as Omit<T, "parcelId">;
    };
    const state = makeState({
      portfolio: [strip(makeProperty({ id: 1, district: "centrum" }))],
      listings: [strip(makeProperty({ id: 2, district: "hamnen", owned: false }))],
      lots: [
        strip({
          id: 3,
          district: "kulle",
          districtName: "Villakullen",
          parcelId: "x",
          area: 900,
          price: 2e6,
        }),
      ],
    } as never);
    localStorage.setItem(
      "fastighetsimperium:save",
      JSON.stringify({ version: 2, savedAt: new Date().toISOString(), state }),
    );

    const loaded = loadGame()!;
    const objs = [...loaded.portfolio, ...loaded.listings, ...loaded.lots];
    const ids = objs.map((o) => o.parcelId);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const o of objs) expect(parcelById(o.parcelId)?.district).toBe(o.district);
  });

  it("clearSave raderar sparfilen", () => {
    saveGame(makeState());
    expect(hasSave()).toBe(true);
    clearSave();
    expect(hasSave()).toBe(false);
  });
});
