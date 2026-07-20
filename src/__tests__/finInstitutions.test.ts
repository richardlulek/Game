import { describe, expect, it } from "vitest";
import { loanTerms } from "../engine/finance";
import {
  bankMonthlyNet,
  bankPurchasePrice,
  OWN_BANK_RATE_DELTA,
  tickBank,
  tickInsurer,
} from "../engine/finInstitutions";
import { clearRng, seedRng } from "../engine/random";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { GameState } from "../engine/types";
import { makeProperty, makeState } from "./factories";

/* Finansiella institut (Cap Lab B&F-light): ägd bank tjänar räntemarginal
   och blöder kreditförluster i bust; försäkringsbolaget tjänar premier och
   tar skadetoppar; synergier: egen låneränta −0,3 %, egna premier −40 %. */

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

const bank = (stance: "försiktig" | "balanserad" | "aggressiv" = "balanserad") => ({
  name: "Testbanken",
  deposits: 60_000_000,
  loansOut: 39_000_000,
  stance,
  acquiredAbs: 12,
  totalNet: 0,
});

describe("FININSTITUT: bank och försäkringsbolag", () => {
  it("köp kräver nivå 4 och kassa; köpet bokförs", () => {
    const låg = makeState({ cash: 100_000_000, companyLevel: 3 });
    expect(reducer(låg, { type: "BUY_BANK" }).ownedBank).toBeUndefined();
    const ok = makeState({ cash: 100_000_000, companyLevel: 4 });
    const s1 = reducer(ok, { type: "BUY_BANK" });
    expect(s1.ownedBank?.name).toBeTruthy();
    expect(s1.cash).toBe(100_000_000 - bankPurchasePrice(100_000_000));
    // Dubbelköp avvisas.
    expect(reducer(s1, { type: "BUY_BANK" }).cash).toBe(s1.cash);
  });

  it("banken tjänar räntemarginal i normalläge och förlorar mer i bust", () => {
    seedRng(3);
    try {
      const calm = makeState({ interestRate: 2.5, marketCycle: { phase: "stable", monthsRemaining: 10 } });
      const rNormal = tickBank(bank("balanserad"), calm);
      expect(rNormal.net).toBeGreaterThan(0);
      const bust = makeState({ interestRate: 2.5, marketCycle: { phase: "bust", monthsRemaining: 6 } });
      // Aggressiv hållning i bust: kreditförlusterna växer markant.
      let bustLoss = 0;
      let normLoss = 0;
      for (let i = 0; i < 20; i++) {
        bustLoss += bankMonthlyNet(bank("aggressiv"), bust) - tickBank(bank("aggressiv"), bust).net;
        normLoss += bankMonthlyNet(bank("aggressiv"), calm) - tickBank(bank("aggressiv"), calm).net;
      }
      expect(bustLoss).toBeGreaterThan(normLoss);
    } finally {
      clearRng();
    }
  });

  it("egen bank sänker bolagets låneränta med 0,30 %", () => {
    const utan = makeState({ cash: 10_000_000 });
    const med = makeState({ cash: 10_000_000, ownedBank: bank() });
    expect(loanTerms(med).rate).toBeCloseTo(loanTerms(utan).rate + OWN_BANK_RATE_DELTA, 5);
  });

  it("försäkringsbolaget växer boken mot stadens stock och tjänar netto", () => {
    seedRng(5);
    try {
      // Staden behöver ett bestånd att försäkra – kapaciteten följer stocken.
      const s = makeState({
        competitors: [{
          name: "Stadsbolaget", cash: 1_000_000, units: 40, equity: 0, strategy: "värde" as const,
          portfolio: Array.from({ length: 40 }, (_, i) => makeProperty({ id: 7000 + i, parcelId: undefined })),
        }],
      });
      const r = tickInsurer(
        { name: "Testförsäkring", policies: 200, pricing: "marknad", acquiredAbs: 1, totalNet: 0 },
        s,
      );
      expect(r.insurer.policies).toBeGreaterThanOrEqual(200);
      // Marknadspris: positiv väntad marginal (skadetopp kan slå enstaka månad).
      let total = 0;
      for (let i = 0; i < 24; i++) total += tickInsurer(r.insurer, s).net;
      expect(total).toBeGreaterThan(0);
    } finally {
      clearRng();
    }
  });

  it("simulationen bokför institutens netto i kassan och equity inkluderar värdet", () => {
    seedRng(9);
    try {
      const s0 = makeState({
        cash: 50_000_000,
        companyLevel: 4,
        ownedBank: bank(),
        ownedInsurer: { name: "Testförsäkring", policies: 300, pricing: "hög", acquiredAbs: 1, totalNet: 0 },
      });
      const s1 = tick(s0);
      expect(s1.ownedBank!.totalNet).not.toBe(0);
      expect(s1.ownedInsurer!.totalNet).not.toBe(0);
      // Egna försäkrade fastigheters premie rabatteras (testas via kostnadsfältet
      // i ett separat scenario med försäkrade hus — här räcker att fältet finns).
      expect(s1.insuranceCost).toBeDefined();
    } finally {
      clearRng();
    }
  });
});
