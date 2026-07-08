/* Tester för försäljningsmekaniken: annonsering med köparintresse
   styrt av skick/uthyrning/avkastning/pris, snabbförsäljning med
   rabatt, och säljpaket med volympremie. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { propMarketValue } from "../engine/property";
import { reducer } from "../engine/reducer";
import { QUICK_SALE_FACTOR, attractiveness, interestChance } from "../engine/selling";
import { advanceMonth } from "../engine/simulation";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const fineProp = (id = 1) =>
  makeProperty({
    id,
    condition: 95,
    tenants: [makeTenantFixture({ id: id * 10 + 1 }), makeTenantFixture({ id: id * 10 + 2 })],
  });

describe("köparintresse", () => {
  it("fina, uthyrda hus är attraktivare än slitna vakanser", () => {
    const s = makeState({});
    const bra = attractiveness(fineProp(), s);
    const dålig = attractiveness(makeProperty({ id: 2, condition: 25, tenants: [] }), s);
    expect(bra).toBeGreaterThan(dålig + 0.3);
  });

  it("rabatt mot värdet ger högre budchans än överpris", () => {
    expect(interestChance(0.8, 900, 1000, 1)).toBeGreaterThan(interestChance(0.8, 1200, 1000, 1));
    expect(interestChance(0.8, 1200, 1000, 1)).toBeLessThan(0.3);
  });
});

describe("annonsering och bud", () => {
  it("LIST_FOR_SALE annonserar och UNLIST tar bort", () => {
    let s = makeState({ portfolio: [fineProp()] });
    s = reducer(s, { type: "LIST_FOR_SALE", id: 1, ask: 5_000_000 });
    expect(s.portfolio[0].forSale?.ask).toBe(5_000_000);
    s = reducer(s, { type: "UNLIST", id: 1 });
    expect(s.portfolio[0].forSale).toBeUndefined();
  });

  it("attraktiv annons drar in ett bud som kan accepteras", () => {
    const p = fineProp();
    let s = makeState({ cash: 1_000_000, portfolio: [p] });
    const value = propMarketValue(p, s);
    // Lätt rabatt mot värdet → högt intresse (värdet driver med marknaden).
    s = reducer(s, { type: "LIST_FOR_SALE", id: 1, ask: Math.round(value * 0.95) });
    s = advanceMonth(s);
    const bud = s.offers.find((o) => o.kind === "listing" && o.propId === 1);
    expect(bud).toBeDefined();
    expect(bud!.amount).toBeGreaterThan(value * 0.8);

    const cashBefore = s.cash;
    const s2 = reducer(s, { type: "ACCEPT_OFFER", offerId: bud!.id });
    expect(s2.portfolio).toHaveLength(0);
    expect(s2.cash).toBe(cashBefore + bud!.amount); // ingen skuld → hela beloppet
  });
});

describe("snabbförsäljning", () => {
  it("ger 85 % av marknadsvärdet direkt", () => {
    const p = fineProp();
    const s0 = makeState({ cash: 0, portfolio: [p] });
    const value = propMarketValue(p, s0);
    const s1 = reducer(s0, { type: "SELL", id: 1 });
    expect(s1.portfolio).toHaveLength(0);
    expect(s1.cash).toBe(Math.round(value * QUICK_SALE_FACTOR));
  });
});

describe("säljpaket", () => {
  it("skapas, drar in paketbud och säljs i en affär", () => {
    const p1 = fineProp(1);
    const p2 = fineProp(2);
    let s = makeState({ cash: 1_000_000, portfolio: [p1, p2] });
    const value = propMarketValue(p1, s) + propMarketValue(p2, s);
    s = reducer(s, { type: "LIST_PACKAGE", ids: [1, 2], ask: Math.round(value) });
    expect(s.salePackages).toHaveLength(1);
    expect(s.portfolio.every((p) => p.forSale?.packageId === s.salePackages![0].id)).toBe(true);

    s = advanceMonth(s);
    const bud = s.offers.find((o) => o.kind === "paket");
    expect(bud).toBeDefined();
    expect(bud!.propertyIds).toEqual([1, 2]);

    const cashBefore = s.cash;
    const s2 = reducer(s, { type: "ACCEPT_OFFER", offerId: bud!.id });
    expect(s2.portfolio).toHaveLength(0);
    expect(s2.salePackages).toHaveLength(0);
    expect(s2.cash).toBe(cashBefore + bud!.amount);
  });

  it("UNLIST_PACKAGE släpper alla fastigheter", () => {
    let s = makeState({ portfolio: [fineProp(1), fineProp(2)] });
    s = reducer(s, { type: "LIST_PACKAGE", ids: [1, 2], ask: 10_000_000 });
    s = reducer(s, { type: "UNLIST_PACKAGE", packageId: s.salePackages![0].id });
    expect(s.salePackages).toHaveLength(0);
    expect(s.portfolio.every((p) => p.forSale === undefined)).toBe(true);
  });
});
