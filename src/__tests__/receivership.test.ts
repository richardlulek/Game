/* Tester för rekonstruktionsmenyn: spelarval, förvaltarens auto-läge,
   upplösning och konkursvalet. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { propMarketValue } from "../engine/property";
import {
  RECEIVER_AUTO_FACTOR,
  RECEIVER_CHOICE_FACTOR,
  distressQuote,
  isInsolvent,
  maxRaisable,
  receiverAutoLiquidate,
} from "../engine/receivership";
import { reducer } from "../engine/reducer";
import type { GameState } from "../engine/types";
import { makeProperty, makeState } from "./factories";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Kris-tillstånd: en fastighet, djupt negativ kassa, meny öppen. */
function crisisState(over: Partial<GameState> = {}): GameState {
  const p = makeProperty({ id: 1, tenants: [] });
  return makeState({
    portfolio: [p],
    cash: -1_400_000,
    debt: 0,
    receivership: { shortfall: 1_400_000, enteredAbs: 13 },
    ...over,
  });
}

describe("distressQuote & insolvensmatte", () => {
  it("spelarval (−25 %) ger bättre pris än förvaltaren (−35 %)", () => {
    const s = crisisState();
    const p = s.portfolio[0];
    const choice = distressQuote(p, s, RECEIVER_CHOICE_FACTOR);
    const auto = distressQuote(p, s, RECEIVER_AUTO_FACTOR);
    expect(choice.salePrice).toBeGreaterThan(auto.salePrice);
    expect(choice.value).toBe(propMarketValue(p, s));
  });

  it("isInsolvent: sant utan tillgångar, falskt med säljbart hus", () => {
    expect(isInsolvent(makeState({ portfolio: [], cash: -2_000_000 }))).toBe(true);
    expect(isInsolvent(crisisState())).toBe(false);
    expect(maxRaisable(crisisState())).toBeGreaterThan(0);
  });
});

describe("RECEIVER_SELL (spelarens val i menyn)", () => {
  it("säljer till −25 %, betalar av skuld och återannonserar huset", () => {
    const s = crisisState({ debt: 5_000_000 });
    const p = s.portfolio[0];
    const q = distressQuote(p, s, RECEIVER_CHOICE_FACTOR);
    const next = reducer(s, { type: "RECEIVER_SELL", id: 1 });
    expect(next.portfolio.length).toBe(0);
    expect(next.cash).toBe(s.cash + q.net);
    expect(next.debt).toBe(Math.max(0, s.debt - q.payoff));
    expect(next.listings.some((l) => (l.txHistory ?? []).some((tx) => tx.party.includes("restructuring")))).toBe(true);
    expect(next.receivership).toBeDefined(); // menyn stängs inte av en försäljning
  });

  it("vägrar sälja morfars hus under kampanjen (villkor 7b)", () => {
    const heirloom = makeProperty({ id: 7, tenants: [], storyTag: "arvet" });
    const s = crisisState({
      portfolio: [heirloom],
      story: { beat: "banken", flags: [] },
    });
    const next = reducer(s, { type: "RECEIVER_SELL", id: 7 });
    expect(next.portfolio.length).toBe(1); // orört
  });

  it("no-op utan aktiv rekonstruktion", () => {
    const s = makeState({ portfolio: [makeProperty({ id: 1 })], cash: 1_000_000 });
    expect(reducer(s, { type: "RECEIVER_SELL", id: 1 })).toBe(s);
  });
});

describe("RECEIVER_AUTO (lämna över till förvaltaren)", () => {
  it("likviderar till −35 % tills kassan är över noll och stänger menyn", () => {
    const s = crisisState();
    const next = reducer(s, { type: "RECEIVER_AUTO" });
    expect(next.receivership).toBeUndefined();
    expect(next.gameOver).toBe(false);
    expect(next.cash).toBeGreaterThan(0);
    expect(next.listings.some((l) => (l.txHistory ?? []).some((tx) => tx.party.includes("Receiver")))).toBe(true);
  });

  it("receiverAutoLiquidate säljer bäst-netto-först", () => {
    const small = makeProperty({ id: 1, tenants: [], area: 300, baseRent: 30_000, askPrice: 300_000 });
    const big = makeProperty({ id: 2, tenants: [], area: 3000, baseRent: 300_000, askPrice: 3_000_000 });
    const s = makeState({ portfolio: [small, big], cash: -100_000, debt: 0 });
    const res = receiverAutoLiquidate(s);
    expect(res.sold).toBe(1); // en räcker
    expect(res.state.portfolio.map((p) => p.id)).toEqual([1]); // stora (bäst netto) såldes
  });
});

describe("RESOLVE_RECEIVERSHIP & ACCEPT_BANKRUPTCY", () => {
  it("upplösning kräver kassa ≥ 0", () => {
    const broke = crisisState();
    const still = reducer(broke, { type: "RESOLVE_RECEIVERSHIP" });
    expect(still.receivership).toBeDefined(); // nekad

    const solventState = { ...broke, cash: 50_000 };
    const done = reducer(solventState, { type: "RESOLVE_RECEIVERSHIP" });
    expect(done.receivership).toBeUndefined();
    expect(done.gameOver).toBe(false);
  });

  it("ACCEPT_BANKRUPTCY avslutar spelet på spelarens initiativ", () => {
    const next = reducer(crisisState(), { type: "ACCEPT_BANKRUPTCY" });
    expect(next.gameOver).toBe(true);
    expect(next.receivership).toBeUndefined();
  });
});
