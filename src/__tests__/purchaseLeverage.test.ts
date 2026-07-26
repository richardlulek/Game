/* Belåningsgrad vid förvärv. Tidigare lånade VARJE köp maximalt – hävstången
   var en regel, inte ett val. Nu sätter banken taket och policyn får välja
   att ligga under. Testerna låser båda halvorna: att taket följer ryktet, och
   att policyn faktiskt styr hur mycket som lånas vid ett köp. */
import { describe, expect, it } from "vitest";
import { acquisitionLtv, loanTerms } from "../engine/finance";
import { reducer } from "../engine/reducer";
import { makeProperty, makeState } from "./factories";
import type { GameState } from "./../engine/types";

/** Ett objekt till salu som spelaren har råd med. */
function forSale(askPrice = 20_000_000) {
  return makeProperty({ id: 55, owned: false, status: "klar", askPrice, baseRent: 1_100_000 });
}

const buyState = (over: Partial<GameState> = {}) =>
  makeState({ cash: 100_000_000, debt: 0, reputation: 50, listings: [forSale()], ...over }) as GameState;

describe("bankens tak följer ryktet", () => {
  it("högre rykte ger högre maximal belåningsgrad", () => {
    const low = loanTerms(makeState({ reputation: 0 })).maxLtv;
    const mid = loanTerms(makeState({ reputation: 50 })).maxLtv;
    const high = loanTerms(makeState({ reputation: 100 })).maxLtv;
    expect(low).toBeCloseTo(0.55, 6);
    expect(mid).toBeCloseTo(0.645, 6);
    expect(high).toBeCloseTo(0.74, 6);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });
});

describe("policyns belåningsgrad vid förvärv", () => {
  it("utan val lånas bankens maximum – oförändrat beteende", () => {
    const s = buyState();
    expect(acquisitionLtv(s)).toBeCloseTo(loanTerms(s).maxLtv, 6);
  });

  it("policyn kan välja lägre än taket", () => {
    const s = buyState({ policy: { purchaseLtv: 0.4 } });
    expect(acquisitionLtv(s)).toBeCloseTo(0.4, 6);
  });

  it("policyn kan aldrig låna MER än banken tillåter", () => {
    const s = buyState({ reputation: 0, policy: { purchaseLtv: 0.85 } });
    expect(acquisitionLtv(s)).toBeCloseTo(loanTerms(s).maxLtv, 6); // 0.55
  });

  it("noll belåning betyder kontantköp", () => {
    const s = buyState({ policy: { purchaseLtv: 0 } });
    expect(acquisitionLtv(s)).toBe(0);
  });

  it("ett köp tar upp lånet enligt policyn, inte enligt taket", () => {
    const price = 20_000_000;
    const s = buyState({ policy: { purchaseLtv: 0.4 }, listings: [forSale(price)] });
    const after = reducer(s, { type: "BUY", id: 55 });
    expect(after.portfolio).toHaveLength(1);
    // 40 % lån, 60 % kontant.
    expect(after.debt).toBeCloseTo(price * 0.4, -2);
    expect(after.cash).toBeCloseTo(s.cash - price * 0.6, -2);
  });

  it("samma köp utan policy belånas maximalt", () => {
    const price = 20_000_000;
    const s = buyState({ listings: [forSale(price)] });
    const max = loanTerms(s).maxLtv;
    const after = reducer(s, { type: "BUY", id: 55 });
    expect(after.debt).toBeCloseTo(price * max, -2);
    expect(after.debt).toBeGreaterThan(price * 0.4); // mer skuld än i testet ovan
  });

  it("kontantköp lämnar bolaget skuldfritt", () => {
    const price = 20_000_000;
    const s = buyState({ policy: { purchaseLtv: 0 }, listings: [forSale(price)] });
    const after = reducer(s, { type: "BUY", id: 55 });
    expect(after.debt).toBe(0);
    expect(after.cash).toBeCloseTo(s.cash - price, -2);
  });

  it("lägre belåning kräver mer kassa – köpet stoppas om den inte räcker", () => {
    const price = 20_000_000;
    // 60 % kontantinsats = 12 MSEK, men bara 5 MSEK i kassan.
    const s = buyState({ cash: 5_000_000, policy: { purchaseLtv: 0.4 }, listings: [forSale(price)] });
    const after = reducer(s, { type: "BUY", id: 55 });
    expect(after.portfolio).toHaveLength(0);
    expect(after.debt).toBe(0);
  });
});
