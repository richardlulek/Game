import { describe, expect, it } from "vitest";
import { equityOf, loanTerms, ltvOf, portfolioValue } from "../engine/finance";
import { makeProperty, makeState } from "./factories";

describe("loanTerms (reputationsbaserade lånevillkor)", () => {
  it("ger sämsta villkor vid reputation 0", () => {
    const t = loanTerms(makeState({ reputation: 0, interestRate: 4.0 }));
    expect(t.spread).toBe(2.5);
    expect(t.maxLtv).toBeCloseTo(0.55, 6);
    expect(t.rate).toBe(6.5); // 4.0 + 2.5
  });

  it("ger mellanvillkor vid reputation 50", () => {
    const t = loanTerms(makeState({ reputation: 50, interestRate: 4.0 }));
    expect(t.spread).toBe(1.65); // 2.5 − 0.85
    expect(t.maxLtv).toBeCloseTo(0.645, 6);
    expect(t.rate).toBe(5.65);
  });

  it("ger bästa villkor vid reputation 100", () => {
    const t = loanTerms(makeState({ reputation: 100, interestRate: 4.0 }));
    expect(t.spread).toBe(0.8); // 2.5 − 1.7
    expect(t.maxLtv).toBeCloseTo(0.74, 6);
    expect(t.rate).toBe(4.8);
  });

  it("räntan följer styrräntan", () => {
    const a = loanTerms(makeState({ reputation: 50, interestRate: 4.0 }));
    const b = loanTerms(makeState({ reputation: 50, interestRate: 5.0 }));
    expect(b.rate - a.rate).toBeCloseTo(1.0, 6);
  });
});

describe("LTV och eget kapital", () => {
  it("LTV är 0 för tom portfölj", () => {
    expect(ltvOf(makeState({ debt: 1_000_000 }))).toBe(0);
  });

  it("LTV = skuld / portföljvärde", () => {
    // Ett objekt värt 38 400 000, skuld 19 200 000 → LTV 0.5
    const p = makeProperty({ area: 1000, condition: 100 });
    const s = makeState({ portfolio: [p], debt: 19_200_000 });
    expect(portfolioValue(s)).toBe(38_400_000);
    expect(ltvOf(s)).toBeCloseTo(0.5, 6);
  });

  it("eget kapital = kassa + fastighetsvärde − skuld", () => {
    const p = makeProperty({ area: 1000, condition: 100 });
    const s = makeState({ portfolio: [p], cash: 1_000_000, debt: 19_200_000 });
    // 1 000 000 + 38 400 000 − 19 200 000 = 20 200 000
    expect(equityOf(s)).toBe(20_200_000);
  });
});

/* ── Kreditbetyg & obligationsprogram ──────────────────────────────── */

describe("kreditbetyget", () => {
  it("låg skuld och stark räntetäckning ger bättre betyg än hög skuld", async () => {
    const { creditRatingOf } = await import("../engine/rating");
    const { makeProperty, makeState } = await import("./factories");
    const t = { id: 1, profile: "privat", name: "T", quality: 1, defaultRisk: 0, monthsLeft: 24, termTotal: 24, rent: 400_000 };
    const props = Array.from({ length: 5 }, (_, i) => makeProperty({ id: 10 + i, askPrice: 50e6, baseRent: 4e6, tenants: [t] }));
    const stark = creditRatingOf(makeState({ cash: 100e6, debt: 20e6, portfolio: props }));
    const svag = creditRatingOf(makeState({ cash: 1e6, debt: 260e6, portfolio: props }));
    expect(stark.score).toBeGreaterThan(svag.score);
    expect(["AAA", "AA", "A", "BBB"]).toContain(stark.rating);
    expect(["BB", "B", "CCC"]).toContain(svag.rating);
    // Betyget slår igenom i lånespreadar: svag balansräkning lånar dyrare.
    const { loanTerms } = await import("../engine/finance");
    expect(loanTerms(makeState({ cash: 1e6, debt: 260e6, portfolio: props })).rate)
      .toBeGreaterThan(loanTerms(makeState({ cash: 100e6, debt: 20e6, portfolio: props })).rate);
  });

  it("obligationsprogrammet begränsas av betyget", async () => {
    const { reducer } = await import("../engine/reducer");
    const { creditRatingOf } = await import("../engine/rating");
    const { makeProperty, makeState } = await import("./factories");
    const t = { id: 1, profile: "privat", name: "T", quality: 1, defaultRisk: 0, monthsLeft: 24, termTotal: 24, rent: 400_000 };
    const props = Array.from({ length: 5 }, (_, i) => makeProperty({ id: 10 + i, askPrice: 50e6, baseRent: 4e6, tenants: [t] }));
    const s0 = makeState({ cash: 100e6, debt: 20e6, portfolio: props, reputation: 50 });
    const cap = creditRatingOf(s0).bondCap;
    expect(cap).toBeGreaterThan(0);
    // Emission över taket klipps till taket.
    const s1 = reducer(s0, { type: "ISSUE_BOND", amount: cap + 500e6, years: 5 });
    const outstanding = (s1.bonds ?? []).reduce((a, b) => a + b.amount, 0);
    expect(outstanding).toBeLessThanOrEqual(cap);
    expect(outstanding).toBeGreaterThan(0);
    // Ett andra försök när programmet är fullt avvisas.
    const s2 = reducer(s1, { type: "ISSUE_BOND", amount: 50e6, years: 5 });
    expect((s2.bonds ?? []).length).toBe((s1.bonds ?? []).length);
  });

  it("covenantbrott varnar", async () => {
    const { covenantBreach, creditRatingOf } = await import("../engine/rating");
    const { makeProperty, makeState } = await import("./factories");
    const props = [makeProperty({ id: 1, askPrice: 50e6, baseRent: 1e6, tenants: [] })];
    const breach = covenantBreach(creditRatingOf(makeState({ cash: 0, debt: 60e6, portfolio: props })));
    expect(breach).not.toBeNull();
    const t = { id: 1, profile: "privat", name: "T", quality: 1, defaultRisk: 0, monthsLeft: 24, termTotal: 24, rent: 300_000 };
    const uthyrd = [makeProperty({ id: 1, askPrice: 50e6, baseRent: 1e6, tenants: [t] })];
    const fine = covenantBreach(creditRatingOf(makeState({ cash: 50e6, debt: 5e6, portfolio: uthyrd })));
    expect(fine).toBeNull();
  });
});
