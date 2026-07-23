/* Tunna delar 5/7: asymmetrier utjämnade. Uppstickare växer upp och
   börsnoteras; rivalfusioner prövas av konkurrensmyndigheten precis som
   spelarens affärer. */

import { describe, expect, it } from "vitest";
import { rivalMergerBlocked } from "../engine/mna";
import { clearRng, seedRng } from "../engine/random";
import { advanceMonth } from "../engine/simulation";
import type { Competitor, GameState } from "../engine/types";
import { makeProperty, makeState } from "./factories";

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

function rival(name: string, over: Partial<Competitor> = {}): Competitor {
  return { name, cash: 10_000_000, units: 0, equity: 100_000_000, portfolio: [], strategy: "värde", ...over };
}

describe("UPPSTICKAREN VÄXER UPP: graduation + notering", () => {
  it("en liten aktör med kapital och bestånd tappar small-flaggan och noteras", () => {
    seedRng(211);
    try {
      const houses = Array.from({ length: 7 }, (_, i) => makeProperty({ id: 8500 + i, district: "förort", owned: false, askPrice: 25_000_000 }));
      let s = makeState({
        competitors: [rival("Ladder Capital", { small: true, equity: 200_000_000, cash: 40_000_000, portfolio: houses })],
        stocks: [],
      });
      s = tick(s);
      const graduate = s.competitors.find((c) => c.name === "Ladder Capital")!;
      expect(graduate.small).toBeFalsy();
      expect(s.stocks.some((st) => st.competitorName === "Ladder Capital")).toBe(true);
      expect(s.log.some((e) => e.t.includes("COMING OF AGE"))).toBe(true);
    } finally {
      clearRng();
    }
  });

  it("en liten aktör under trösklarna förblir uppstickare", () => {
    seedRng(211);
    try {
      let s = makeState({
        competitors: [rival("Oakvale & Sons", { small: true, equity: 40_000_000, portfolio: [makeProperty({ id: 8600, owned: false })] })],
      });
      s = tick(s);
      expect(s.competitors.find((c) => c.name === "Oakvale & Sons")!.small).toBe(true);
    } finally {
      clearRng();
    }
  });
});

describe("KONKURRENSVAKTEN: gäller även rivalfusioner", () => {
  it("blockdetektorn slår när en fusion ger monopol i ett distrikt", () => {
    const buyer = rival("A", { portfolio: [1, 2, 3].map((n) => makeProperty({ id: 8700 + n, district: "hamnen", owned: false })) });
    const target = rival("B", { portfolio: [4, 5].map((n) => makeProperty({ id: 8700 + n, district: "hamnen", owned: false })) });
    const other = rival("C", { portfolio: [makeProperty({ id: 8710, district: "hamnen", owned: false })] });
    const s = makeState({ competitors: [buyer, target, other] });
    // Sammanslaget 5 av 6 i hamnen = 83 % > 55 %.
    expect(rivalMergerBlocked(s, buyer, target)).toBe("hamnen");
    // Utan dominans: ingen blockering.
    const spread = rival("D", { portfolio: [makeProperty({ id: 8720, district: "centrum", owned: false })] });
    expect(rivalMergerBlocked(s, spread, other)).toBeNull();
  });
});
