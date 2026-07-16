import { afterEach, describe, expect, it, vi } from "vitest";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { Offer, PendingDecision, Property } from "../engine/types";
import { makeProperty, makeState } from "./factories";

afterEach(() => vi.restoreAllMocks());

const decision: PendingDecision = {
  id: "test",
  title: "Testbeslut",
  text: "Välj.",
  options: [
    { label: "A", detail: "", effect: { cash: -100_000, reputation: 5, log: "valde A", logKind: "info" } },
    { label: "B", detail: "", effect: { log: "valde B", logKind: "info" } },
  ],
};

describe("beslut", () => {
  it("advanceMonth blockeras när ett beslut väntar", () => {
    const s = makeState({ pendingDecision: decision });
    expect(advanceMonth(s)).toBe(s);
  });

  it("RESOLVE_DECISION tillämpar effekten och rensar beslutet", () => {
    const s = makeState({ pendingDecision: decision, cash: 1_000_000, reputation: 50 });
    const next = reducer(s, { type: "RESOLVE_DECISION", optionIndex: 0 });
    expect(next.pendingDecision).toBeNull();
    expect(next.cash).toBe(900_000);
    expect(next.reputation).toBe(55);
    expect(next.log[0].t).toBe("valde A");
  });

  it("RESOLVE_DECISION med tomt alternativ gör inget", () => {
    const s = makeState({ pendingDecision: decision });
    expect(reducer(s, { type: "RESOLVE_DECISION", optionIndex: 9 })).toBe(s);
  });
});

describe("bud", () => {
  const offer: Offer = {
    id: 500, kind: "buyout", propId: 1, propLabel: "Bostadshus",
    districtName: "Centrum", from: "Rival AB", amount: 4_000_000, expiresIn: 3,
  };

  it("ACCEPT_OFFER säljer fastigheten och tar bort budet", () => {
    const s = makeState({
      portfolio: [makeProperty({ id: 1, purchasePrice: 2_000_000 })],
      offers: [offer], cash: 0, debt: 0,
    });
    const next = reducer(s, { type: "ACCEPT_OFFER", offerId: 500 });
    expect(next.portfolio).toHaveLength(0);
    expect(next.offers).toHaveLength(0);
    expect(next.cash).toBe(4_000_000);
  });

  it("DECLINE_OFFER tar bort budet utan att sälja", () => {
    const s = makeState({ portfolio: [makeProperty({ id: 1 })], offers: [offer] });
    const next = reducer(s, { type: "DECLINE_OFFER", offerId: 500 });
    expect(next.offers).toHaveLength(0);
    expect(next.portfolio).toHaveLength(1);
  });
});

describe("PLACE_BID (utgående bud på marknadsobjekt)", () => {
  const listing: Property = makeProperty({ id: 7, owned: false, askPrice: 4_000_000, tenants: [] });

  it("accepterat bud flyttar objektet till portföljen till budpriset", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.0); // alltid accept
    const s = makeState({ listings: [listing], cash: 5_000_000, debt: 0 });
    const next = reducer(s, { type: "PLACE_BID", id: 7, amount: 3_600_000 });
    expect(next.listings).toHaveLength(0);
    expect(next.portfolio).toHaveLength(1);
    expect(next.portfolio[0].purchasePrice).toBe(3_600_000);
  });

  it("avvisat bud (high roll) behåller objektet på marknaden", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // avvisat + ej tillbakadraget
    const s = makeState({ listings: [listing], cash: 5_000_000, debt: 0 });
    const next = reducer(s, { type: "PLACE_BID", id: 7, amount: 3_200_000 });
    expect(next.listings).toHaveLength(1);
    expect(next.portfolio).toHaveLength(0);
  });

  it("avvisat bud spärrar nya bud på samma objekt i två månader (anti-spam)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // avvisat, ej tillbakadraget
    const s0 = makeState({ listings: [listing], cash: 5_000_000, debt: 0, year: 1, month: 3 });
    const s1 = reducer(s0, { type: "PLACE_BID", id: 7, amount: 3_200_000 });
    expect(s1.listings[0].bidRejectedAbs).toBe(1 * 12 + 3);
    // Nytt bud direkt: blockeras utan slumpdrag.
    const s2 = reducer(s1, { type: "PLACE_BID", id: 7, amount: 3_200_000 });
    expect(s2.portfolio).toHaveLength(0);
    expect(s2.log[0].t).toContain("won't consider new bids");
    // Två månader senare går det bra igen (accept vid låg roll).
    vi.spyOn(Math, "random").mockReturnValue(0.0);
    const s3 = reducer({ ...s1, month: 5 }, { type: "PLACE_BID", id: 7, amount: 3_600_000 });
    expect(s3.portfolio).toHaveLength(1);
  });

  it("säljaren tar annat bud: huset försvinner inte utan går till ett stadsbolag", () => {
    // roll 1 (0.99): budet avvisas · roll 2 (0.1): säljaren tar annat bud
    // roll 3 (0.0): första rivalen blir köpare.
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.1)
      .mockReturnValue(0.0);
    const placed: Property = { ...listing, parcelId: "pc-test" };
    const rival = { name: "Nordfast AB", cash: 50_000_000, units: 0, equity: 0, portfolio: [], strategy: "värde" as const, agenda: { kind: "units" as const, target: 5, label: "" } };
    const s = makeState({ listings: [placed], competitors: [rival], cash: 5_000_000, debt: 0 });
    const next = reducer(s, { type: "PLACE_BID", id: 7, amount: 3_200_000 });
    expect(next.listings).toHaveLength(0);
    expect(next.portfolio).toHaveLength(0);
    const bought = next.competitors[0].portfolio.find((p) => p.id === 7);
    expect(bought).toBeDefined();
    expect(bought!.parcelId).toBe("pc-test"); // tomtrutan (och huset) står kvar
    expect(bought!.expiresMonth).toBeUndefined();
  });
});
