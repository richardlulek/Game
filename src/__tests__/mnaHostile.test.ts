/* M&A 2.0 batch 3: fientliga uppköp via börsen. Budplikt vid 30 %,
   styrelsens försvarskaskad (vit riddare → återköp → kapitulation),
   rivalernas motbud på dina mål – och raider mot DITT bolag. */

import { describe, expect, it } from "vitest";
import { HOSTILE_PREMIUM, MANDATORY_BID_THRESHOLD, hostileDefense, marketCapOf } from "../engine/mna";
import { clearRng, seedRng } from "../engine/random";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { Competitor, GameState, Stock } from "../engine/types";
import { makeProperty, makeState } from "./factories";

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

function rival(name: string, over: Partial<Competitor> = {}): Competitor {
  return {
    name,
    cash: 20_000_000,
    units: 0,
    equity: 100_000_000,
    portfolio: [makeProperty({ id: 7900, owned: false, askPrice: 60_000_000 })],
    strategy: "värde",
    ...over,
  };
}

function listedStock(name: string, over: Partial<Stock> = {}): Stock {
  return {
    id: `comp-${name}`,
    name,
    sector: "fastighet",
    price: 500,
    prevPrice: 500,
    sharesOutstanding: 200_000,
    owned: 0,
    avgCost: 0,
    dividendYield: 0.03,
    beta: 1,
    drift: 0,
    volatility: 0.04,
    history: [500],
    competitorName: name,
    ...over,
  } as Stock;
}

describe("BUDPLIKT: 30 % tvingar fram ett val", () => {
  it("köp över tröskeln utlöser beslutet, en gång", () => {
    const name = "Wellspring Invest";
    const st = listedStock(name, { owned: 55_000 }); // 27.5 %
    let s = makeState({ cash: 50_000_000, competitors: [rival(name)], stocks: [st] });
    s = reducer(s, { type: "BUY_SHARES", stockId: st.id, qty: 10_000 }); // → 32.5 %
    expect(s.pendingDecision?.id).toBe(`budplikt-${st.id}`);
    expect(s.budpliktDone).toContain(name);
    // Nedförsäljning: under tröskeln med 5 % rabatt.
    const sold = reducer(s, { type: "RESOLVE_DECISION", optionIndex: 1 });
    const after = sold.stocks.find((x) => x.id === st.id)!;
    expect(after.owned / after.sharesOutstanding).toBeLessThan(MANDATORY_BID_THRESHOLD);
    // Ingen dubbeltrigger vid nästa köp under tröskeln.
    const again = reducer(sold, { type: "BUY_SHARES", stockId: st.id, qty: 1000 });
    expect(again.pendingDecision).toBeNull();
  });

  it("budpliktens budväg lägger en färdigaccepterad affär", () => {
    const name = "City Core Group";
    const st = listedStock(name, { owned: 70_000 });
    let s = makeState({ cash: 300_000_000, competitors: [rival(name)], stocks: [st] });
    s = reducer(s, { type: "BUY_SHARES", stockId: st.id, qty: 1_000 });
    expect(s.pendingDecision).not.toBeNull();
    s = reducer(s, { type: "RESOLVE_DECISION", optionIndex: 0 });
    expect(s.pendingDeal?.target).toBe(name);
    expect(s.pendingDeal?.status).toBe("accepted");
  });
});

describe("FÖRSVARSKASKADEN: vit riddare, återköp, kapitulation", () => {
  it("allierad rival med kassa kliver in som vit riddare", () => {
    const target = rival("Grovewood Properties");
    const ally = rival("Northgate Properties", { cash: 200_000_000 });
    const s = makeState({
      competitors: [target, ally],
      stocks: [listedStock(target.name)],
      rivalRelations: [{ a: target.name, b: ally.name, kind: "alliance", since: 0 }],
    });
    expect(hostileDefense(s, target, 150_000_000)).toMatchObject({ kind: "white_knight", ally: ally.name });
  });

  it("aggressiv ledning utan allierade kör återköp; mjuk ledning kapitulerar", () => {
    const shark = rival("Harborview Capital");
    const sShark = makeState({ competitors: [shark], stocks: [listedStock(shark.name)] });
    const cap = marketCapOf(sShark, shark.name);
    expect(hostileDefense(sShark, shark, Math.round(cap * HOSTILE_PREMIUM)).kind).toBe("buyback");
    // Även hajen viker sig för ett bud som röjer återköpsgolvet.
    expect(hostileDefense(sShark, shark, Math.round(cap * 2)).kind).toBe("capitulate");
    const soft = rival("Old Town Trust");
    const sSoft = makeState({ competitors: [soft], stocks: [listedStock(soft.name)] });
    expect(hostileDefense(sSoft, soft, Math.round(marketCapOf(sSoft, soft.name) * HOSTILE_PREMIUM)).kind).toBe("capitulate");
  });

  it("kapitulation genomför köpet i simuleringen – med raidens pris", () => {
    seedRng(131);
    try {
      const soft = rival("Old Town Trust", { debt: 10_000_000 });
      let s = makeState({
        cash: 200_000_000,
        reputation: 60,
        competitors: [soft],
        stocks: [listedStock(soft.name)],
      });
      const cap = marketCapOf(s, soft.name);
      s = reducer(s, { type: "HOSTILE_BID", competitorName: soft.name, amount: Math.round(cap * HOSTILE_PREMIUM) });
      expect(s.hostileBid).not.toBeNull();
      s = tick(s); // månaden rullar – styrelsen "plottar"
      s = tick(s); // ...och svarar vid nästa månadsskifte
      expect(s.competitors.find((c) => c.name === soft.name)).toBeUndefined();
      expect(s.log.some((e) => e.t.includes("CAPITULATION"))).toBe(true);
      // Raiden värmer pressen (rep-effekten dränks av köpets milstolpar).
      expect(s.pressHeat ?? 0).toBeGreaterThan(1);
    } finally {
      clearRng();
    }
  });
});

describe("RIVALENS MOTBUD: tveka och förlora målet", () => {
  it("ett stående rivalbud tar affären efter fristen", () => {
    seedRng(137);
    try {
      const target = rival("Grovewood Properties");
      const challenger = rival("Harborview Capital", { cash: 500_000_000 });
      let s = makeState({
        cash: 100_000_000,
        competitors: [target, challenger],
        pendingDeal: {
          target: target.name,
          offer: 100_000_000,
          round: 2,
          status: "countered",
          counter: 130_000_000,
          rivalBid: 110_000_000,
          rivalBidder: challenger.name,
          rivalBidAbs: 10, // långt passerat
          startedAbs: 10,
        },
      });
      s = tick(s);
      expect(s.pendingDeal).toBeNull();
      expect(s.competitors.some((c) => c.name === target.name)).toBe(false);
      const buyer = s.competitors.find((c) => c.name === challenger.name);
      expect(buyer).toBeDefined();
      expect(buyer!.portfolio.length).toBeGreaterThanOrEqual(2);
      expect(s.log.some((e) => e.t.includes("DEAL LOST"))).toBe(true);
    } finally {
      clearRng();
    }
  });

  it("RAISE_DEAL kräver att rivalens bud toppas", () => {
    const s = makeState({
      pendingDeal: {
        target: "X",
        offer: 100_000_000,
        round: 1,
        status: "countered",
        counter: 120_000_000,
        rivalBid: 110_000_000,
        rivalBidder: "Y",
        rivalBidAbs: 13,
        startedAbs: 13,
      },
    });
    const low = reducer(s, { type: "RAISE_DEAL", amount: 105_000_000 });
    expect(low.pendingDeal?.offer).toBe(100_000_000); // stoppad
    const ok = reducer(s, { type: "RAISE_DEAL", amount: 115_000_000 });
    expect(ok.pendingDeal?.offer).toBe(115_000_000);
  });
});
