/* M&A 2.0 batch 1: förhandlingen. Bud är en dialog – ägaren svarar utifrån
   sin egen värdering (persona, standing, press), affären stängs med ett
   finansieringsval och earn-outs förfaller bara om beståndet levererar. */

import { describe, expect, it } from "vitest";
import { LBO_MAX_LTV, MAX_DEAL_ROUNDS, acquiredAssetValue, ownerAskPrice, ownerResponse } from "../engine/mna";
import { acquisitionLtv } from "../engine/finance";
import { clearRng, seedRng } from "../engine/random";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { Competitor, GameState } from "../engine/types";
import { makeProperty, makeState } from "./factories";

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

function rival(name: string, over: Partial<Competitor> = {}): Competitor {
  return {
    name,
    cash: 10_000_000,
    units: 0,
    equity: 80_000_000,
    portfolio: [makeProperty({ id: 7700, owned: false, askPrice: 60_000_000 })],
    strategy: "värde",
    ...over,
  };
}

describe("ÄGARENS PRIS: persona, relation och press", () => {
  it("aggressiva ägare kräver mer, pressade mjuknar, fiender straffar dig", () => {
    const base = makeState({});
    const shark = ownerAskPrice(base, rival("Harborview Capital"));
    const builder = ownerAskPrice(base, rival("Grovewood Properties"));
    expect(shark).toBeGreaterThan(builder);
    const stressed = ownerAskPrice(base, rival("Harborview Capital", { icrBadMonths: 2 }));
    expect(stressed).toBeLessThan(shark);
    const hostile = makeState({ standing: { rivals: { "Grovewood Properties": -50 } } });
    expect(ownerAskPrice(hostile, rival("Grovewood Properties"))).toBeGreaterThan(builder);
  });

  it("svarslogiken: accept vid ask, motbud i bandet, avvisat under", () => {
    const s = makeState({});
    const c = rival("Wellspring Invest");
    const ask = ownerAskPrice(s, c);
    expect(ownerResponse(s, c, ask, 1).kind).toBe("accept");
    const counter = ownerResponse(s, c, Math.round(ask * 0.9), 1);
    expect(counter.kind).toBe("counter");
    expect(ownerResponse(s, c, Math.round(ask * 0.7), 1).kind).toBe("reject");
    // Sista rundan: ägaren prutar hellre än tappar affären.
    expect(ownerResponse(s, c, Math.round(ask * 0.98), MAX_DEAL_ROUNDS).kind).toBe("accept");
  });
});

describe("FÖRHANDLINGSFLÖDET: bud → motbud → avslut", () => {
  it("hela loopen: propose → counter → raise → accept → finalize med lån", () => {
    seedRng(101);
    try {
      const c = rival("Wellspring Invest", { debt: 20_000_000 });
      let s = makeState({ cash: 80_000_000, competitors: [c] });
      const ask = ownerAskPrice(s, c);
      s = reducer(s, { type: "PROPOSE_ACQUISITION", competitorName: c.name, amount: Math.round(ask * 0.9) });
      expect(s.pendingDeal?.status).toBe("waiting");
      s = tick(s);
      expect(s.pendingDeal?.status).toBe("countered");
      const counter = s.pendingDeal!.counter!;
      s = reducer(s, { type: "RAISE_DEAL", amount: counter });
      expect(s.pendingDeal?.round).toBe(2);
      s = tick(s);
      expect(s.pendingDeal?.status).toBe("accepted");
      const debtBefore = s.debt;
      // Rivalen amorterar medan förhandlingen pågår, så det är skulden VID
      // TILLTRÄDET som övertas – inte den den hade när budet lades.
      const assumed = Math.round(s.competitors.find((x) => x.name === c.name)!.debt ?? 0);
      expect(assumed).toBeGreaterThan(0);
      const before = s;
      const assets = acquiredAssetValue(s, s.competitors.find((x) => x.name === c.name)!);
      s = reducer(s, { type: "FINALIZE_DEAL", financing: "lan" });
      expect(s.competitors.find((x) => x.name === c.name)).toBeUndefined();
      expect(s.pendingDeal).toBeNull();
      // Förvärvsskulden lånas mot HUSEN, inte mot priset: högst
      // acquisitionLtv av det förvärvade beståndets värde, plus rivalens
      // övertagna skuld. Betalar man en premie över tillgångsvärdet är
      // premien egen insats.
      const cap = Math.round(assets * acquisitionLtv(before));
      expect(s.debt).toBeCloseTo(debtBefore + Math.min(Math.round(counter * 0.75), cap) + assumed, -5);
      expect(s.debt).toBeLessThan(debtBefore + Math.round(counter * 0.75) + assumed);
    } finally {
      clearRng();
    }
  });

  it("lågt bud avvisas: cooldown och stängd dörr", () => {
    seedRng(103);
    try {
      const c = rival("City Core Group");
      let s = makeState({ cash: 80_000_000, competitors: [c] });
      s = reducer(s, { type: "PROPOSE_ACQUISITION", competitorName: c.name, amount: Math.round(c.equity * 0.81) });
      s = tick(s);
      expect(s.pendingDeal).toBeNull();
      expect(s.dealCooldowns?.[c.name]).toBeGreaterThan(s.year * 12 + s.month);
      // Dörren är stängd: nytt bud studsar.
      const again = reducer(s, { type: "PROPOSE_ACQUISITION", competitorName: c.name, amount: c.equity * 2 });
      expect(again.pendingDeal ?? null).toBeNull();
    } finally {
      clearRng();
    }
  });

  it("finansieringsvalen vaktar sina krav: kontant kräver kassa, aktier kräver notering", () => {
    const c = rival("Sterling & Partners");
    const accepted = (cash: number): GameState =>
      makeState({
        cash,
        competitors: [c],
        pendingDeal: { target: c.name, offer: 120_000_000, round: 2, status: "accepted", startedAbs: 13 },
      });
    const poor = reducer(accepted(5_000_000), { type: "FINALIZE_DEAL", financing: "kontant" });
    expect(poor.competitors).toHaveLength(1); // köpet gick INTE igenom
    const noIpo = reducer(accepted(200_000_000), { type: "FINALIZE_DEAL", financing: "aktier" });
    expect(noIpo.competitors).toHaveLength(1);
    const cashDeal = reducer(accepted(200_000_000), { type: "FINALIZE_DEAL", financing: "kontant" });
    expect(cashDeal.competitors).toHaveLength(0);
    expect(cashDeal.debt).toBe(0 + 0); // ingen ny skuld (rivalen var skuldfri)
  });

  it("LBO: liten kontantinsats, ~90 % blir förvärvsskuld", () => {
    const c = rival("Sterling & Partners");
    const accepted = (cash: number): GameState =>
      makeState({
        cash,
        competitors: [c],
        pendingDeal: { target: c.name, offer: 120_000_000, round: 2, status: "accepted", startedAbs: 13 },
      });
    const start = accepted(200_000_000);
    const assets = acquiredAssetValue(start, c);
    const lbo = reducer(start, { type: "FINALIZE_DEAL", financing: "lbo" });
    expect(lbo.competitors).toHaveLength(0); // affären stängd
    // LBO:n har sitt EGNA, högre tak – men lånar mot husen, inte mot priset.
    expect(lbo.debt).toBeCloseTo(assets * LBO_MAX_LTV, -6);
    expect(lbo.debt / assets).toBeCloseTo(LBO_MAX_LTV, 1);
    // För liten kassa för ens handpenningen → affären uteblir.
    const poor = reducer(accepted(8_000_000), { type: "FINALIZE_DEAL", financing: "lbo" });
    expect(poor.competitors).toHaveLength(1);
  });

  it("earn-out bokas vid avslut och förfaller bara om beståndet levererar", () => {
    seedRng(107);
    try {
      const c = rival("Grovewood Properties");
      let s = makeState({
        cash: 80_000_000,
        competitors: [c],
        pendingDeal: { target: c.name, offer: 100_000_000, round: 1, status: "accepted", startedAbs: 13 },
      });
      s = reducer(s, { type: "FINALIZE_DEAL", financing: "earnout" });
      expect(s.earnOuts).toHaveLength(1);
      expect(s.earnOuts![0].amount).toBe(25_000_000);
      // Förfall: beståndet levererar (mål 0 gör utfallet säkert) → betalning.
      s.earnOuts = [{ ...s.earnOuts![0], dueAbs: s.year * 12 + s.month, noiTarget: 0 }];
      const cashBefore = s.cash;
      s = tick(s);
      expect(s.cash).toBeLessThanOrEqual(cashBefore - 25_000_000 + 5_000_000); // betalt (± månadens kassaflöde)
      expect(s.earnOuts).toHaveLength(0);
      expect(s.log.some((e) => e.t.includes("EARN-OUT DUE"))).toBe(true);
    } finally {
      clearRng();
    }
  });
});
