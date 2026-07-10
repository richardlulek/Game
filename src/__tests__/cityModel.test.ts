/* Tester för stadskartan 3.0: kvartersmodellen, sju distrikt,
   kvartersköp i förorten och sparfilsgaten. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DISTRICT_ZONES, PARCELS, ZONE_STREETS, claimRandomParcel, hasAmbientBuilding, parcelsIn } from "../engine/city";
import { DISTRICTS, DISTRICT_GEN } from "../engine/data";
import { calcCapacity, genWorldProperty } from "../engine/generators";
import { reducer } from "../engine/reducer";
import { loadGame } from "../store/persistence";
import { makeState } from "./factories";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("stadskartan 3.0", () => {
  it("har sju distrikt med zoner, tomter och generationsprofiler", () => {
    expect(DISTRICTS).toHaveLength(7);
    for (const d of DISTRICTS) {
      expect(DISTRICT_ZONES.some((z) => z.district === d.id)).toBe(true);
      expect(parcelsIn(d.id).length).toBeGreaterThan(10);
      expect(DISTRICT_GEN[d.id]).toBeDefined();
    }
    expect(PARCELS.length).toBeGreaterThanOrEqual(200);
  });

  it("staden växer naturligt: tom mark bebyggs före dekorbebyggelse", () => {
    const occupied = new Set<string>();
    const empty = parcelsIn("centrum").filter((p) => !p.expansion && !hasAmbientBuilding(p));
    // Alla lediga fält tas i anspråk innan något dekorhus ersätts …
    for (let i = 0; i < empty.length; i++) {
      const chosen = claimRandomParcel("centrum", occupied);
      expect(hasAmbientBuilding(chosen)).toBe(false);
    }
    // … och först därefter förtätas kvarter med dekorbebyggelse.
    const next = claimRandomParcel("centrum", occupied);
    expect(hasAmbientBuilding(next)).toBe(true);
  });

  it("tomter har kvarter och gatukanter; slutna kvarter delar väggar", () => {
    for (const p of PARCELS) {
      expect(p.blockId).toBeTruthy();
      expect(p.edges).toBeDefined();
    }
    // Centrumkvarter är 3×2: mitten-tomterna saknar gatukant öst/väst
    const centrumInner = parcelsIn("centrum").filter((p) => !p.edges.e && !p.edges.w);
    expect(centrumInner.length).toBeGreaterThan(0);
    // Fristående tomter (finans-zonen) har gata på alla sidor —
    // expansionskvarter (t.ex. planområdet finans-plan0) undantas.
    for (const p of parcelsIn("finans").filter((x) => !x.expansion))
      expect(p.edges.n && p.edges.s && p.edges.e && p.edges.w).toBe(true);
  });

  it("kvartersgator genereras mellan kvarteren", () => {
    expect(ZONE_STREETS.length).toBeGreaterThan(20);
    // Centrum med 4×4 kvarter har 3+3 gator
    expect(ZONE_STREETS.filter((s) => s.district === "centrum")).toHaveLength(6);
  });

  it("tomterna överlappar inte varandra", () => {
    for (let i = 0; i < PARCELS.length; i++) {
      for (let j = i + 1; j < PARCELS.length; j++) {
        const a = PARCELS[i];
        const b = PARCELS[j];
        const overlapX = Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 0.01;
        const overlapZ = Math.abs(a.z - b.z) < (a.d + b.d) / 2 - 0.01;
        if (overlapX && overlapZ)
          throw new Error(`${a.id} överlappar ${b.id}`);
      }
    }
  });
});

describe("kvartersköp i förorten", () => {
  it("förortsobjekt genereras som hela kvarter med hög kapacitet", () => {
    // Math.random = 0.86 träffar förorten i den viktade slumpningen.
    vi.spyOn(Math, "random").mockReturnValue(0.86);
    const p = genWorldProperty(makeState({}));
    expect(p.district).toBe("förort");
    expect(p.wholeBlock).toBe(true);
    expect(p.typeLabel).toContain("Kvarter");
    expect(p.capacity).toBeGreaterThan(4); // fler platser än enskilda hus
  });

  it("calcCapacity skiljer på hus och kvarter", () => {
    expect(calcCapacity(3000)).toBe(4);
    expect(calcCapacity(3000, true)).toBe(6);
    expect(calcCapacity(6000, true)).toBe(9);
  });
});

describe("sparfilsgate", () => {
  it("sparfiler äldre än v19 behandlas som obefintliga", () => {
    // Enkel localStorage-stub för node-miljön.
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    localStorage.setItem(
      "fastighetsimperium:save",
      JSON.stringify({ version: 18, savedAt: "x", state: makeState({}) }),
    );
    expect(loadGame(1)).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("bygge på köpt tomt", () => {
  it("kranen står på den köpta tomtens ruta – inte en slumpad", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const s0 = makeState({
      cash: 50_000_000,
      lots: [{ id: 1, district: "centrum", districtName: "Centrum", area: 1200, price: 2_000_000, owned: true, parcelId: "centrum-b2-p3" }],
    });
    const s1 = reducer(s0, { type: "BUILD", id: 1, propType: "bostad" });
    expect(s1.portfolio[0].status).toBe("bygger");
    expect(s1.portfolio[0].parcelId).toBe("centrum-b2-p3");
  });
});
