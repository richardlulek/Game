/* Enhusfällan: kassaflödet och refinansieringen räcker inte till nästa
   kontantinsats, men vinsten som ligger låst i huset man redan äger gör det.
   Mätningen över 50 år är entydig – samma strategi som omsätter beståndet
   tidigt landar på elva hus i stället för ett. Testerna låser fast att
   siffran som visar den vägen är räknad på rätt sätt: övervärde mot
   investerat kapital, netto efter att lånet lösts, och omräknat till
   kontantinsatser på den belåningsgrad bolaget faktiskt köper på. */
import { describe, expect, it } from "vitest";
import { RECYCLE_UPLIFT_THRESHOLD, equityRecycle } from "../engine/selling";
import { propMarketValue } from "../engine/property";
import { makeProperty, makeState, makeTenantFixture } from "./factories";
import type { GameState } from "../engine/types";

/** Ett hus vars marknadsvärde vi mäter, och som vi sedan sätter ett
 *  köpepris på i efterhand för att styra övervärdet. */
const house = (over = {}) =>
  makeProperty({
    id: 1, baseRent: 1_200_000, capacity: 2, condition: 85,
    tenants: [makeTenantFixture({ id: 101, rent: 50_000 }), makeTenantFixture({ id: 102, rent: 50_000 })],
    ...over,
  });

/** Marknaden: några objekt att jämföra kontantinsatsen mot. */
const listings = (ask: number) =>
  [1, 2, 3].map((i) => makeProperty({ id: 100 + i, owned: false, status: "klar", askPrice: ask }));

/** Bygger ett tillstånd där huset har exakt `upliftPct` övervärde. */
function withUplift(upliftPct: number, over: Partial<GameState> = {}): GameState {
  const probe = makeState({ portfolio: [house()], listings: listings(20_000_000) }) as GameState;
  const value = propMarketValue(probe.portfolio[0], probe);
  const purchasePrice = Math.round(value / (1 + upliftPct));
  return makeState({
    cash: 1_000_000,
    debt: 0,
    portfolio: [house({ purchasePrice, capexTotal: 0 })],
    listings: listings(20_000_000),
    ...over,
  }) as GameState;
}

describe("övervärdet som köpkraft", () => {
  it("ett hus som knappt stigit är inte värt att sälja", () => {
    const s = withUplift(0.05);
    expect(equityRecycle(s.portfolio[0], s)).toBeNull();
  });

  it("ett hus som stigit rejält frigör kontantinsatser", () => {
    const s = withUplift(1.5);
    const r = equityRecycle(s.portfolio[0], s);
    expect(r).not.toBeNull();
    expect(r!.uplift).toBeGreaterThan(0);
    expect(r!.count).toBeGreaterThanOrEqual(1);
  });

  it("tröskeln går vid övervärde över andelen av investerat kapital", () => {
    const under = withUplift(RECYCLE_UPLIFT_THRESHOLD - 0.05);
    const over = withUplift(RECYCLE_UPLIFT_THRESHOLD + 0.6);
    expect(equityRecycle(under.portfolio[0], under)).toBeNull();
    expect(equityRecycle(over.portfolio[0], over)).not.toBeNull();
  });

  it("nedlagd capex räknas in i vad huset kostat", () => {
    const s = withUplift(1.5);
    const value = propMarketValue(s.portfolio[0], s);
    const bare = equityRecycle(s.portfolio[0], s)!;
    const withCapex = equityRecycle({ ...s.portfolio[0], capexTotal: Math.round(value * 0.1) }, s)!;
    expect(withCapex.uplift).toBeLessThan(bare.uplift);
  });

  it("har man renoverat bort hela vinsten finns inget övervärde kvar", () => {
    const s = withUplift(1.5);
    const value = propMarketValue(s.portfolio[0], s);
    expect(equityRecycle({ ...s.portfolio[0], capexTotal: value }, s)).toBeNull();
  });

  it("skulden på huset dras av från vad försäljningen ger", () => {
    const s = withUplift(1.5);
    const free = equityRecycle(s.portfolio[0], s)!;
    const levered = equityRecycle(s.portfolio[0], { ...s, debt: 500_000_000 })!;
    expect(levered.net).toBeLessThan(free.net);
  });

  it("räknar kontantinsatsen på den belåningsgrad bolaget köper på", () => {
    const s = withUplift(1.5);
    const maxLev = equityRecycle(s.portfolio[0], s)!;
    const cautious = equityRecycle(s.portfolio[0], { ...s, policy: { purchaseLtv: 0.2 } })!;
    // Lägre belåning ⇒ större insats per objekt ⇒ pengarna räcker till färre.
    expect(cautious.count).toBeLessThan(maxLev.count);
    expect(cautious.ltv).toBeCloseTo(0.2, 6);
  });

  it("ett hus som byggs går inte att räkna hem", () => {
    const s = withUplift(1.5);
    expect(equityRecycle({ ...s.portfolio[0], status: "bygger" }, s)).toBeNull();
  });

  it("räcker det inte till ens en insats är det inget att göra", () => {
    // Marknaden består av objekt som är långt dyrare än det egna huset.
    const s = withUplift(1.5, { listings: listings(50_000_000_000) });
    expect(equityRecycle(s.portfolio[0], s)).toBeNull();
  });
});
