/* M&A 2.0 batch 4: integrationen. Synergier är ett mål som realiseras när
   friktionen är över – kulturkrock, förhöjd drift, churn, och rea-stämpel
   på hus som flippas under integrationen. Fientliga köp realiserar mindre. */

import { describe, expect, it } from "vitest";
import {
  FLIP_DISCOUNT,
  HOSTILE_REALIZE,
  INTEGRATION_FRICTION,
  INTEGRATION_MONTHS,
  executeAcquisition,
  integrationScore,
} from "../engine/mna";
import { clearRng, seedRng } from "../engine/random";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { Competitor, GameState } from "../engine/types";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

function rival(over: Partial<Competitor> = {}): Competitor {
  return {
    name: "Målbolaget AB",
    cash: 5_000_000,
    units: 0,
    equity: 60_000_000,
    portfolio: [
      makeProperty({
        id: 7600,
        owned: false,
        askPrice: 40_000_000,
        opexMult: 1,
        tenants: [makeTenantFixture({ id: 7601, satisfaction: 70 })],
      }),
    ],
    strategy: "värde",
    ...over,
  };
}

describe("INTEGRATIONEN: friktion vid köpet, upplösning vid slutet", () => {
  it("förvärvet startar integration: friktion, kulturkrock och rea-stämpel", () => {
    const s0 = makeState({ cash: 200_000_000, competitors: [rival()], ddDone: ["Målbolaget AB"] });
    const res = executeAcquisition(s0, "Målbolaget AB", 90_000_000, "kontant");
    expect(res.error).toBeUndefined();
    const s = res.state;
    expect(s.integrations).toHaveLength(1);
    expect(s.integrations![0].months).toBe(INTEGRATION_MONTHS);
    const p = s.portfolio.find((x) => x.id === 7600)!;
    expect(p.opexMult).toBeCloseTo(INTEGRATION_FRICTION, 3);
    expect(p.tenants[0].satisfaction).toBe(60); // −10 kulturkrock
    expect(p.integrationUntilAbs).toBeGreaterThan(s.year * 12 + s.month);
    // Integrationskostnaden drogs (2 % av priset) utöver köpeskillingen.
    expect(s.cash).toBeLessThanOrEqual(200_000_000 - 90_000_000 - 1_800_000 + 5_000_000);
  });

  it("integrationen fullbordas: friktionen släpper och utfallet graderas", () => {
    seedRng(139);
    try {
      const s0 = makeState({
        cash: 200_000_000,
        competitors: [rival()],
        ddDone: ["Målbolaget AB"],
        staff: { forvaltningschef: 3 }, // integrationspoäng > 0.6
      });
      let s = executeAcquisition(s0, "Målbolaget AB", 90_000_000, "kontant").state;
      for (let m = 0; m <= INTEGRATION_MONTHS + 1; m++) s = tick(s);
      expect(s.integrations).toHaveLength(0);
      const p = s.portfolio.find((x) => x.id === 7600)!;
      expect(p.opexMult).toBeLessThan(INTEGRATION_FRICTION); // friktionen släppt
      expect(s.log.some((e) => e.t.includes("INTEGRATION"))).toBe(true);
    } finally {
      clearRng();
    }
  });

  it("retention: en avgift låser teamet, är idempotent och kräver kassa", () => {
    const s0 = makeState({ cash: 300_000_000, competitors: [rival()], ddDone: ["Målbolaget AB"], staff: { forvaltningschef: 3 } });
    let s = executeAcquisition(s0, "Målbolaget AB", 90_000_000, "kontant").state;
    expect(s.integrations).toHaveLength(1);
    const before = s.cash;
    s = reducer(s, { type: "INTEGRATION_RETENTION", target: "Målbolaget AB" });
    expect(s.integrations![0].retained).toBe(true);
    expect(s.cash).toBeLessThan(before); // avgiften drogs
    // Redan retained → ingen dubbeldebitering.
    const again = reducer(s, { type: "INTEGRATION_RETENTION", target: "Målbolaget AB" });
    expect(again.cash).toBe(s.cash);
  });

  it("integrationspoängen: stab höjer, fientligt köp sänker realiseringen", () => {
    expect(integrationScore(makeState({}))).toBeCloseTo(0.6, 2);
    expect(integrationScore(makeState({ staff: { a: 5, b: 5 } }))).toBeCloseTo(0.8, 2);
    expect(integrationScore(makeState({ staff: { a: 30 } }))).toBe(1);
    expect(HOSTILE_REALIZE).toBeLessThan(1);
  });

  it("fientligt förvärv flaggas i integrationen", () => {
    const s0 = makeState({ cash: 300_000_000, competitors: [rival()], ddDone: ["Målbolaget AB"] });
    const res = executeAcquisition(s0, "Målbolaget AB", 90_000_000, "kontant", { hostile: true });
    expect(res.state.integrations![0].hostile).toBe(true);
  });
});

describe("REA-STÄMPELN: flippa inte under integrationen", () => {
  it("snabbförsäljning inom stämpeln säljs med extra rabatt", () => {
    const now = 13; // år 1, månad 1
    const stamped = makeProperty({ id: 7610, integrationUntilAbs: now + 6 });
    const clean = makeProperty({ id: 7611 });
    const s = makeState({ portfolio: [stamped, clean], debt: 0 });
    const soldStamped = reducer(s, { type: "SELL", id: 7610 });
    const soldClean = reducer(s, { type: "SELL", id: 7611 });
    const gained = (st: GameState) => st.cash - s.cash;
    expect(gained(soldStamped)).toBeCloseTo(gained(soldClean) * FLIP_DISCOUNT, -4);
  });
});
