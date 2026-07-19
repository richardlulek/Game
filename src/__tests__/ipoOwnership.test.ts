import { describe, expect, it } from "vitest";
import { equityOf } from "../engine/finance";
import { reducer } from "../engine/reducer";
import type { GameState } from "../engine/types";
import { makeProperty, makeState } from "./factories";

/* IPO 2.0-vakt: floaten är ett VAL vid noteringen, och efter den kan
   bolaget göra nyemissioner (utspädning mot kapital) och återköp
   (kontroll mot kassa). Tidigare: fast 30 % float, inga verktyg, och
   uppköpshotet kröp upp på en villkorslös timer. */

function listedState(float = 0.49): GameState {
  const s0 = makeState({ cash: 10_000_000, portfolio: [makeProperty({ id: 1 })] });
  return reducer(s0, { type: "DO_IPO", float });
}

describe("IPO 2.0: float, nyemission och återköp", () => {
  it("floaten väljs vid noteringen och styr likvid + kvarvarande ägande", () => {
    const s0 = makeState({ cash: 10_000_000, portfolio: [makeProperty({ id: 1 })] });
    const eq = equityOf(s0);
    const small = reducer(s0, { type: "DO_IPO", float: 0.2 });
    const big = reducer(s0, { type: "DO_IPO", float: 0.65 });
    expect(small.ipoShares).toEqual({ total: 10_000_000, public: 2_000_000 });
    expect(big.ipoShares).toEqual({ total: 10_000_000, public: 6_500_000 });
    // Likviden skalar med floaten (kurs × sålda aktier × 0,96).
    expect(small.cash - s0.cash).toBe(Math.round((eq / 10_000_000) * 2_000_000 * 0.96));
    expect(big.cash - s0.cash).toBeGreaterThan(small.cash - s0.cash);
  });

  it("nyemission: kassa in, ägarandel utspädd, aktivistens ANDEL faller", () => {
    const s1 = { ...listedState(0.3), takeoverPressure: 20 };
    const s2 = reducer(s1, { type: "SHARE_ISSUE", pct: 0.1 });
    expect(s2.ipoShares).toEqual({ total: 11_000_000, public: 4_000_000 });
    expect(s2.cash).toBeGreaterThan(s1.cash);
    // Spelaren: 70 % → 7M/11M ≈ 63,6 %. Aktivisten: 20 % → 20×10/11 ≈ 18,2 %.
    expect(s2.takeoverPressure).toBeCloseTo(18.18, 1);
    expect(s2.stocks.find((st) => st.id === "FBAB")!.sharesOutstanding).toBe(11_000_000);
  });

  it("återköp: kassa ut, aktier makuleras, aktivisten pressas ut proportionellt", () => {
    const s1 = { ...listedState(0.49), takeoverPressure: 20, cash: 50_000_000 };
    const s2 = reducer(s1, { type: "SHARE_BUYBACK", amount: 20_000_000 });
    expect(s2.ipoShares!.total).toBeLessThan(10_000_000);
    expect(s2.ipoShares!.public).toBeLessThan(4_900_000);
    expect(s2.cash).toBeLessThan(s1.cash);
    // Aktivistens andel av totalen ska inte STIGA av ett proportionellt återköp.
    expect(s2.takeoverPressure!).toBeLessThanOrEqual(20.01);
    // Spelarens andel stärks.
    const ownedPct = ((s2.ipoShares!.total - s2.ipoShares!.public) / s2.ipoShares!.total) * 100;
    expect(ownedPct).toBeGreaterThan(51);
  });

  it("börsens spridningskrav: återköp stoppas under 10 % float", () => {
    const s1 = { ...listedState(0.2), cash: 500_000_000 };
    const s2 = reducer(s1, { type: "SHARE_BUYBACK", amount: 400_000_000 });
    // Maximalt återköp lämnar exakt ≥10 % float kvar.
    const floatPct = s2.ipoShares!.public / s2.ipoShares!.total;
    expect(floatPct).toBeGreaterThanOrEqual(0.0999);
    // Och ett till försök ger avslag utan att ändra strukturen.
    const s3 = reducer(s2, { type: "SHARE_BUYBACK", amount: 100_000_000 });
    expect(s3.ipoShares).toEqual(s2.ipoShares);
    expect(s3.log[0].t).toContain("at least 10% free float");
  });

  it("nyemission/återköp kräver notering", () => {
    const s0 = makeState({ cash: 10_000_000 });
    expect(reducer(s0, { type: "SHARE_ISSUE", pct: 0.1 }).ipoShares).toBeUndefined();
    expect(reducer(s0, { type: "SHARE_BUYBACK", amount: 1_000_000 }).ipoShares).toBeUndefined();
  });

  it("utdelning betalas PER AKTIE efter noteringen – ägaren får sin röstandel", () => {
    const s1 = { ...listedState(0.49), cash: 10_000_000 };
    const s2 = reducer(s1, { type: "PAY_DIVIDEND", amount: 1_000_000 });
    expect(s2.cash).toBe(s1.cash - 1_000_000);
    expect(s2.dividendsPaid).toBe(1_000_000);
    expect(s2.ownerWealth).toBe(510_000); // 51 % av aktierna
    // Onoterat: hela beloppet (befintligt beteende).
    const p1 = makeState({ cash: 10_000_000 });
    expect(reducer(p1, { type: "PAY_DIVIDEND", amount: 1_000_000 }).ownerWealth).toBe(1_000_000);
  });

  it("privata aktieköp: ägarplånboken köper ur fria floaten och stärker rösterna", () => {
    const s1 = { ...listedState(0.49), takeoverPressure: 10, ownerWealth: 5_000_000 };
    const price = s1.stocks.find((st) => st.id === "FBAB")!.price;
    const s2 = reducer(s1, { type: "BUY_OWN_SHARES", amount: 5_000_000 });
    expect(s2.ownerShares ?? 0).toBeGreaterThan(0);
    expect(s2.ownerWealth!).toBeLessThan(5_000_000);
    expect(s2.ipoShares!.public).toBe(4_900_000 - (s2.ownerShares ?? 0));
    expect(s2.ipoShares!.total).toBe(10_000_000); // aktierna byter bara händer
    // Bolagets kassa orörd – köpet är PRIVAT.
    expect(s2.cash).toBe(s1.cash);
    // Kursen inkluderar courtage.
    expect(s2.ownerWealth).toBe(5_000_000 - Math.round((s2.ownerShares ?? 0) * price * 1.003));
    // Aktivistens andel i % är oförändrad (samma aktier, samma total).
    expect(s2.takeoverPressure).toBe(10);
  });

  it("sälj privata aktier: plånboken fylls, floaten växer tillbaka", () => {
    const s1 = { ...listedState(0.49), ownerWealth: 5_000_000 };
    const s2 = reducer(s1, { type: "BUY_OWN_SHARES", amount: 5_000_000 });
    const bought = s2.ownerShares ?? 0;
    const s3 = reducer(s2, { type: "SELL_OWN_SHARES", amount: 1_000_000_000 });
    expect(s3.ownerShares).toBe(0);
    expect(s3.ipoShares!.public).toBe(4_900_000); // floaten helt återställd
    // Rundresan kostar bara spreaden (0,3 % + 0,3 %).
    const price = s1.stocks.find((st) => st.id === "FBAB")!.price;
    const spreadCost = Math.round(bought * price * 1.003) - Math.round(bought * price * 0.997);
    expect(5_000_000 - s3.ownerWealth!).toBeLessThanOrEqual(spreadCost + 2);
    // Utan innehav: avslag.
    expect(reducer(s3, { type: "SELL_OWN_SHARES", amount: 1_000 }).ownerShares).toBe(0);
  });

  it("ägartillskott noterat: riktad emission till ägaren – röster upp, aktivist utspädd", () => {
    const s1 = { ...listedState(0.49), ownerWealth: 3_000_000, takeoverPressure: 20 };
    const s2 = reducer(s1, { type: "OWNER_INJECTION", amount: 3_000_000 });
    expect(s2.cash).toBe(s1.cash + 3_000_000);
    expect(s2.ownerWealth).toBe(0);
    expect(s2.ipoShares!.total).toBeGreaterThan(10_000_000);
    expect(s2.ipoShares!.public).toBe(4_900_000); // floaten orörd
    expect(s2.takeoverPressure!).toBeLessThan(20); // aktivisten utspädd
    const ownedPct = (s2.ipoShares!.total - s2.ipoShares!.public) / s2.ipoShares!.total;
    expect(ownedPct).toBeGreaterThan(0.51);
    expect(s2.stocks.find((st) => st.id === "FBAB")!.sharesOutstanding).toBe(s2.ipoShares!.total);
  });

  it("ägartillskott onoterat: rent kassatillskott", () => {
    const s1 = makeState({ cash: 1_000_000, ownerWealth: 2_000_000 });
    const s2 = reducer(s1, { type: "OWNER_INJECTION", amount: 2_000_000 });
    expect(s2.cash).toBe(3_000_000);
    expect(s2.ownerWealth).toBe(0);
    expect(s2.ipoShares).toBeUndefined();
  });

  it("privatköpen respekterar spridningskravet och aktivistens innehav", () => {
    // Float 20 % där aktivisten äger 8 %: fria floaten är 12 %, men golvet
    // (≥10 % float) tillåter bara köp av 10 % av aktierna.
    const s1 = {
      ...listedState(0.2),
      takeoverPressure: 8,
      ownerWealth: 1_000_000_000,
    };
    const s2 = reducer(s1, { type: "BUY_OWN_SHARES", amount: 1_000_000_000 });
    expect(s2.ipoShares!.public / s2.ipoShares!.total).toBeGreaterThanOrEqual(0.0999);
    // Och utan notering: avslag.
    const p1 = makeState({ ownerWealth: 1_000_000 });
    expect(reducer(p1, { type: "BUY_OWN_SHARES", amount: 1_000_000 }).ownerShares).toBeUndefined();
  });
});
