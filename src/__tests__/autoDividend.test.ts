import { describe, expect, it } from "vitest";
import { advanceMonth } from "../engine/simulation";
import { makeState } from "./factories";

/* CFO:ns utdelningspolicy: kvartalsvis utdelning av en andel av kassan
   över buffertgolvet – pro rata till aktieägarna efter noteringen. */

describe("UTDELNINGSPOLICY: CFO delar ut kvartalsvis ur överskottskassan", () => {
  const base = {
    cash: 25_000_000,
    staff: { cfo: 1 },
    policy: { autoDividend: { enabled: true, pct: 0.25, cashFloor: 5_000_000 } },
    month: 3, // kvartalsmånad
  };

  it("delar ut 25 % av överskottet i kvartalsmånader", () => {
    const s1 = advanceMonth(makeState(base));
    // Överskott 20 Msek → 5 Msek utdelas (avrundat till 100k).
    expect(s1.dividendsPaid ?? 0).toBeGreaterThanOrEqual(4_000_000);
    expect(s1.ownerWealth ?? 0).toBe(s1.dividendsPaid); // onoterat: allt till ägaren
    expect(s1.log.some((l) => l.t.includes("CFO policy paid a quarterly dividend"))).toBe(true);
  });

  it("kräver CFO och rätt månad", () => {
    const utanCfo = advanceMonth(makeState({ ...base, staff: {} }));
    expect(utanCfo.dividendsPaid ?? 0).toBe(0);
    const felMonad = advanceMonth(makeState({ ...base, month: 4 }));
    expect(felMonad.dividendsPaid ?? 0).toBe(0);
  });

  it("noterat bolag: ägaren får sin röstandel av policyutdelningen", () => {
    const s0 = makeState({
      ...base,
      ipoActive: true,
      ipoShares: { total: 10_000_000, public: 4_900_000 },
    });
    const s1 = advanceMonth(s0);
    const paid = s1.dividendsPaid ?? 0;
    expect(paid).toBeGreaterThan(0);
    // 51 % till ägaren (±avrundning).
    expect(Math.abs((s1.ownerWealth ?? 0) - Math.round(paid * 0.51))).toBeLessThanOrEqual(1);
  });
});
