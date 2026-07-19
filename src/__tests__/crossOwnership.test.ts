import { describe, expect, it } from "vitest";
import { clearRng, seedRng } from "../engine/random";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import { fbabSharesOf, rivalFbabShares } from "../engine/stocks";
import type { Competitor, GameState } from "../engine/types";
import { makeProperty, makeState } from "./factories";

/* Korsägande à la Capitalism: rivalerna handlar aktier i varandra och i
   SPELARENS bolag. Vakterna: köpen sker ur den FRIA floaten (aktivist +
   andra rivaler + 10 %-spridning fredas, max 10 % per rival), innehaven
   ingår i rivalens equity, utdelningar betalas pro rata och återköp
   köper ut rivalerna proportionellt mot betalning. */

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

function rival(name: string, cash: number, holdings?: Competitor["stockHoldings"]): Competitor {
  return {
    name,
    cash,
    units: 0,
    equity: 0,
    strategy: "värde",
    portfolio: [],
    ...(holdings ? { stockHoldings: holdings } : {}),
  };
}

function listedState(extra: Partial<GameState> = {}): GameState {
  const s0 = makeState({
    cash: 10_000_000,
    portfolio: [makeProperty({ id: 1 })],
    competitors: [rival("Croneborg Bygg", 60_000_000)],
    ...extra,
  });
  return reducer(s0, { type: "DO_IPO", float: 0.49 });
}

describe("KORSÄGANDE: rivaler köper aktier i varandra och i ditt bolag", () => {
  it("rivaler bygger FBAB-positioner ur fria floaten – med tak", () => {
    seedRng(3);
    try {
      let s = listedState();
      for (let m = 0; m < 48; m++) s = tick(s);
      const total = s.ipoShares!.total;
      const rivalSh = rivalFbabShares(s);
      // Någon gång under 4 år ska minst en rival ha handlat (värdestrategi,
      // gott om kassa) – och taken ska hålla.
      for (const c of s.competitors) {
        expect(fbabSharesOf(c) / total).toBeLessThanOrEqual(0.1 + 1e-9); // max 10 % per rival
      }
      const activistSh = Math.round((total * (s.takeoverPressure ?? 0)) / 100);
      // Aktivist + rivaler ryms alltid inom publika floaten.
      expect(activistSh + rivalSh).toBeLessThanOrEqual(s.ipoShares!.public);
    } finally {
      clearRng();
    }
  });

  it("innehaven ingår i rivalens equity (mark-to-market)", () => {
    seedRng(5);
    try {
      const s0 = listedState({
        competitors: [
          rival("Croneborg Bygg", 10_000_000, [{ stockId: "FBAB", shares: 500_000, avgCost: 1 }]),
        ],
      });
      const s1 = tick(s0);
      const c = s1.competitors[0];
      // Equity ska överstiga kassan med innehavets värde (portföljen är tom,
      // så mellanskillnaden ÄR aktieposten – värderad till månadens kurs).
      expect(c.equity).toBeGreaterThan(c.cash + 500_000);
    } finally {
      clearRng();
    }
  });

  it("utdelning betalar rivalägare pro rata", () => {
    const s1 = {
      ...listedState({
        competitors: [rival("Croneborg Bygg", 1_000_000, [{ stockId: "FBAB", shares: 1_000_000, avgCost: 1 }])],
      }),
      cash: 10_000_000,
    };
    const s2 = reducer(s1, { type: "PAY_DIVIDEND", amount: 1_000_000 });
    // Rivalen äger 10 % av 10M aktier → 100 000 kr.
    expect(s2.competitors[0].cash).toBe(1_100_000);
    expect(s2.ownerWealth).toBe(510_000); // ägarens 51 %
  });

  it("återköp köper ut rivalerna proportionellt – mot betalning", () => {
    const s1 = {
      ...listedState({
        competitors: [rival("Croneborg Bygg", 1_000_000, [{ stockId: "FBAB", shares: 1_000_000, avgCost: 1 }])],
      }),
      cash: 50_000_000,
    };
    const heldBefore = fbabSharesOf(s1.competitors[0]);
    const s2 = reducer(s1, { type: "SHARE_BUYBACK", amount: 20_000_000 });
    const heldAfter = fbabSharesOf(s2.competitors[0]);
    expect(heldAfter).toBeLessThan(heldBefore);
    expect(s2.competitors[0].cash).toBeGreaterThan(1_000_000); // fick betalt
  });

  it("privata köp begränsas av rivalernas innehav", () => {
    const s1 = {
      ...listedState({
        competitors: [rival("Croneborg Bygg", 1_000_000, [{ stockId: "FBAB", shares: 3_000_000, avgCost: 1 }])],
      }),
      ownerWealth: 10_000_000_000,
    };
    const s2 = reducer(s1, { type: "BUY_OWN_SHARES", amount: 10_000_000_000 });
    // Rivalens 3M aktier är inte till salu (de räknas som publik spridning),
    // så spelaren kan bara köpa den fria floaten: publika delen bottnar på
    // exakt rivalens innehav.
    expect(s2.ipoShares!.public).toBe(3_000_000);
  });
});
