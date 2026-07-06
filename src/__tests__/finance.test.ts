import { describe, expect, it } from "vitest";
import { equityOf, loanTerms, ltvOf, portfolioValue } from "../engine/finance";
import { makeProperty, makeState } from "./factories";

describe("loanTerms (reputationsbaserade lånevillkor)", () => {
  it("ger sämsta villkor vid reputation 0", () => {
    const t = loanTerms(makeState({ reputation: 0, interestRate: 4.0 }));
    expect(t.spread).toBe(2.5);
    expect(t.maxLtv).toBeCloseTo(0.6, 6);
    expect(t.rate).toBe(6.5); // 4.0 + 2.5
  });

  it("ger mellanvillkor vid reputation 50", () => {
    const t = loanTerms(makeState({ reputation: 50, interestRate: 4.0 }));
    expect(t.spread).toBe(1.65); // 2.5 − 0.85
    expect(t.maxLtv).toBeCloseTo(0.7, 6);
    expect(t.rate).toBe(5.65);
  });

  it("ger bästa villkor vid reputation 100", () => {
    const t = loanTerms(makeState({ reputation: 100, interestRate: 4.0 }));
    expect(t.spread).toBe(0.8); // 2.5 − 1.7
    expect(t.maxLtv).toBeCloseTo(0.8, 6);
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
