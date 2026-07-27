/* Låg belåning ska vara TRYGG, inte bara långsam. Tre mekanismer bär det,
   och testerna här låser fast var och en:

     1. Checkräkningskrediten växer med det oanvända pantutrymmet – den som
        lämnat marginal hos banken har något att möta en svacka med.
     2. Portföljdirektörens arvode står i proportion till beståndet – ett
        fast arvode åt ett enhusbolag åt upp hela marginalen.
     3. Förvaltaren lagar det kassan räcker till – annars fastnade små bolag
        i en spiral där huset förföll för att pengarna inte räckte till hela
        underhållsronden, och värdet föll med skicket.

   Dessutom: när förvaltaren tvingats sälja allt är partiet slut på riktigt,
   i stället för ett decennium av tomma månader.                            */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loanTerms, portfolioValue, revolvingLimitOf } from "../engine/finance";
import { cannotRestart } from "../engine/receivership";
import { advanceMonth, globalManagerFee } from "../engine/simulation";
import { clearRng, seedRng } from "../engine/random";
import { makeProperty, makeState, makeTenantFixture } from "./factories";
import type { GameState } from "../engine/types";

const house = (over = {}) =>
  makeProperty({ id: 1, baseRent: 1_200_000, capacity: 2, tenants: [makeTenantFixture({ id: 101, rent: 50_000 }), makeTenantFixture({ id: 102, rent: 50_000 })], ...over });

describe("checkräkningskrediten följer det oanvända pantutrymmet", () => {
  const withHouse = (over: Partial<GameState> = {}) =>
    makeState({ portfolio: [house()], reputation: 50, ...over }) as GameState;

  it("låg belåning ger en större kreditlina än maximal belåning", () => {
    const value = portfolioValue(withHouse());
    const max = loanTerms(withHouse()).maxLtv;
    const low = revolvingLimitOf(withHouse({ debt: Math.round(value * 0.4) }));
    const high = revolvingLimitOf(withHouse({ debt: Math.round(value * max) }));
    expect(low).toBeGreaterThan(high);
  });

  it("i taket återstår bara grundlinan på 5 % av värdet", () => {
    const s = withHouse();
    const value = portfolioValue(s);
    const atCeiling = revolvingLimitOf({ ...s, debt: Math.round(value * loanTerms(s).maxLtv) });
    expect(atCeiling).toBeCloseTo(Math.max(500_000, Math.round(value * 0.05)), -3);
  });

  it("linan växer när beståndet växer", () => {
    const one = revolvingLimitOf(withHouse());
    const two = revolvingLimitOf(withHouse({ portfolio: [house(), house({ id: 2 })] }));
    expect(two).toBeGreaterThan(one);
  });

  it("dras aldrig in under det som redan är utnyttjat", () => {
    const s = withHouse({ debt: 100_000_000, revolving: { limit: 3_000_000, used: 3_000_000 } });
    expect(revolvingLimitOf(s)).toBeGreaterThanOrEqual(3_000_000);
  });

  it("räknas om varje månad – den fryser inte fast på beviljandemånadens värde", () => {
    const s = makeState({
      portfolio: [house()],
      reputation: 60,
      revolving: { limit: 500_000, used: 0 },
    }) as GameState;
    const after = advanceMonth(s);
    expect(after.revolving!.limit).toBeGreaterThan(500_000);
  });
});

describe("portföljdirektörens arvode står i proportion till beståndet", () => {
  const gm = { active: true, minCondition: 40, minTenantQuality: 0.5, rentTargetPct: 1.0 };

  it("ett enhusbolag betalar långt under det gamla fasta arvodet på 15 000", () => {
    const s = makeState({ portfolio: [house()], globalManager: gm }) as GameState;
    expect(globalManagerFee(s)).toBeGreaterThan(0);
    expect(globalManagerFee(s)).toBeLessThan(15_000);
  });

  it("utan fastigheter kostar direktören ingenting – det finns inget att förvalta", () => {
    const s = makeState({ portfolio: [], globalManager: gm }) as GameState;
    expect(globalManagerFee(s)).toBe(0);
  });

  it("utan direktör utgår inget arvode alls", () => {
    const s = makeState({ portfolio: [house()] }) as GameState;
    expect(globalManagerFee(s)).toBe(0);
  });

  it("arvodet växer med beståndet", () => {
    const one = makeState({ portfolio: [house()], globalManager: gm }) as GameState;
    const five = makeState({ portfolio: [1, 2, 3, 4, 5].map((id) => house({ id })), globalManager: gm }) as GameState;
    expect(globalManagerFee(five)).toBeGreaterThan(globalManagerFee(one));
  });

  it("arvodet växer med hyran – det är en andel av det som förvaltas", () => {
    const cheap = makeState({
      portfolio: [house({ tenants: [makeTenantFixture({ id: 101, rent: 40_000 })] })],
      globalManager: gm,
    }) as GameState;
    const dear = makeState({
      portfolio: [house({ tenants: [makeTenantFixture({ id: 101, rent: 400_000 })] })],
      globalManager: gm,
    }) as GameState;
    expect(globalManagerFee(dear)).toBeGreaterThan(globalManagerFee(cheap));
  });
});

describe("förvaltaren lagar det kassan räcker till", () => {
  const gm = { active: true, minCondition: 60, minTenantQuality: 0.5, rentTargetPct: 1.0 };
  // Försäkrat hus och seedad slump: annars kunde en katastrofhändelse
  // (~1,5 %/mån på oförsäkrat) sänka skicket 25 poäng mitt i mätningen och
  // få testet att falla ungefär var trettionde körning.
  const worn = (cash: number) =>
    makeState({ cash, portfolio: [house({ condition: 40, insurance: true })], globalManager: gm }) as GameState;

  beforeEach(() => seedRng(9001));
  afterEach(() => clearRng());

  /** Skicket efter att underhållsronden hunnit bli klar (beställs månad 1,
   *  landar månad 2). Slitaget under tiden gör att vi mäter riktningen. */
  const conditionAfterTwoMonths = (s: GameState) => advanceMonth(advanceMonth(s)).portfolio[0].condition;

  it("gott om kassa ger hela ronden", () => {
    const s = worn(50_000_000);
    expect(conditionAfterTwoMonths(s)).toBeGreaterThan(50);
  });

  it("knapp kassa ger ett delvis jobb i stället för inget alls", () => {
    const full = Math.round(portfolioValue(worn(1_000_000)) * 0.02);
    // Kassan räcker inte till hela ronden – förr blev det då ingenting alls.
    const s = worn(Math.round(full * 0.8));
    const work = (advanceMonth(s).portfolio[0].pendingWorks ?? []).find((w) => w.kind === "underhåll");
    expect(work).toBeDefined();
    expect(work!.gain).toBeGreaterThan(0);
    expect(work!.gain).toBeLessThan(15); // delvis jobb ⇒ delvis effekt
  });

  it("räcker kassan inte ens till en fjärdedel av ronden görs ingenting", () => {
    const full = Math.round(portfolioValue(worn(1_000_000)) * 0.02);
    const s = worn(Math.round(full * 0.2));
    expect(advanceMonth(s).portfolio[0].pendingWorks ?? []).toHaveLength(0);
  });

  it("tom kassa beställer ingenting", () => {
    const s = worn(0);
    expect(advanceMonth(s).portfolio[0].pendingWorks ?? []).toHaveLength(0);
  });
});

describe("förvaltaren har sålt allt", () => {
  it("ett bolag utan hus och utan råd att köpa igen kan inte starta om", () => {
    const s = makeState({
      portfolio: [],
      cash: 100_000,
      listings: [makeProperty({ id: 9, owned: false, askPrice: 8_000_000 })],
    }) as GameState;
    expect(cannotRestart(s)).toBe(true);
  });

  it("räcker kassan till kontantinsatsen lever partiet vidare", () => {
    const s = makeState({
      portfolio: [],
      cash: 9_000_000,
      listings: [makeProperty({ id: 9, owned: false, askPrice: 8_000_000 })],
    }) as GameState;
    expect(cannotRestart(s)).toBe(false);
  });

  it("den som fortfarande äger något är inte utspelad", () => {
    const s = makeState({ portfolio: [house()], cash: 0, listings: [] }) as GameState;
    expect(cannotRestart(s)).toBe(false);
  });
});
