/* Etapprenovering: att föryngra ett hus som fortfarande är uthyrt.

   Åldrandet hade EN motvikt som verkligen nollställde byggnadsåldern –
   totalrenoveringen – och den kräver ett tomt hus. Botemedlet krävde alltså
   att man först rev sönder sin egen intäkt, och i femtioårsmätningarna
   beställdes det fem gånger på tio partier.

   Etappvis tas en lokal i taget. Testerna låser det som gör åtgärden till
   ett verkligt val: att hyran fortsätter, att priset är högre, och att
   halva jobbet ger halva effekten. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PHASED_COST,
  PHASED_MIN_UNITS,
  canStartPhased,
  phaseCost,
  phasedRentReduction,
  phasedTotalCost,
  phasedTotalMonths,
} from "../engine/phased";
import { advanceMonth } from "../engine/simulation";
import { clearRng, seedRng } from "../engine/random";
import { reducer } from "../engine/reducer";
import { buildingAge } from "../engine/lifecycle";
import { makeProperty, makeState, makeTenantFixture } from "./factories";
import type { GameState } from "../engine/types";

const tenants = (n: number) =>
  Array.from({ length: n }, (_, i) => makeTenantFixture({ id: 101 + i, rent: 50_000 }));

/** Ett äldre hus med fyra uthyrda lokaler. */
const oldHouse = (over = {}) =>
  makeProperty({
    id: 1, baseRent: 2_400_000, capacity: 4, condition: 50,
    // Försäkrat: en oförsäkrad katastrof drar 25 i skick och gör mätningen
    // till ett lotteri i stället för ett test av etapperna.
    builtYear: -39, insurance: true, tenants: tenants(4), ...over,
  });

const withHouse = (over: Partial<GameState> = {}) =>
  makeState({ cash: 200_000_000, year: 1, portfolio: [oldHouse()], ...over }) as GameState;

/** Stegar `months` månader. */
function run(s: GameState, months: number): GameState {
  let cur = s;
  for (let i = 0; i < months; i++) cur = advanceMonth({ ...cur, pendingDecision: null, auction: undefined });
  return cur;
}

/* Tolv månadssteg rör hela simuleringen, så slumpen måste stå still –
   annars mäter testerna vädret och inte etapprenoveringen. */
beforeEach(() => seedRng(4242));
afterEach(() => clearRng());

describe("vad som går att beställa", () => {
  it("kräver minst två lokaler – ett enrumshus görs inte i etapper", () => {
    expect(canStartPhased(oldHouse({ capacity: 1 }))).toBe(false);
    expect(canStartPhased(oldHouse({ capacity: PHASED_MIN_UNITS }))).toBe(true);
  });

  it("ett hus som redan har ett program igång tar inte ett till", () => {
    expect(canStartPhased(oldHouse({ phased: { done: 1, total: 4, monthsLeft: 2 } }))).toBe(false);
  });

  it("kostar mer än totalrenoveringens 18 % – det är priset för att slippa tömma", () => {
    expect(PHASED_COST).toBeGreaterThan(0.18);
  });

  it("tar längre kalendertid än totalrenoveringens sex månader", () => {
    expect(phasedTotalMonths(oldHouse())).toBeGreaterThan(6);
  });

  it("etappens kostnad är totalen delad på antalet lokaler", () => {
    const s = withHouse();
    const p = s.portfolio[0];
    expect(phaseCost(p, s) * p.capacity).toBeCloseTo(phasedTotalCost(p, s), -3);
  });
});

describe("hyran fortsätter medan huset byggs om", () => {
  it("bara den lokal som byggs får nedsättning", () => {
    const p = oldHouse({ phased: { done: 0, total: 4, monthsLeft: 2 } });
    const rent = p.tenants.reduce((a, t) => a + t.rent, 0);
    // En fjärdedel av hyresrullen, halverad.
    expect(phasedRentReduction(p)).toBeCloseTo((rent / 4) * 0.5, -1);
    expect(phasedRentReduction(p)).toBeLessThan(rent);
  });

  it("ingen nedsättning när ingen etapp pågår", () => {
    expect(phasedRentReduction(oldHouse())).toBe(0);
    expect(phasedRentReduction(oldHouse({ phased: { done: 2, total: 4, monthsLeft: 0 } }))).toBe(0);
  });

  it("hyresgästerna bor kvar hela vägen", () => {
    const s = reducer(withHouse(), { type: "START_PHASED", id: 1 });
    const after = run(s, 10);
    expect(after.portfolio[0].tenants.length).toBeGreaterThan(0);
  });
});

describe("etapperna stänger sin andel av gapet", () => {
  const started = () => reducer(withHouse(), { type: "START_PHASED", id: 1 });

  it("halva jobbet ger ungefär halva föryngringen", () => {
    const s = started();
    const ageBefore = buildingAge(s.portfolio[0], s);
    // Fyra lokaler à två månader; halvvägs efter ~4 månader.
    const half = run(s, 5);
    const p = half.portfolio[0];
    expect(p.phased?.done).toBeGreaterThanOrEqual(2);
    const ageNow = buildingAge(p, half);
    expect(ageNow).toBeLessThan(ageBefore);
    expect(ageNow).toBeGreaterThan(0); // inte klart än
  });

  it("hela programmet nollställer åldern och lyfter skicket", () => {
    const s = started();
    const done = run(s, 12);
    const p = done.portfolio[0];
    expect(p.phased).toBeUndefined();
    // Kalendern rullar under byggtiden, så huset är noll eller ett år –
    // mot trettionio när programmet startade.
    expect(buildingAge(p, done)).toBeLessThanOrEqual(1);
    expect(p.condition).toBeGreaterThan(95);
    expect(p.energyClass).toBe("A");
  });

  it("hyrespotentialen lyfts när huset är genomgånget", () => {
    const s = started();
    const before = s.portfolio[0].rentMult;
    const done = run(s, 12);
    expect(done.portfolio[0].rentMult).toBeGreaterThan(before);
  });

  it("programmet pausar utan kassa i stället för att förfalla", () => {
    // Kassa som räcker till driften men inte till en etapp.
    const rich = withHouse();
    const half = Math.round(phaseCost(rich.portfolio[0], rich) / 2);
    const s = reducer(withHouse({ cash: half }), { type: "START_PHASED", id: 1 });
    const after = run(s, 6);
    // Ingen etapp har kunnat betalas, men programmet ligger kvar.
    expect(after.portfolio[0].phased?.done).toBe(0);
    expect(after.portfolio[0].phased).toBeDefined();
  });
});

describe("att avbryta", () => {
  it("behåller det som redan är gjort", () => {
    const s = run(reducer(withHouse(), { type: "START_PHASED", id: 1 }), 5);
    const ageMidway = buildingAge(s.portfolio[0], s);
    const stopped = reducer(s, { type: "STOP_PHASED", id: 1 });
    expect(stopped.portfolio[0].phased).toBeUndefined();
    expect(buildingAge(stopped.portfolio[0], stopped)).toBe(ageMidway);
  });
});
