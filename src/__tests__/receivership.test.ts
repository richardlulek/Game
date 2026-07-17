/* Tester för rekonstruktionsmenyn: spelarval, förvaltarens auto-läge,
   upplösning och konkursvalet. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { amortInfoOf, loanTerms } from "../engine/finance";
import { propMarketValue } from "../engine/property";
import {
  BRIDGE_RATE_SPREAD,
  RECEIVER_AUTO_FACTOR,
  RECEIVER_CHOICE_FACTOR,
  RESTRUCTURING_EXTRA_AMORT,
  RESTRUCTURING_MONTHS,
  bridgeLoanQuote,
  distressQuote,
  isInsolvent,
  maxRaisable,
  receiverAutoLiquidate,
  underRestructuringTerms,
} from "../engine/receivership";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
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

describe("BRIDGE_LOAN (dyr nödfinansiering)", () => {
  it("lånar underskott + buffert till straffränta som en obligation", () => {
    const s = crisisState(); // hus värt ~38 MSEK → eget kapital täcker gott
    const quote = bridgeLoanQuote(s);
    expect(quote.amount).toBeGreaterThanOrEqual(-s.cash); // täcker underskottet
    expect(quote.rate).toBe(s.interestRate + BRIDGE_RATE_SPREAD);
    const next = reducer(s, { type: "BRIDGE_LOAN" });
    expect(next.cash).toBe(s.cash + quote.amount);
    expect(next.cash).toBeGreaterThan(0); // ur krisen utan att sälja
    expect(next.bonds?.length).toBe(1);
    expect(next.bonds![0].rate).toBe(quote.rate);
    expect(next.receivership?.bridgeUsed).toBe(true);
    expect(next.portfolio.length).toBe(1); // husen kvar
  });

  it("bara ETT brygglån per rekonstruktion", () => {
    const s = crisisState();
    const once = reducer(s, { type: "BRIDGE_LOAN" });
    // Simulera att kassan dyker igen med lånet redan draget.
    const again = reducer({ ...once, cash: -500_000 }, { type: "BRIDGE_LOAN" });
    expect(again.bonds?.length).toBe(1); // ingen andra obligation
  });

  it("nekas när eget kapital inte täcker lånet (1,5×)", () => {
    // Litet hus + stor skuld → tunt eget kapital.
    const tiny = makeProperty({ id: 1, tenants: [], area: 120, baseRent: 10_000, askPrice: 200_000 });
    const s = makeState({
      portfolio: [tiny], cash: -5_000_000, debt: 30_000_000,
      receivership: { shortfall: 5_000_000, enteredAbs: 13 },
    });
    const next = reducer(s, { type: "BRIDGE_LOAN" });
    expect(next.bonds ?? []).toHaveLength(0);
    expect(next.receivership?.bridgeUsed).toBeFalsy();
  });

  it("no-op utan aktiv rekonstruktion", () => {
    const s = makeState({ cash: -200_000 });
    expect(reducer(s, { type: "BRIDGE_LOAN" })).toBe(s);
  });
});

describe("rekonstruktionsvillkor (bankens efterkrav)", () => {
  it("RESOLVE_RECEIVERSHIP inför villkor i RESTRUCTURING_MONTHS månader", () => {
    const s = { ...crisisState(), cash: 50_000 };
    const done = reducer(s, { type: "RESOLVE_RECEIVERSHIP" });
    expect(done.restructuringTerms).toBeDefined();
    expect(done.restructuringTerms!.untilAbs).toBe(s.year * 12 + s.month + RESTRUCTURING_MONTHS);
    expect(underRestructuringTerms(done)).toBe(true);
  });

  it("RECEIVER_AUTO (överlevnad) inför också villkoren", () => {
    const next = reducer(crisisState(), { type: "RECEIVER_AUTO" });
    expect(next.gameOver).toBe(false);
    expect(underRestructuringTerms(next)).toBe(true);
  });

  it("villkoren kräver tvångsamortering även under 50 % LTV", () => {
    const p = makeProperty({ id: 1, tenants: [] }); // värde ~38 MSEK → LTV låg
    const base = makeState({ portfolio: [p], debt: 3_000_000, cash: 1_000_000, month: 2 });
    expect(amortInfoOf(base).yearlyPct).toBe(0); // under 50 % LTV: amorteringsfritt normalt
    const covenant = { ...base, restructuringTerms: { untilAbs: base.year * 12 + base.month + 12 } };
    expect(amortInfoOf(covenant).yearlyPct).toBe(RESTRUCTURING_EXTRA_AMORT);
    expect(amortInfoOf(covenant).monthly).toBeGreaterThan(0);
  });

  it("villkoren stryper nyutlåningen (lägre maxLtv)", () => {
    const base = makeState({ reputation: 60 });
    const covenant = { ...base, restructuringTerms: { untilAbs: base.year * 12 + base.month + 12 } };
    expect(loanTerms(covenant).maxLtv).toBeLessThan(loanTerms(base).maxLtv);
  });

  it("villkoren löper ut och banken återgår till normala villkor", () => {
    const p = makeProperty({ id: 1, tenants: [] });
    const s = makeState({
      portfolio: [p], cash: 5_000_000, debt: 0,
      restructuringTerms: { untilAbs: 1 * 12 + 1 }, // redan passerad
    });
    const next = advanceMonth(s);
    expect(next.restructuringTerms).toBeUndefined();
    expect(next.log.some((l) => l.t.includes("covenants have expired"))).toBe(true);
  });
});

describe("gameOverReason (slutskärmens förklaring)", () => {
  it("ACCEPT_BANKRUPTCY sätter orsak med kassa och skuld", () => {
    const next = reducer(crisisState({ debt: 7_000_000 }), { type: "ACCEPT_BANKRUPTCY" });
    expect(next.gameOverReason).toBeDefined();
    expect(next.gameOverReason!.title).toContain("by choice");
    expect(next.gameOverReason!.text).toContain("7.0 MSEK");
  });

  it("RECEIVER_AUTO som inte når golvet sätter konkursorsak", () => {
    // Litet hus, jättekassa-hål: förvaltarens likvidering räcker inte.
    const tiny = makeProperty({ id: 1, tenants: [], area: 120, baseRent: 10_000, askPrice: 200_000 });
    const s = makeState({
      portfolio: [tiny], cash: -8_000_000, debt: 0,
      receivership: { shortfall: 8_000_000, enteredAbs: 13 },
    });
    const next = reducer(s, { type: "RECEIVER_AUTO" });
    expect(next.gameOver).toBe(true);
    expect(next.gameOverReason?.title).toBe("Bankruptcy");
  });
});
