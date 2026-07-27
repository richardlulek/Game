/* Vad varje förvärvsväg gör med BALANSRÄKNINGEN.

   De åtta mna-sviterna testar förhandlingen – bud, motbud, due diligence,
   integration. Ingen av dem tittar på vad affären lämnar efter sig: hur
   mycket skuld som uppstod, om fastigheterna kom in med rätt anskaffnings-
   värde, och om belåningsgraden man valt i Policy respekterades.

   Testerna här beskriver vad koden GÖR idag. Två av dem dokumenterar
   avvikelser som mätsonden (acquisitionRoutes.probe) blottade och som ännu
   inte är åtgärdade – de är märkta därefter, så att ingen läser dem som
   ett godkännande. */
import { describe, expect, it } from "vitest";
import { reducer } from "../engine/reducer";
import { acquisitionLtv, loanTerms, ltvOf, portfolioValue } from "../engine/finance";
import { propMarketValue } from "../engine/property";
import { clearRng, seedRng } from "../engine/random";
import { makeProperty, makeState, makeTenantFixture } from "./factories";
import type { Competitor, DealFinancing, GameState, Property } from "../engine/types";

const CASH = 2_000_000_000;

function stock(ask: number): Property[] {
  return [1, 2, 3, 4].map((i) =>
    makeProperty({
      id: 7700 + i, owned: false, status: "klar",
      district: "innerstad", districtName: "Inner City",
      askPrice: ask, baseRent: 4_800_000, capacity: 4, condition: 80,
      tenants: [1, 2, 3, 4].map((t) => makeTenantFixture({ id: (7700 + i) * 10 + t, rent: 100_000 })),
    }),
  );
}

function rivalWith(portfolio: Property[]): Competitor {
  return { name: "Harborwick", cash: 20_000_000, units: portfolio.length, equity: portfolio.length * 60_000_000, debt: 0, portfolio, strategy: "värde" };
}

/** Utgångsläge där utgångspriset ÄR marknadsvärdet, så vägarna är jämförbara. */
function base(over: Partial<GameState> = {}): GameState {
  const probe = makeState({ cash: CASH, competitors: [rivalWith(stock(1))] }) as GameState;
  const fair = Math.round(propMarketValue(probe.competitors[0].portfolio![0], probe));
  return makeState({ cash: CASH, debt: 0, reputation: 50, competitors: [rivalWith(stock(fair))], ...over }) as GameState;
}

function closeDeal(s: GameState, financing: DealFinancing): GameState {
  const target = s.competitors[0];
  return reducer(
    { ...s, pendingDeal: { target: target.name, offer: Math.round((target.equity ?? 0) * 1.1), round: 1, status: "accepted", startedAbs: 0 } },
    { type: "FINALIZE_DEAL", financing },
  );
}

/** Kör i seedat läge så inget test beror på slumpen. */
function run<T>(fn: () => T): T {
  seedRng(4242);
  try { return fn(); } finally { clearRng(); }
}

describe("vanligt fastighetsköp", () => {
  it("lånar enligt bankens tak och landar på det taket", () => {
    run(() => {
      const s = base();
      const p = s.competitors[0].portfolio![0];
      const after = reducer({ ...s, listings: [p] }, { type: "BUY", id: p.id });
      expect(after.portfolio).toHaveLength(1);
      expect(after.debt).toBeCloseTo(p.askPrice * loanTerms(s).maxLtv, -4);
      expect(ltvOf(after)).toBeLessThanOrEqual(loanTerms(s).maxLtv + 0.01);
    });
  });

  it("policyns belåningsgrad slår igenom", () => {
    run(() => {
      const s = base({ policy: { purchaseLtv: 0.4 } });
      const p = s.competitors[0].portfolio![0];
      const after = reducer({ ...s, listings: [p] }, { type: "BUY", id: p.id });
      expect(after.debt).toBeCloseTo(p.askPrice * 0.4, -4);
      expect(ltvOf(after)).toBeCloseTo(0.4, 1);
    });
  });

  it("huset kommer in med köpeskillingen som anskaffningsvärde", () => {
    run(() => {
      const s = base();
      const p = s.competitors[0].portfolio![0];
      const after = reducer({ ...s, listings: [p] }, { type: "BUY", id: p.id });
      // Yield-on-cost och equityRecycle bygger båda på purchasePrice.
      expect(after.portfolio[0].purchasePrice).toBeGreaterThan(0);
    });
  });
});

describe("divisionsaffär: hela distriktet i en klump", () => {
  it("för in alla husen med anskaffningsvärde satt", () => {
    run(() => {
      const s = base();
      const after = reducer(s, { type: "BUY_DIVISION", competitorName: "Harborwick", district: "innerstad" });
      expect(after.portfolio).toHaveLength(4);
      for (const p of after.portfolio) expect(p.purchasePrice).toBeGreaterThan(0);
      expect(s.competitors[0].portfolio).toHaveLength(4);
      expect(after.competitors[0].portfolio).toHaveLength(0);
    });
  });

  it("kostar en paketpremie över marknadsvärdet", () => {
    run(() => {
      const s = base();
      const marketValue = s.competitors[0].portfolio!.reduce((a, p) => a + propMarketValue(p, s), 0);
      const after = reducer(s, { type: "BUY_DIVISION", competitorName: "Harborwick", district: "innerstad" });
      const paid = (s.cash - after.cash) + (after.debt - s.debt);
      expect(paid).toBeGreaterThan(marketValue);
      expect(paid / marketValue).toBeLessThan(1.15);
    });
  });

  /* AVVIKELSE – ej åtgärdad. Divisionsaffären har 25 % kontantinsats
     hårdkodad, vilket ger 75 % belåning oavsett bankens tak (64,5 % vid
     rykte 50) och oavsett vad spelaren valt i Policy. */
  it("AVVIKELSE: ignorerar både bankens tak och policyn", () => {
    run(() => {
      const s = base({ policy: { purchaseLtv: 0.4 } });
      const after = reducer(s, { type: "BUY_DIVISION", competitorName: "Harborwick", district: "innerstad" });
      const borrowed = after.debt - s.debt;
      const paid = (s.cash - after.cash) + borrowed;
      expect(borrowed / paid).toBeCloseTo(0.75, 2);
      expect(borrowed / paid).toBeGreaterThan(loanTerms(s).maxLtv);
      expect(borrowed / paid).toBeGreaterThan(acquisitionLtv(s));
    });
  });
});

describe("bolagsaffär: finansieringsformerna", () => {
  it("kontant kräver hela beloppet och lämnar bolaget skuldfritt", () => {
    run(() => {
      const s = base();
      const after = closeDeal(s, "kontant");
      expect(after.portfolio).toHaveLength(4);
      expect(after.debt).toBe(s.debt);
      expect(s.cash - after.cash).toBeGreaterThan(0);
    });
  });

  it("aktiebetalning kräver notering", () => {
    run(() => {
      const after = closeDeal(base(), "aktier");
      expect(after.portfolio).toHaveLength(0);
      expect(after.log[0].t).toMatch(/listed company|IPO/i);
    });
  });

  it("LBO lägger nästan hela priset i förvärvsskuld", () => {
    run(() => {
      const s = base();
      const after = closeDeal(s, "lbo");
      const borrowed = after.debt - s.debt;
      const paid = (s.cash - after.cash) + borrowed;
      expect(borrowed / paid).toBeGreaterThan(0.85);
    });
  });

  it("bolaget kostar mer per krona bestånd än husen var för sig", () => {
    run(() => {
      const s = base();
      const marketValue = s.competitors[0].portfolio!.reduce((a, p) => a + propMarketValue(p, s), 0);
      const after = closeDeal(s, "kontant");
      const paid = s.cash - after.cash;
      // Ägarpremie och synergiprissättning: kontroll kostar extra.
      expect(paid).toBeGreaterThan(marketValue * 1.2);
    });
  });

  /* AVVIKELSE – ej åtgärdad. Förvärvsskulden prövas inte mot värdet på det
     som förvärvas, så ett lånefinansierat bolagsköp lämnar bolaget med
     högre skuld än tillgångarna är värda. Mätt: 108 % vid "lan",
     129 % vid "lbo". */
  it("AVVIKELSE: lånefinansierat bolagsköp ger belåning över 100 %", () => {
    run(() => {
      const s = base();
      const after = closeDeal(s, "lan");
      expect(portfolioValue(after)).toBeGreaterThan(0);
      expect(ltvOf(after)).toBeGreaterThan(1);
    });
  });

  it("AVVIKELSE: policyns belåningsgrad når inte bolagsaffären", () => {
    run(() => {
      const free = closeDeal(base(), "lan");
      const capped = closeDeal(base({ policy: { purchaseLtv: 0.4 } }), "lan");
      // Samma skuld trots att policyn säger 40 %.
      expect(capped.debt).toBe(free.debt);
    });
  });
});
