import { describe, expect, it } from "vitest";
import { equityOf, industryPortfolioValue } from "../engine/finance";
import { clearRng, seedRng } from "../engine/random";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import {
  SPINOFF_DIVIDEND_PAYOUT,
  spinoffSharePrice,
  spinoffValuation,
} from "../engine/spinoffs";
import type { GameState } from "../engine/types";
import { makeIndustryAsset, makeState } from "./factories";

/* Avknoppningar (Capitalism Lab-luckan 1): en hel industrisektor kan
   noteras som eget bolag. Tillgångarna står kvar på kartan men
   driftnettot går till avknoppningen, som kvartalsutdelar pro rata. */

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

function hotelState(over: Partial<GameState> = {}): GameState {
  return makeState({
    cash: 50_000_000,
    companyLevel: 4,
    industryPortfolio: [
      makeIndustryAsset({ id: 300 }),
      makeIndustryAsset({ id: 301, name: "Test Hotel II", district: "kulle", districtName: "Kullen" }),
    ],
    ...over,
  });
}

describe("AVKNOPPNINGAR: sektor-IPO:er med eget kassaflöde", () => {
  it("SPIN_OFF kräver bolagsnivå 4 och minst två färdiga tillgångar", () => {
    const small = reducer(hotelState({ companyLevel: 3 }), { type: "SPIN_OFF", sector: "hotell", floatPct: 0.4 });
    expect(small.spinOffs ?? []).toHaveLength(0);
    const few = reducer(
      hotelState({ industryPortfolio: [makeIndustryAsset({ id: 300 })] }),
      { type: "SPIN_OFF", sector: "hotell", floatPct: 0.4 },
    );
    expect(few.spinOffs ?? []).toHaveLength(0);
  });

  it("noteringen taggar tillgångarna, skapar aktien och betalar ut floaten", () => {
    seedRng(3);
    try {
      const s0 = hotelState();
      const valuation = spinoffValuation(s0, "hotell");
      const s = reducer(s0, { type: "SPIN_OFF", sector: "hotell", floatPct: 0.4 });
      expect(s.spinOffs).toHaveLength(1);
      const spin = s.spinOffs![0];
      const st = s.stocks.find((x) => x.id === spin.stockId)!;
      // 60 % kvar hos spelaren, 40 % till marknaden.
      expect(st.owned / st.sharesOutstanding).toBeCloseTo(0.6, 2);
      expect(st.spinOffId).toBe(spin.id);
      // Likviden: 40 % av värdet minus arvodet.
      expect(s.cash).toBeGreaterThan(s0.cash);
      expect(s.cash - s0.cash).toBeLessThanOrEqual(Math.round(valuation * 0.4));
      // Tillgångarna är taggade men står kvar i portföljen (kartan).
      expect((s.industryPortfolio ?? []).every((a) => a.spinOffId === spin.id)).toBe(true);
      expect(s.industryPortfolio ?? []).toHaveLength(2);
      // ...och räknas inte längre som spelarens industrivärde.
      expect(industryPortfolioValue(s)).toBe(0);
      // Eget kapital tappar inte tillgångarna: aktieposten bär värdet.
      expect(equityOf(s)).toBeGreaterThan(equityOf(s0) * 0.9);
    } finally {
      clearRng();
    }
  });

  it("driftnettot går till avknoppningens kassa – inte till spelaren", () => {
    seedRng(5);
    try {
      let s = reducer(hotelState(), { type: "SPIN_OFF", sector: "hotell", floatPct: 0.4 });
      const cashBefore = s.spinOffs![0].cash;
      s = tick(s);
      const spin = s.spinOffs![0];
      // Månadens netto bokförs i avknoppningen (hotell i drift ⇒ ±netto ≠ 0).
      expect(spin.lastMonthNet).not.toBe(0);
      expect(spin.cash).toBe(cashBefore + spin.lastMonthNet);
    } finally {
      clearRng();
    }
  });

  it("kvartalsutdelning: 60 % av kassan, pro rata till spelaren", () => {
    seedRng(7);
    try {
      let s = reducer(hotelState({ month: 3 }), { type: "SPIN_OFF", sector: "hotell", floatPct: 0.4 });
      s = { ...s, spinOffs: [{ ...s.spinOffs![0], cash: 10_000_000 }] };
      const st0 = s.stocks.find((x) => x.id === s.spinOffs![0].stockId)!;
      const ownPct = st0.owned / st0.sharesOutstanding;
      const cashBefore = s.cash;
      s = tick(s); // månad 3 = kvartalsslut under ticket
      const spin = s.spinOffs![0];
      // ~60 % av kassan (plus månadens netto) delades ut.
      expect(spin.dividendsPaidToPlayer).toBeGreaterThan(
        10_000_000 * SPINOFF_DIVIDEND_PAYOUT * ownPct * 0.8,
      );
      // Spelarens kassa fick sin andel (övriga flöden är små i testläget).
      expect(s.cash).toBeGreaterThan(cashBefore);
    } finally {
      clearRng();
    }
  });

  it("aktien prissätts fundamentalt: substans per aktie, ingen slumpvandring", () => {
    seedRng(9);
    try {
      let s = reducer(hotelState(), { type: "SPIN_OFF", sector: "hotell", floatPct: 0.25 });
      s = tick(s);
      const spin = s.spinOffs![0];
      const st = s.stocks.find((x) => x.id === spin.stockId)!;
      // Kursen sattes vid månadens avräkning; marknadsläget kan ha driftat
      // marginellt senare i samma tick – tillåt ±2 %.
      const fundamental = spinoffSharePrice(s, spin, st);
      expect(Math.abs(st.price - fundamental) / fundamental).toBeLessThan(0.02);
      expect(st.targetPrice).toBe(st.price);
    } finally {
      clearRng();
    }
  });

  it("avknoppade tillgångar kan inte säljas styckvis", () => {
    seedRng(11);
    try {
      const s = reducer(hotelState(), { type: "SPIN_OFF", sector: "hotell", floatPct: 0.4 });
      const cash = s.cash;
      const after = reducer(s, { type: "SELL_INDUSTRY", id: 300 });
      expect(after.cash).toBe(cash);
      expect(after.industryPortfolio ?? []).toHaveLength(2);
      expect(after.log[0].t).toContain("listed company");
    } finally {
      clearRng();
    }
  });
});
