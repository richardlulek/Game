import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { advanceMonth } from "../engine/simulation";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

// Math.random mockas till ett fast värde så månadssimuleringen blir deterministisk.
// 0.5 < 0.35 är falskt → inga makrohändelser/konkurrentköp triggas.
beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("advanceMonth – kassaflöde", () => {
  it("drar opex och ränta samt lägger till hyra på kassan", () => {
    const p = makeProperty({
      baseRent: 120_000, // opex = 120000 × 0.23 = 27600/år → 2300/mån
      tenants: [makeTenantFixture({ rent: 10_000, monthsLeft: 24 })],
    });
    const s = makeState({
      portfolio: [p],
      cash: 100_000,
      debt: 1_200_000,
      reputation: 50, // ränta = 4.0 + 1.65 = 5.65 %
      interestRate: 4.0,
      month: 6,
    });

    const next = advanceMonth(s);

    // monthlyNOI = 10000 − 2300 = 7700
    // ränta = 1 200 000 × 5.65% / 12 = 5650
    // avskrivning = 1000000 × 1,3% / 12 = 1083
    // skattebar inkomst = max(0, 2050 − 1083) = 967
    // skatt = round(967 × 22%) = 213
    // kassa = 100000 + 7700 − 5650 − 213 = 101837
    expect(next.cash).toBeCloseTo(101_837, 2);
    expect(next.month).toBe(7);
    expect(next.gameOver).toBe(false);
  });

  it("räknar ner kontraktstiden och sliter på skicket", () => {
    const p = makeProperty({
      condition: 100,
      tenants: [makeTenantFixture({ monthsLeft: 24 })],
    });
    const next = advanceMonth(makeState({ portfolio: [p] }));
    expect(next.portfolio[0].tenants[0]?.monthsLeft).toBe(23);
    // slitage = rnd(0.2, 0.7) med random 0.5 → 0.45
    expect(next.portfolio[0].condition).toBeCloseTo(99.55, 6);
  });
});

describe("advanceMonth – bygge", () => {
  it("färdigställer nyproduktion när buildLeft når 0", () => {
    const p = makeProperty({ status: "bygger", buildLeft: 1 });
    const next = advanceMonth(makeState({ portfolio: [p], debt: 0 }));
    expect(next.portfolio[0].status).toBe("klar");
    expect(next.portfolio[0].buildLeft).toBe(0);
    expect(next.log.some((l) => l.t.includes("Nyproduktion klar"))).toBe(true);
  });
});

describe("advanceMonth – tid", () => {
  it("rullar över till nytt år efter månad 12", () => {
    const next = advanceMonth(makeState({ month: 12, year: 1, debt: 0 }));
    expect(next.month).toBe(1);
    expect(next.year).toBe(2);
    // marketMod × rnd(1.0, 1.045) med random 0.5 → × 1.0225 (sekulär trend
    // +2 %/år i väntevärde – se industryEconomy.test.ts för helheten)
    expect(next.marketMod).toBe(1.022);
  });
});

describe("advanceMonth – konkurs", () => {
  it("sätter gameOver när kassan går under −2 MSEK", () => {
    const next = advanceMonth(makeState({ cash: -3_000_000, debt: 0 }));
    expect(next.gameOver).toBe(true);
    expect(next.log[0].t).toContain("BANKRUPTCY");
  });
});

describe("insolvens vs. illikviditet (rekonstruktion före konkurs)", () => {
  it("djupt negativ kassa MEN tillgångar → rekonstruktion öppnas, INGET säljs automatiskt", () => {
    const p = makeProperty({ id: 1, tenants: [] });
    const s = makeState({ portfolio: [p], cash: -3_000_000, debt: 0 });
    const next = advanceMonth(s);
    expect(next.gameOver).toBe(false);
    expect(next.receivership).toBeDefined(); // menyn öppnas, spelet pausar
    expect(next.portfolio.length).toBe(1); // inget tvångssålt än – spelaren väljer
    expect(next.standing?.bank ?? 0).toBeLessThan(0); // engångssmällen tas vid inträdet
    expect((next.pressHeat ?? 0)).toBeGreaterThan(0);
  });

  it("ignorerad rekonstruktion → förvaltaren agerar vid nästa månadsskifte", () => {
    const p = makeProperty({ id: 1, tenants: [] });
    const s = makeState({ portfolio: [p], cash: -3_000_000, debt: 0 });
    const first = advanceMonth(s);
    expect(first.receivership).toBeDefined();
    const second = advanceMonth(first);
    expect(second.receivership).toBeUndefined();
    expect(second.gameOver).toBe(false);
    expect(second.cash).toBeGreaterThan(0); // förvaltaren sålde och löste krisen
    expect(second.listings.some((l) => (l.txHistory ?? []).some((tx) => tx.party.includes("Receiver")))).toBe(true);
    expect(second.restructuringTerms).toBeDefined(); // bankens efterkrav gäller
  });

  it("djupt negativ kassa OCH inga tillgångar → konkurs (game over) direkt", () => {
    const s = makeState({ portfolio: [], cash: -2_000_000, debt: 0 });
    const next = advanceMonth(s);
    expect(next.gameOver).toBe(true);
    expect(next.receivership).toBeUndefined(); // ingen meny som inte kan hjälpa
  });

  it("noBankruptcy: kassan kan gå djupt negativt utan rekonstruktion eller konkurs", () => {
    const p = makeProperty({ id: 1, tenants: [] });
    const s = makeState({
      portfolio: [p], cash: -3_000_000, debt: 0,
      settings: { difficulty: "custom", noBankruptcy: true },
    });
    const next = advanceMonth(s);
    expect(next.gameOver).toBe(false);
    expect(next.receivership).toBeUndefined();
    expect(next.portfolio.length).toBe(1);
  });

  it("kassa mellan varning och golv → ingen rekonstruktion, inget game over", () => {
    const p = makeProperty({ id: 1, tenants: [] });
    const s = makeState({ portfolio: [p], cash: -500_000, debt: 0 });
    const next = advanceMonth(s);
    expect(next.gameOver).toBe(false);
    expect(next.receivership).toBeUndefined();
    expect(next.portfolio.length).toBe(1);
  });
});

describe("gameOverReason vid insolvens", () => {
  it("insolvens sätter en pedagogisk orsak med siffror", () => {
    const s = makeState({ portfolio: [], cash: -2_000_000, debt: 15_000_000 });
    const next = advanceMonth(s);
    expect(next.gameOver).toBe(true);
    expect(next.gameOverReason).toBeDefined();
    expect(next.gameOverReason!.title).toContain("insolvent");
    expect(next.gameOverReason!.text).toContain("$15.0M"); // skulden
    expect(next.gameOverReason!.text).toContain("over-leveraged");
  });
});
