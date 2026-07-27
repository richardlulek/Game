/* Vad varje förvärvsväg gör med BALANSRÄKNINGEN.

   De åtta mna-sviterna testar förhandlingen – bud, motbud, due diligence,
   integration. Ingen av dem tittar på vad affären lämnar efter sig: hur
   mycket skuld som uppstod, om fastigheterna kom in med rätt anskaffnings-
   värde, och om belåningsgraden man valt i Policy respekterades.

   Mätsonden (acquisitionRoutes.probe) blottade tre fel som nu är lagade:
   förvärvsskulden prövas mot värdet på det som förvärvas, divisionsaffären
   följer samma belåningsgrad som vanliga köp, och policyn når hela vägen.
   LBO:n har ett eget, högre tak – hög belåning är hela instrumentet. */
import { describe, expect, it } from "vitest";
import { reducer } from "../engine/reducer";
import { loanTerms, ltvOf } from "../engine/finance";
import { propMarketValue } from "../engine/property";
import { LBO_MAX_LTV } from "../engine/mna";
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

  it("lånar enligt bankens tak, inte 75 % som förr", () => {
    run(() => {
      const s = base();
      const after = reducer(s, { type: "BUY_DIVISION", competitorName: "Harborwick", district: "innerstad" });
      expect(ltvOf(after)).toBeLessThanOrEqual(loanTerms(s).maxLtv + 0.01);
    });
  });

  it("policyns belåningsgrad når hela vägen fram", () => {
    run(() => {
      const s = base({ policy: { purchaseLtv: 0.4 } });
      const after = reducer(s, { type: "BUY_DIVISION", competitorName: "Harborwick", district: "innerstad" });
      expect(ltvOf(after)).toBeCloseTo(0.4, 1);
      const free = reducer(base(), { type: "BUY_DIVISION", competitorName: "Harborwick", district: "innerstad" });
      expect(after.debt).toBeLessThan(free.debt);
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

  it("LBO:n lånar mot husen, inte mot priset – premien är egen insats", () => {
    run(() => {
      const s = base();
      const assets = s.competitors[0].portfolio!.reduce((a, p) => a + propMarketValue(p, s), 0);
      const borrowed = closeDeal(s, "lbo").debt - s.debt;
      expect(borrowed).toBeCloseTo(assets * LBO_MAX_LTV, -6);
      // Priset ligger över tillgångsvärdet – mellanskillnaden går inte att låna.
      const paid = (s.cash - closeDeal(s, "lbo").cash) + borrowed;
      expect(paid).toBeGreaterThan(assets);
      expect(borrowed).toBeLessThan(paid);
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

  it("förvärvsskulden prövas mot husen – aldrig över 100 % belåning", () => {
    run(() => {
      const s = base();
      for (const f of ["lan", "lbo", "earnout"] as DealFinancing[]) {
        const after = closeDeal(s, f);
        expect(after.portfolio).toHaveLength(4);
        expect(ltvOf(after)).toBeLessThan(1);
      }
    });
  });

  it("LBO har sitt eget, högre tak – det är ett högriskval, inte ett vanligt lån", () => {
    run(() => {
      const s = base();
      const lbo = ltvOf(closeDeal(s, "lbo"));
      const loan = ltvOf(closeDeal(s, "lan"));
      expect(lbo).toBeCloseTo(LBO_MAX_LTV, 1);
      expect(lbo).toBeGreaterThan(loan);
      expect(lbo).toBeGreaterThan(loanTerms(s).maxLtv);
    });
  });

  it("LBO binder minst kontanter – därför väljer man den", () => {
    run(() => {
      const s = base();
      const lbo = s.cash - closeDeal(s, "lbo").cash;
      const loan = s.cash - closeDeal(s, "lan").cash;
      const cash = s.cash - closeDeal(s, "kontant").cash;
      expect(lbo).toBeLessThan(loan);
      expect(loan).toBeLessThan(cash);
    });
  });

  it("policyns belåningsgrad når bolagsaffären – men rör inte LBO:n", () => {
    run(() => {
      const cautiousLoan = closeDeal(base({ policy: { purchaseLtv: 0.4 } }), "lan");
      expect(closeDeal(base(), "lan").debt).toBeGreaterThan(cautiousLoan.debt);
      expect(ltvOf(cautiousLoan)).toBeCloseTo(0.4, 1);
      // LBO:n följer sitt eget tak och bryr sig inte om policyn.
      expect(closeDeal(base({ policy: { purchaseLtv: 0.4 } }), "lbo").debt)
        .toBe(closeDeal(base(), "lbo").debt);
    });
  });
});
