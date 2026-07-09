import { describe, expect, it, vi } from "vitest";
import {
  buildingAge,
  isObsolete,
  nextBidRound,
  obsolescenceFactor,
} from "../engine/lifecycle";
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
