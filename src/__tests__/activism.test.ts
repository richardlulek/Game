import { describe, expect, it } from "vitest";
import { reducer } from "../engine/reducer";
import type { Competitor, GameState, Stock } from "../engine/types";
import { makeState } from "./factories";

/* Aktieägaraktivism: en ägarpost ≥ 10 % i en rival låter dig tvinga fram en
   extrautdelning som tömmer deras kassa och ger dig din pro rata-andel. */

const rival = (over: Partial<Competitor> = {}): Competitor => ({
  name: "Harborwick Group",
  cash: 20_000_000,
  units: 0,
  equity: 80_000_000,
  portfolio: [],
  strategy: "värde",
  ...over,
});

const stockFor = (name: string, ownedPct: number): Stock => ({
  id: `st_${name}`,
  name,
  sector: "fastighet",
  price: 50,
  prevPrice: 50,
  sharesOutstanding: 1_000_000,
  owned: Math.round(1_000_000 * ownedPct),
  avgCost: 40,
  dividendYield: 0,
  beta: 1,
  drift: 0,
  volatility: 0.03,
  history: [50],
  competitorName: name,
});

function base(ownedPct: number, cash = 20_000_000): GameState {
  const c = rival({ cash });
  return makeState({ cash: 5_000_000, competitors: [c], stocks: [stockFor(c.name, ownedPct)], standing: { rivals: { [c.name]: 0 } } });
}

describe("AKTIEÄGARAKTIVISM: tvingad extrautdelning", () => {
  it("en post ≥ 10 % tömmer rivalens kassa och ger dig din andel", () => {
    const s = base(0.2); // 20 %
    const after = reducer(s, { type: "ACTIVIST_DIVIDEND", competitorName: "Harborwick Group" });
    // Utdelning = 35 % av 20M = 7M; din andel 20 % = 1.4M.
    expect(after.cash - s.cash).toBe(1_400_000); // 20% av 35%×20M
    expect(after.competitors[0].cash).toBe(13_000_000); // 35% av kassan ut
    expect(after.standing?.rivals?.["Harborwick Group"]).toBeLessThan(0);
    // Cooldown: en andra kampanj direkt avvisas.
    const again = reducer(after, { type: "ACTIVIST_DIVIDEND", competitorName: "Harborwick Group" });
    expect(again.cash).toBe(after.cash);
  });

  it("under 10 % ägande går kampanjen inte att driva", () => {
    const s = base(0.05); // 5 %
    const after = reducer(s, { type: "ACTIVIST_DIVIDEND", competitorName: "Harborwick Group" });
    expect(after.cash).toBe(s.cash); // inget hände
    expect(after.competitors[0].cash).toBe(20_000_000);
  });
});
