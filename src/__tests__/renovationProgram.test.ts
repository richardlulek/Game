/* Åtgärderna ska SKILJA SIG ÅT – en renovering höjer hyran, en fasad höjer
   värdet, en energiåtgärd syns i ingetdera utan i driftkostnaden. Och det
   ska gå att tala om för portföljdirektören vilka av dem den får göra, i
   stället för att beställa varje jobb för hand. Testerna låser både
   katalogens karaktär och programmets urval. */
import { describe, expect, it } from "vitest";
import {
  WORKS,
  pickManagerWork,
  workAvailable,
  workCost,
  workPaybackYears,
  workRentUplift,
  workSpec,
  workValueUplift,
} from "../engine/works";
import { advanceMonth } from "../engine/simulation";
import { reducer } from "../engine/reducer";
import { makeProperty, makeState, makeTenantFixture } from "./factories";
import type { GameState } from "../engine/types";

const DIRECTOR = { active: true, minCondition: 45, minTenantQuality: 0.5, rentTargetPct: 1.0 };

const house = (over = {}) =>
  makeProperty({
    id: 1, baseRent: 1_200_000, capacity: 2, condition: 80,
    tenants: [makeTenantFixture({ id: 101, rent: 50_000 }), makeTenantFixture({ id: 102, rent: 50_000 })],
    ...over,
  });

const withDirector = (over: Partial<GameState> = {}) =>
  makeState({ cash: 50_000_000, portfolio: [house()], globalManager: DIRECTOR, ...over }) as GameState;

describe("åtgärderna har olika karaktär", () => {
  const s = withDirector();
  const p = s.portfolio[0];

  it("renovering är hyresdrivande – fasad är värdedrivande", () => {
    expect(workRentUplift(p, s, "renovering")).toBeGreaterThan(workRentUplift(p, s, "fasad"));
    expect(workValueUplift(p, s, "fasad")).toBeGreaterThan(0);
    // Per satsad krona: fasaden ger mer värde, renoveringen mer hyra.
    const perKronaValue = (id: "renovering" | "fasad") => workValueUplift(p, s, id) / workCost(p, s, id);
    const perKronaRent = (id: "renovering" | "fasad") => workRentUplift(p, s, id) / workCost(p, s, id);
    expect(perKronaValue("fasad")).toBeGreaterThan(perKronaValue("renovering"));
    expect(perKronaRent("renovering")).toBeGreaterThan(perKronaRent("fasad"));
  });

  it("smart fastighet rör varken hyra eller värde", () => {
    expect(workRentUplift(p, s, "smart")).toBe(0);
    expect(workValueUplift(p, s, "smart")).toBe(0);
    expect(workSpec("smart")!.vacancy).toBeGreaterThan(0);
  });

  it("en åtgärd utan löpande avkastning har oändlig återbetalningstid", () => {
    // Smart fastighet betalar sig via vakansen, energi via driften – båda
    // ändliga. Underhåll ger varken hyra eller sänkt drift.
    expect(workPaybackYears(p, s, "underhåll")).toBe(Infinity);
    expect(workPaybackYears(p, s, "energi")).toBeLessThan(Infinity);
  });

  it("påbyggnad ger en lokal till, och hyra därefter", () => {
    expect(workSpec("påbyggnad")!.capacity).toBe(1);
    expect(workRentUplift(p, s, "påbyggnad")).toBeGreaterThan(workRentUplift(p, s, "tillbygg"));
  });

  it("varje åtgärd hör till en familj och kostar något", () => {
    for (const w of WORKS) {
      expect(["hyra", "värde", "drift"]).toContain(w.family);
      expect(w.cost).toBeGreaterThan(0);
      expect(w.months).toBeGreaterThan(0);
    }
  });
});

describe("vad som går att beställa", () => {
  it("utvecklingsprojekt kräver tomt hus", () => {
    const let_ = house();
    const empty = house({ tenants: [] });
    expect(workAvailable(let_, "totalrenovering")).toBe(false);
    expect(workAvailable(empty, "totalrenovering")).toBe(true);
    expect(workAvailable(let_, "renovering")).toBe(true); // hyresgästerna bor kvar
  });

  it("en redan gjord uppgradering går inte att göra om", () => {
    expect(workAvailable(house({ upgrades: ["fasad"] }), "fasad")).toBe(false);
  });

  it("ett hus med pågående arbete får inte ett till", () => {
    const busy = house({ pendingWorks: [{ kind: "underhåll" as const, monthsLeft: 1 }] });
    expect(workAvailable(busy, "renovering")).toBe(false);
  });
});

describe("renoveringsprogrammet", () => {
  const program = (allowed: string[], over: Partial<GameState> = {}) =>
    withDirector({ policy: { autoWorks: { enabled: true, allowed, cashFloor: 1_000_000 } }, ...over });

  it("avstängt program beställer ingenting", () => {
    const s = withDirector({ policy: { autoWorks: { enabled: false, allowed: ["renovering"], cashFloor: 0 } } });
    expect(pickManagerWork(s)).toBeNull();
  });

  it("utan direktör händer ingenting – programmet är direktörens", () => {
    const s = program(["renovering"], { globalManager: undefined });
    expect(pickManagerWork(s)).toBeNull();
  });

  it("tom lista betyder att direktören inte renoverar alls", () => {
    expect(pickManagerWork(program([]))).toBeNull();
  });

  it("bara ikryssade åtgärder beställs", () => {
    const job = pickManagerWork(program(["fasad"]));
    expect(job?.work).toBe("fasad");
  });

  it("kassagolvet stoppar jobbet", () => {
    const s = program(["renovering"], { cash: 1_500_000 });
    expect(pickManagerWork(s)).toBeNull();
  });

  it("beställningen dras från kassan och lägger ett arbete på huset", () => {
    const s = program(["fasad"]);
    const after = advanceMonth(s);
    expect(after.cash).toBeLessThan(s.cash);
    expect((after.portfolio[0].pendingWorks ?? []).some((w) => w.upgradeId === "fasad")).toBe(true);
  });

  it("ett jobb i månaden – inte ett per hus", () => {
    const s = program(["fasad", "smart", "energi"], {
      portfolio: [house(), house({ id: 2 }), house({ id: 3 })],
    });
    const after = advanceMonth(s);
    const started = after.portfolio.filter((p) => (p.pendingWorks ?? []).some((w) => w.kind === "uppgradering"));
    expect(started).toHaveLength(1);
  });

  it("utvecklingsprojekt tas bara på hus som redan står tomma", () => {
    const letOut = program(["totalrenovering"]);
    expect(pickManagerWork(letOut)).toBeNull();
    const empty = program(["totalrenovering"], { portfolio: [house({ tenants: [] })] });
    expect(pickManagerWork(empty)?.work).toBe("totalrenovering");
  });

  it("ett projekt tar huset ur drift under byggtiden", () => {
    const s = program(["totalrenovering"], { portfolio: [house({ tenants: [] })] });
    const after = advanceMonth(s);
    expect(after.portfolio[0].status).toBe("bygger");
    expect(after.portfolio[0].renovation?.kind).toBe("totalrenovering");
  });

  it("programmet går att ställa in via policy-action", () => {
    const s = withDirector();
    const after = reducer(s, {
      type: "SET_POLICY",
      policy: { autoWorks: { enabled: true, allowed: ["fasad", "energi"], cashFloor: 2_000_000 } },
    });
    expect(after.policy?.autoWorks?.allowed).toEqual(["fasad", "energi"]);
    expect(after.policy?.autoWorks?.enabled).toBe(true);
  });

  it("underhåll styrs av skicktröskeln, inte av programmet", () => {
    // Underhåll finns i katalogen för att kunna jämföras, men programmet
    // beställer det aldrig – annars skulle två system beställa samma jobb.
    const s = program(["underhåll"], { portfolio: [house({ condition: 20 })] });
    expect(pickManagerWork(s)).toBeNull();
  });
});
