/* Tunna delar 6/7: politiskt kapital gör politiken till en löpande relation.
   Donationer bygger, impopularitet eroderar, kapitalet spenderas mellan valen. */

import { describe, expect, it } from "vitest";
import {
  CAPITAL_HEAT_THRESHOLD,
  FAVOR_REQUEST_COST,
  campaignWinBoost,
  nextPoliticalCapital,
  politicalCapital,
} from "../engine/politics";
import { reducer } from "../engine/reducer";
import type { GameState } from "../engine/types";
import { makeState } from "./factories";

describe("POLITISKT KAPITAL: bygg, erodera, spendera", () => {
  it("kapitalet är klämt till 0–100", () => {
    expect(politicalCapital(makeState({ politics: { capital: 60 } }))).toBe(60);
    expect(politicalCapital(makeState({ politics: { capital: 150 } }))).toBe(100);
    expect(politicalCapital(makeState({}))).toBe(0);
  });

  it("ett campaign-beslut bygger kapital via RESOLVE_DECISION", () => {
    const s = makeState({ cash: 50_000_000, pendingDecision: {
      id: "election_campaign", title: "t", text: "t",
      options: [{ label: "Donate", detail: "d", effect: { cash: -2_000_000, campaign: { party: "borgerlig", amount: 2_000_000, secret: false }, log: "l", logKind: "expense" } }],
    } });
    const after = reducer(s, { type: "RESOLVE_DECISION", optionIndex: 0 });
    expect(after.politics?.capital).toBe(30); // CAPITAL_OPEN
  });

  it("hög presshetta eroderar kapitalet snabbare än avklingningen", () => {
    const calm = nextPoliticalCapital(makeState({ politics: { capital: 50 }, pressHeat: 0 }));
    const heated = nextPoliticalCapital(makeState({ politics: { capital: 50 }, pressHeat: CAPITAL_HEAT_THRESHOLD + 6 }));
    expect(calm).toBe(49); // ren avklingning −1
    expect(heated).toBeLessThan(calm - 5); // impopularitet biter
  });

  it("kapital ≥ 50 ger vinstchansboost", () => {
    expect(campaignWinBoost(makeState({ politics: { capital: 20 } }))).toBe(0);
    expect(campaignWinBoost(makeState({ politics: { capital: 60 } }))).toBe(0.08);
  });

  it("interimtjänsten spenderar kapital och ger välvilja mellan valen", () => {
    const s = makeState({ politics: { capital: FAVOR_REQUEST_COST + 10 }, electionResult: "The Builders" });
    const after = reducer(s, { type: "REQUEST_POLITICAL_FAVOR" });
    expect(after.politics?.favorMonthsLeft).toBe(12);
    expect(after.politics?.capital).toBe(10);
    // För lite kapital: begäran studsar.
    const poor: GameState = makeState({ politics: { capital: 10 } });
    expect(reducer(poor, { type: "REQUEST_POLITICAL_FAVOR" }).politics?.favorMonthsLeft ?? 0).toBe(0);
    // Har man redan välvilja går det inte att stapla.
    const hasFavor = makeState({ politics: { capital: 90, favorMonthsLeft: 5 } });
    expect(reducer(hasFavor, { type: "REQUEST_POLITICAL_FAVOR" }).politics?.capital).toBe(90);
  });
});
