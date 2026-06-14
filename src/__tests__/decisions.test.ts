import { describe, expect, it } from "vitest";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { Offer, PendingDecision } from "../engine/types";
import { makeProperty, makeState } from "./factories";

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
