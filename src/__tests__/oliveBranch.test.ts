/* Olivkvistar: aktiv relationsreparation. Gest med kostnad och cooldown,
   och att demonstrativt kliva åt sidan i budgivningar bygger också. */

import { describe, expect, it } from "vitest";
import { reducer } from "../engine/reducer";
import type { Competitor } from "../engine/types";
import { makeState } from "./factories";

const rival: Competitor = {
  name: "Harborview Capital", cash: 20_000_000, units: 0, equity: 400_000_000,
  portfolio: [], strategy: "tillväxt",
};

describe("OLIVKVISTEN: dyr, synlig och begränsad", () => {
  it("tinar relationen mot betalning, en gång per halvår", () => {
    let s = makeState({
      cash: 20_000_000,
      competitors: [rival],
      standing: { rivals: { "Harborview Capital": -40 } },
    });
    s = reducer(s, { type: "SEND_OLIVE_BRANCH", rivalName: rival.name });
    expect(s.standing?.rivals?.[rival.name]).toBe(-34);
    expect(s.cash).toBe(20_000_000 - 2_000_000); // 0.5 % av 400M
    // Cooldown: nästa gest studsar.
    const again = reducer(s, { type: "SEND_OLIVE_BRANCH", rivalName: rival.name });
    expect(again.standing?.rivals?.[rival.name]).toBe(-34);
    expect(again.cash).toBe(s.cash);
  });

  it("kostnaden har golv och tak", () => {
    const small: Competitor = { ...rival, name: "Oakvale & Sons", equity: 10_000_000 };
    const huge: Competitor = { ...rival, name: "Sterling & Partners", equity: 5_000_000_000 };
    const s1 = reducer(makeState({ cash: 20_000_000, competitors: [small] }), { type: "SEND_OLIVE_BRANCH", rivalName: small.name });
    expect(20_000_000 - s1.cash).toBe(500_000);
    const s2 = reducer(makeState({ cash: 20_000_000, competitors: [huge] }), { type: "SEND_OLIVE_BRANCH", rivalName: huge.name });
    expect(20_000_000 - s2.cash).toBe(5_000_000);
  });
});

describe("ATT KLIVA ÅT SIDAN: budgivningsdiplomati", () => {
  it("PASS_COMPETING_BID värmer relationen med budgivaren", () => {
    const s = makeState({
      competitors: [rival],
      competingBid: { listingId: 1, rivalName: rival.name, amount: 10_000_000, expiresAbs: 20, round: 1 },
    });
    const after = reducer(s, { type: "PASS_COMPETING_BID" });
    expect(after.competingBid).toBeUndefined();
    expect(after.standing?.rivals?.[rival.name]).toBe(2);
    expect(after.log[0].t).toContain("step aside");
  });
});
