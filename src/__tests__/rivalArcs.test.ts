/* Tester för rivalberättelser: nemesis, relationer och konjunktureffekt. */

import { describe, expect, it } from "vitest";
import {
  NEMESIS_THRESHOLD,
  hasRelation,
  nemesisOf,
  relationSummary,
  relationsFor,
  rivalCycleMult,
} from "../engine/rivalArcs";
import type { Competitor, GameState } from "../engine/types";
import { makeState } from "./factories";

function comp(name: string, equity = 10_000_000): Competitor {
  return { name, cash: 1_000_000, units: 0, equity, portfolio: [], strategy: "tillväxt" };
}

describe("nemesisOf", () => {
  it("returnerar null när ingen rival är tillräckligt fientlig", () => {
    const s = makeState({ competitors: [comp("Northgate")], standing: { rivals: { Northgate: -20 } } });
    expect(nemesisOf(s)).toBeNull();
  });

  it("utser den mest fientliga rivalen under tröskeln", () => {
    const s = makeState({
      competitors: [comp("Northgate"), comp("Wellspring")],
      standing: { rivals: { Northgate: -50, Wellspring: -45 } },
    });
    expect(NEMESIS_THRESHOLD).toBe(-40);
    expect(nemesisOf(s)).toBe("Northgate");
  });

  it("bryter lika standing till den starkaste rivalen", () => {
    const s = makeState({
      competitors: [comp("Northgate", 10_000_000), comp("Wellspring", 50_000_000)],
      standing: { rivals: { Northgate: -60, Wellspring: -60 } },
    });
    expect(nemesisOf(s)).toBe("Wellspring");
  });
});

describe("rival relations", () => {
  const base: Partial<GameState> = {
    competitors: [comp("Northgate"), comp("Wellspring"), comp("Coastline")],
    rivalRelations: [
      { a: "Northgate", b: "Wellspring", kind: "alliance", since: 1 },
      { a: "Coastline", b: "Northgate", kind: "feud", since: 2 },
    ],
  };

  it("hittar relationer i båda riktningarna", () => {
    const s = makeState(base);
    expect(hasRelation(s, "Wellspring", "Northgate")).toBe(true);
    expect(relationsFor(s, "Northgate")).toHaveLength(2);
  });

  it("sammanfattar allianser och fejder", () => {
    const s = makeState(base);
    const sum = relationSummary(s, "Northgate")!;
    expect(sum).toContain("allied with Wellspring");
    expect(sum).toContain("feuding with Coastline");
  });

  it("ger allierade medvind och fejdande motvind", () => {
    const s = makeState(base);
    expect(rivalCycleMult(s, "Wellspring")).toBeGreaterThan(1); // allians
    expect(rivalCycleMult(s, "Coastline")).toBeLessThan(1);     // fejd
    // Northgate har en allians (+) och en fejd (−) → netto ~1.
    expect(rivalCycleMult(s, "Northgate")).toBeCloseTo(1, 5);
  });
});
