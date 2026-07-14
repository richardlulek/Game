/* Tester för stadsdelsprojekten: helägt kvarter → rivning → miljardbygge
   → signaturkvarter med permanent distriktslyft. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fullyOwnedBlocks } from "../engine/blocks";
import { PARCELS, occupiedParcelIds, placeCity } from "../engine/city";
import {
  CITY_PROJECT_MIN_LEVEL,
  blockInfo,
  cityProfileById,
  cityProjectCost,
  eligibleCityBlocks,
} from "../engine/cityProjects";
import { dynastyScore } from "../engine/lateGame";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { GameState, Property } from "../engine/types";
import { makeProperty, makeState } from "./factories";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Minsta slutna kvarter + fastigheter som fyller det (samma som megaprojekt). */
function ownedBlockFixture(): { blockId: string; props: Property[] } {
  const byBlock = new Map<string, string[]>();
  for (const pc of PARCELS) {
    if (!byBlock.has(pc.blockId)) byBlock.set(pc.blockId, []);
    byBlock.get(pc.blockId)!.push(pc.id);
  }
  const [blockId, parcelIds] = [...byBlock.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .sort((a, b) => a[1].length - b[1].length)[0];
  const props = parcelIds.map((pid, i) => makeProperty({ id: 100 + i, parcelId: pid }));
  return { blockId, props };
}

function readyState(over: Partial<GameState> = {}): { s: GameState; blockId: string } {
  const { blockId, props } = ownedBlockFixture();
  const s = makeState({
    cash: 5_000_000_000,
    companyLevel: CITY_PROJECT_MIN_LEVEL,
    portfolio: props,
    ...over,
  });
  return { s, blockId };
}

describe("stadsdelsprojekt – start", () => {
  it("kräver bolagsnivå", () => {
    const { s, blockId } = readyState({ companyLevel: CITY_PROJECT_MIN_LEVEL - 1 });
    const s1 = reducer(s, { type: "START_CITY_PROJECT", blockId, profile: "kontorskluster" });
    expect(s1.cityProjects ?? []).toHaveLength(0);
    expect(s1.log[0].t).toContain("bolagsnivå");
  });

  it("kräver helägt kvarter och tillräcklig kassa", () => {
    const { blockId } = ownedBlockFixture();
    const utanKvarter = reducer(
      makeState({ cash: 5e9, companyLevel: 5 }),
      { type: "START_CITY_PROJECT", blockId, profile: "kontorskluster" },
    );
    expect(utanKvarter.cityProjects ?? []).toHaveLength(0);

    const { s, blockId: b2 } = readyState({ cash: 1_000_000 });
    const utanKassa = reducer(s, { type: "START_CITY_PROJECT", blockId: b2, profile: "kontorskluster" });
    expect(utanKassa.cityProjects ?? []).toHaveLength(0);
    expect(utanKassa.log[0].t).toContain("kassan räcker inte");
  });

  it("river kvarterets hus, drar kostnaden och startar projektet", () => {
    const { s, blockId } = readyState();
    const prof = cityProfileById("kontorskluster")!;
    const cost = cityProjectCost(blockId, prof, s);
    expect(cost).toBeGreaterThan(500_000_000); // miljardklassen

    const s1 = reducer(s, { type: "START_CITY_PROJECT", blockId, profile: "kontorskluster" });
    expect(s1.cityProjects).toHaveLength(1);
    expect(s1.cityProjects![0].monthsLeft).toBe(prof.months);
    expect(s1.cash).toBe(s.cash - cost);
    expect(s1.portfolio).toHaveLength(0); // alla hus på kvarteret revs
    // Hela kvarteret är reserverat under bygget.
    const occ = occupiedParcelIds(s1);
    for (const pid of blockInfo(blockId)!.parcels.map((p) => p.id)) expect(occ.has(pid)).toBe(true);
  });

  it("upptagna kvarter är inte längre valbara", () => {
    const { s, blockId } = readyState();
    const s1 = reducer(s, { type: "START_CITY_PROJECT", blockId, profile: "bostadskvarter" });
    expect(eligibleCityBlocks(s1, fullyOwnedBlocks(s1))).not.toContain(blockId);
    // Och ett andra projekt på samma kvarter avvisas.
    const s2 = reducer({ ...s1, cash: 5e9, portfolio: s.portfolio }, { type: "START_CITY_PROJECT", blockId, profile: "kulturstråk" });
    expect(s2.cityProjects).toHaveLength(1);
  });
});

describe("stadsdelsprojekt – invigning", () => {
  it("skapar signaturfastigheten och lyfter distriktet permanent", () => {
    const { s, blockId } = readyState();
    let st = reducer(s, { type: "START_CITY_PROJECT", blockId, profile: "kontorskluster" });
    st = { ...st, cityProjects: [{ ...st.cityProjects![0], monthsLeft: 1 }] };
    const done = advanceMonth(st);

    expect(done.cityProjects ?? []).toHaveLength(0);
    expect(done.signatureBlocks).toEqual([{ blockId, profile: "kontorskluster" }]);
    const sig = done.portfolio.find((p) => p.signature === "kontorskluster");
    expect(sig).toBeDefined();
    expect(sig!.typeLabel).toContain("Signaturkvarter");
    expect(sig!.wholeBlock).toBe(true);
    expect(sig!.area).toBeGreaterThan(3000);
    expect(sig!.baseRent).toBeGreaterThan(0);
    // Fastigheten står på en av kvarterets tomter.
    const blockParcels = new Set(blockInfo(blockId)!.parcels.map((p) => p.id));
    expect(blockParcels.has(sig!.parcelId!)).toBe(true);
    // Distriktet lyfts permanent och loggen firar.
    const district = blockInfo(blockId)!.district;
    expect(done.districtDev![district] ?? 1).toBeGreaterThan(s.districtDev?.[district] ?? 1);
    expect(done.log.some((l) => l.t.includes("INVIGNING"))).toBe(true);
    // Dynastipoäng för signaturkvarteret.
    expect(dynastyScore(done).stadsdelar).toBe(cityProfileById("kontorskluster")!.dynasty);
  });

  it("placeCity styr aldrig nya objekt in i signaturkvarteret", () => {
    const { s, blockId } = readyState();
    let st = reducer(s, { type: "START_CITY_PROJECT", blockId, profile: "kulturstråk" });
    st = advanceMonth({ ...st, cityProjects: [{ ...st.cityProjects![0], monthsLeft: 1 }] });
    const info = blockInfo(blockId)!;
    // En ny annons i samma distrikt utan ruta får ALDRIG kvarterets tomter.
    const listing = makeProperty({ id: 999, district: info.district, owned: false });
    const placed = placeCity({ ...st, listings: [...st.listings, listing] });
    const sigParcels = new Set(info.parcels.map((p) => p.id));
    const assigned = placed.listings.find((l) => l.id === 999)!.parcelId!;
    const sig = placed.portfolio.find((p) => p.signature)!;
    expect(sigParcels.has(assigned)).toBe(false);
    expect(sigParcels.has(sig.parcelId!)).toBe(true); // signaturen behåller sin ruta
  });
});
