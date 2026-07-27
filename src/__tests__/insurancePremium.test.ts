/* Försäkringen kostar 0,40 % av marknadsvärdet per år, med ett golv på
   2 000 kr/mån. Golvet biter bara under ~6 MSEK i värde.

   Både fastighetskortet och kvittot i loggen skrev tidigare "$2,000/mo"
   hårdkodat — för ett hus på 46 MSEK en underskattning på nästan åtta
   gånger pengarna. Premien bor nu på ETT ställe (property.ts) som både
   simulationen och panelerna läser, och testerna låser fast att de tre
   följs åt. */
import { describe, expect, it } from "vitest";
import {
  INSURANCE_FLOOR,
  INSURANCE_RATE,
  propInsurancePremium,
  propMarketValue,
} from "../engine/property";
import { advanceMonth } from "../engine/simulation";
import { reducer } from "../engine/reducer";
import { makeProperty, makeState, makeTenantFixture } from "./factories";
import type { GameState } from "../engine/types";

const house = (over = {}) =>
  makeProperty({
    id: 1, baseRent: 4_800_000, capacity: 4, condition: 80,
    tenants: [1, 2, 3, 4].map((t) => makeTenantFixture({ id: 100 + t, rent: 100_000 })),
    ...over,
  });

const withHouse = (over: Partial<GameState> = {}) =>
  makeState({ cash: 500_000_000, portfolio: [house({ insurance: true })], ...over }) as GameState;

describe("försäkringspremien", () => {
  it("är värdebaserad, inte ett fast belopp", () => {
    const s = withHouse();
    const p = s.portfolio[0];
    const value = propMarketValue(p, s);
    expect(value).toBeGreaterThan(INSURANCE_FLOOR * 12 / INSURANCE_RATE); // över golvets brytpunkt
    expect(propInsurancePremium(p, s)).toBeCloseTo((value * INSURANCE_RATE) / 12, -2);
    expect(propInsurancePremium(p, s)).toBeGreaterThan(INSURANCE_FLOOR);
  });

  it("golvet gäller bara små hus", () => {
    const s = makeState({ portfolio: [house({ baseRent: 40_000, area: 60, capacity: 1, tenants: [] })] }) as GameState;
    const p = s.portfolio[0];
    expect(propMarketValue(p, s)).toBeLessThan((INSURANCE_FLOOR * 12) / INSURANCE_RATE);
    expect(propInsurancePremium(p, s)).toBe(INSURANCE_FLOOR);
  });

  it("dyrare hus kostar mer att försäkra", () => {
    const cheap = withHouse();
    const dear = withHouse({ portfolio: [house({ insurance: true, area: 8000, baseRent: 24_000_000 })] });
    expect(propInsurancePremium(dear.portfolio[0], dear))
      .toBeGreaterThan(propInsurancePremium(cheap.portfolio[0], cheap));
  });

  it("eget försäkringsbolag tecknar de egna husen billigare", () => {
    const s = withHouse();
    const own: GameState = {
      ...s,
      ownedInsurer: { name: "Egen Assurans", policies: 0, pricing: "marknad", acquiredAbs: 0, totalNet: 0 },
    };
    expect(propInsurancePremium(own.portfolio[0], own))
      .toBeLessThan(propInsurancePremium(s.portfolio[0], s));
  });
});

describe("premien som visas är den som debiteras", () => {
  it("simulationen debiterar summan av husens premier", () => {
    const s = withHouse({ portfolio: [house({ id: 1, insurance: true }), house({ id: 2, insurance: true })] });
    // Värdena rör sig under månadsstegets gång (hyresindex, slitage), så
    // beloppet jämförs mot förväntan med marginal – det som prövas är att
    // debiteringen följer premieformeln och skalar med antalet hus.
    const expected = s.portfolio.reduce((a, p) => a + propInsurancePremium(p, s), 0);
    const after = advanceMonth({ ...s, pendingDecision: null, auction: undefined });
    expect(after.insuranceCost).toBeGreaterThan(expected * 0.8);
    expect(after.insuranceCost).toBeLessThan(expected * 1.2);

    const one = withHouse();
    const afterOne = advanceMonth({ ...one, pendingDecision: null, auction: undefined });
    expect(after.insuranceCost).toBeGreaterThan(afterOne.insuranceCost! * 1.5);
  });

  it("kvittot i loggen anger den faktiska premien, inte ett schablonbelopp", () => {
    const s = withHouse({ portfolio: [house({ insurance: undefined })] });
    const after = reducer(s, { type: "BUY_INSURANCE", id: 1 });
    const premium = propInsurancePremium(s.portfolio[0], s);
    expect(after.log[0].t).toContain(premium.toLocaleString("en-US"));
    expect(after.log[0].t).not.toContain("$2,000/mo");
  });

  it("obebyggda och pågående byggen debiteras inte", () => {
    const s = withHouse({ portfolio: [house({ insurance: true, status: "bygger", buildLeft: 5 })] });
    const after = advanceMonth({ ...s, pendingDecision: null, auction: undefined });
    expect(after.insuranceCost).toBe(0);
  });
});
