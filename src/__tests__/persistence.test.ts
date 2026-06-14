import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("clearSave raderar sparfilen", () => {
    saveGame(makeState());
    expect(hasSave()).toBe(true);
    clearSave();
    expect(hasSave()).toBe(false);
  });
});
