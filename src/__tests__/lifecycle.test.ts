import { describe, expect, it, vi } from "vitest";
import {
  buildingAge,
  isObsolete,
  nextBidRound,
  obsolescenceFactor,
} from "../engine/lifecycle";
import { maxDevLevel } from "../engine/districtTiers";
import { advanceMonth } from "../engine/simulation";
import { makeProperty, makeState } from "./factories";

describe("Byggnadslivscykel", () => {
  it("nya hus har full faktor, gamla eftersatta hus lägre", () => {
    const s = makeState({ year: 40 });
    const fresh = makeProperty({ builtYear: 39 });
    const old = makeProperty({ builtYear: 1, condition: 40 });
    expect(obsolescenceFactor(fresh, s)).toBe(1);
    expect(obsolescenceFactor(old, s)).toBeLessThan(1);
    expect(buildingAge(old, s)).toBe(39);
    expect(isObsolete(old, s)).toBe(true);
  });

  it("obsolescensfaktorn bottnar vid 0.7", () => {
    const s = makeState({ year: 200 });
    const ancient = makeProperty({ builtYear: 1, condition: 20 });
    expect(obsolescenceFactor(ancient, s)).toBeGreaterThanOrEqual(0.7);
  });

  it("underhåll (gott skick) bromsar åldrandet – välskött slår oskött", () => {
    const s = makeState({ year: 50 });
    const wellKept = makeProperty({ builtYear: 1, condition: 100 });
    const neglected = makeProperty({ builtYear: 1, condition: 30 });
    expect(obsolescenceFactor(wellKept, s)).toBeGreaterThan(obsolescenceFactor(neglected, s));
    // Ett välskött gammalt hus behöver inte rivas.
    expect(isObsolete(wellKept, s)).toBe(false);
    expect(isObsolete(neglected, s)).toBe(true);
  });

  it("totalrenovering (nollställd builtYear) återställer full faktor", () => {
    const s = makeState({ year: 50 });
    const renovated = makeProperty({ builtYear: 50, condition: 100 });
    expect(obsolescenceFactor(renovated, s)).toBe(1);
  });
});

describe("Utbyggnad syns på kartan (devLevel)", () => {
  it("färdig påbyggnad höjer devLevel och ytan", () => {
    const p = makeProperty({ status: "bygger", buildLeft: 1, renovation: { kind: "påbyggnad" }, area: 1000 });
    const next = advanceMonth(makeState({ portfolio: [p], debt: 0 }));
    const np = next.portfolio[0];
    expect(np.status).toBe("klar");
    expect(np.devLevel).toBe(1);
    expect(np.area).toBeGreaterThan(1000);
  });

  it("färdig nybyggnation höjer devLevel", () => {
    const p = makeProperty({ status: "bygger", buildLeft: 1, renovation: { kind: "nybyggnation" }, area: 1000 });
    const next = advanceMonth(makeState({ portfolio: [p], debt: 0 }));
    expect(next.portfolio[0].devLevel).toBe(1);
  });
});

describe("Investeringsdriven mognad (Fas 2 – höjdtak)", () => {
  it("investeringstaket stiger med distriktets status", () => {
    const eftersatt = makeState({ districtDev: { centrum: 0.8 } });
    const exklusivt = makeState({ districtDev: { centrum: 1.4 } });
    expect(maxDevLevel(exklusivt, "centrum")).toBeGreaterThan(maxDevLevel(eftersatt, "centrum"));
  });

  it("påbyggnad reser inte huset över distriktets tak", () => {
    // Eftersatt distrikt: tak = devLevel 1. Ett hus som redan är på taket
    // får inte fler våningar av ännu en påbyggnad.
    const p = makeProperty({ status: "bygger", buildLeft: 1, renovation: { kind: "påbyggnad" }, district: "centrum", devLevel: 1 });
    const next = advanceMonth(makeState({ portfolio: [p], debt: 0, districtDev: { centrum: 0.8 } }));
    expect(next.portfolio[0].devLevel).toBe(1);
  });

  it("i ett moget distrikt fortsätter huset att resa sig", () => {
    const p = makeProperty({ status: "bygger", buildLeft: 1, renovation: { kind: "påbyggnad" }, district: "centrum", devLevel: 1 });
    const next = advanceMonth(makeState({ portfolio: [p], debt: 0, districtDev: { centrum: 1.4 } }));
    expect(next.portfolio[0].devLevel).toBe(2);
  });
});

describe("Budkrig", () => {
  it("rivalen ger sig senast efter runda 3", () => {
    expect(nextBidRound(1_000_000, 3).fold).toBe(true);
  });

  it("motbudet är högre om rivalen kontrar", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const r = nextBidRound(1_000_000, 1);
    vi.restoreAllMocks();
    expect(r.fold).toBe(false);
    expect(r.amount).toBeGreaterThan(1_000_000);
  });
});
