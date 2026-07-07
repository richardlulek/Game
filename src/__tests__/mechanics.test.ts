/* Tester för mekanikpaketet: hyresmarknad, lån, auktioner, underhåll,
   planändring, uppköp, valhändelser och vinstvillkor. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IPO_EQUITY } from "../engine/data";
import { monthlyInterestOf, totalDebtOf } from "../engine/finance";
import { propAnnualOpex } from "../engine/property";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { InboxItem } from "../engine/types";
import { makeCompetitor, makeProperty, makeState, makeTenantFixture } from "./factories";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const HOLDING = {
  id: 700,
  parcelId: "kulle-1",
  district: "kulle",
  districtName: "Villakullen",
  type: "bostad" as const,
  typeLabel: "Bostadshus",
  area: 1200,
};

describe("hyresmarknad: intressentkö och förnyelse", () => {
  it("vakant lokal får intressenter som kan tecknas via LEASE", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.2); // under ankomstchansen
    const p = makeProperty({ tenant: null });
    let s = advanceMonth(makeState({ portfolio: [p] }));
    const prospects = s.portfolio[0].prospects;
    expect(prospects.length).toBeGreaterThan(0);

    s = reducer(s, { type: "LEASE", id: p.id, tenantId: prospects[0].id });
    expect(s.portfolio[0].tenant?.id).toBe(prospects[0].id);
    expect(s.portfolio[0].prospects).toHaveLength(0);
  });

  it("utgående kontrakt hamnar i inkorgen; förnyelse ger +2 % hyra", () => {
    const p = makeProperty({ tenant: makeTenantFixture({ monthsLeft: 1, rent: 10_000 }) });
    let s = advanceMonth(makeState({ portfolio: [p] }));
    const item = s.inbox.find((i) => i.payload.kind === "lease_renewal");
    expect(item).toBeDefined();
    expect(s.portfolio[0].tenant).not.toBeNull(); // betalar under betänketiden

    s = reducer(s, { type: "DECIDE", inboxId: item!.id, option: "index" });
    expect(s.inbox).toHaveLength(0);
    expect(s.portfolio[0].tenant?.rent).toBe(10_200);
    expect(s.portfolio[0].tenant?.monthsLeft).toBe(makeTenantFixture().termTotal);
  });

  it("uppsägning gör lokalen vakant", () => {
    const p = makeProperty({ tenant: makeTenantFixture({ monthsLeft: 1 }) });
    let s = advanceMonth(makeState({ portfolio: [p] }));
    const item = s.inbox[0];
    s = reducer(s, { type: "DECIDE", inboxId: item.id, option: "end" });
    expect(s.portfolio[0].tenant).toBeNull();
  });
});

describe("räntebindning", () => {
  it("BIND_LOAN flyttar skuld till fast ränta och påverkar räntekostnaden", () => {
    const s0 = makeState({ debt: 5_000_000, reputation: 50, interestRate: 4.0 });
    const s = reducer(s0, { type: "BIND_LOAN", amount: 2_000_000, months: 36 });
    expect(s.debt).toBe(3_000_000);
    expect(s.fixedLoans).toHaveLength(1);
    expect(s.fixedLoans[0].rate).toBeCloseTo(5.95, 2); // 5.65 + 0.3
    expect(totalDebtOf(s)).toBe(5_000_000);
    const expected = (3_000_000 * 0.0565 + 2_000_000 * 0.0595) / 12;
    expect(monthlyInterestOf(s)).toBeCloseTo(expected, 2);
  });

  it("utgången bindningstid flyttar tillbaka lånet till rörlig skuld", () => {
    const s0 = makeState({
      debt: 1_000_000,
      fixedLoans: [{ id: 1, amount: 2_000_000, rate: 6, monthsLeft: 1 }],
    });
    const s = advanceMonth(s0);
    expect(s.fixedLoans).toHaveLength(0);
    expect(s.debt).toBe(3_000_000);
  });
});

describe("underhållspolicy", () => {
  it("premium kostar mer i drift men sliter mindre", () => {
    const normal = makeProperty({ baseRent: 100_000 });
    const premium = makeProperty({ baseRent: 100_000, maintenance: "premium" });
    expect(propAnnualOpex(premium, makeState())).toBeCloseTo(
      propAnnualOpex(normal, makeState()) * 1.2,
      6,
    );
    const sN = advanceMonth(makeState({ portfolio: [normal] }));
    const sP = advanceMonth(makeState({ portfolio: [premium] }));
    expect(sP.portfolio[0].condition).toBeGreaterThan(sN.portfolio[0].condition);
  });
});

describe("auktioner", () => {
  it("spelaren vinner auktionen när tiden går ut med högsta bud", () => {
    const listing = makeProperty({
      id: 42,
      owned: false,
      askPrice: 10_000_000,
      auctionMonthsLeft: 1,
    });
    let s = makeState({ cash: 20_000_000, listings: [listing] });
    s = reducer(s, { type: "BID", id: 42 });
    expect(s.listings[0].bestBid?.isPlayer).toBe(true);

    s = advanceMonth(s);
    expect(s.portfolio).toHaveLength(1);
    expect(s.portfolio[0].purchasePrice).toBe(10_000_000);
    expect(s.cash).toBeCloseTo(20_000_000 - 10_000_000 * 0.3, 0); // handpenning vid LTV 70 %
  });

  it("konkurrent med högsta bud tar objektet vid avslut", () => {
    const rival = makeCompetitor({ name: "Nordhem Fastigheter" });
    const listing = makeProperty({
      id: 43,
      owned: false,
      askPrice: 8_000_000,
      auctionMonthsLeft: 1,
      bestBid: { bidder: "Nordhem Fastigheter", isPlayer: false, amount: 8_000_000 },
    });
    const s = advanceMonth(makeState({ listings: [listing], competitors: [rival] }));
    expect(s.competitors[0].holdings.some((h) => h.id === 43)).toBe(true);
  });

  it("BUY köper direkt till premie över utropspris", () => {
    const listing = makeProperty({
      id: 44,
      owned: false,
      askPrice: 10_000_000,
      auctionMonthsLeft: 4,
    });
    const s = reducer(makeState({ cash: 20_000_000, listings: [listing] }), {
      type: "BUY",
      id: 44,
    });
    expect(s.portfolio[0]?.purchasePrice).toBe(11_500_000);
  });
});

describe("planändring (detaljplan)", () => {
  const lot = {
    id: 9,
    district: "kulle", // detaljplan: endast bostad
    districtName: "Villakullen",
    parcelId: "kulle-4",
    area: 800,
    price: 3_000_000,
    owned: true,
  };

  it("BUILD stoppas av detaljplanen; REZONE öppnar typen efter handläggning", () => {
    let s = makeState({ cash: 30_000_000, lots: [lot], reputation: 50 });
    s = reducer(s, { type: "BUILD", id: 9, propType: "kontor" });
    expect(s.portfolio).toHaveLength(0); // blockerat

    s = reducer(s, { type: "REZONE", id: 9, propType: "kontor" });
    expect(s.cash).toBe(28_000_000);
    expect(s.lots[0].rezoning?.monthsLeft).toBe(6);

    for (let i = 0; i < 6; i++) s = advanceMonth(s);
    expect(s.lots[0]?.rezoning ?? null).toBeNull();
    expect(s.lots[0]?.extraTypes).toContain("kontor");

    s = reducer(s, { type: "BUILD", id: 9, propType: "kontor" });
    expect(s.portfolio).toHaveLength(1);
  });
});

describe("uppköp och vinst", () => {
  it("BID_HOLDING köper loss ett innehav när ägaren accepterar", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4); // < 0.5 ⇒ accept
    const rival = makeCompetitor({ name: "Kustlinjen AB", holdings: [HOLDING], units: 1 });
    const s = reducer(makeState({ cash: 50_000_000, competitors: [rival] }), {
      type: "BID_HOLDING",
      rival: "Kustlinjen AB",
      holdingId: 700,
    });
    expect(s.portfolio).toHaveLength(1);
    expect(s.competitors[0].holdings).toHaveLength(0);
  });

  it("ACQUIRE_RIVAL tar över alla innehav; sista uppköpet ger monopol-vinst", () => {
    const rival = makeCompetitor({
      name: "Kustlinjen AB",
      equity: 10_000_000,
      holdings: [HOLDING],
      units: 1,
    });
    const s = reducer(makeState({ cash: 50_000_000, competitors: [rival] }), {
      type: "ACQUIRE_RIVAL",
      name: "Kustlinjen AB",
    });
    expect(s.competitors).toHaveLength(0);
    expect(s.portfolio).toHaveLength(1);
    expect(s.gameWon).toBe(true);
  });

  it("börsnotering erbjuds vid tröskeln och ger vinst om den accepteras", () => {
    const big = makeProperty({ area: 10_000, condition: 100 }); // värde långt över IPO-tröskeln
    let s = advanceMonth(makeState({ portfolio: [big] }));
    expect(s.ipoOffered).toBe(true);
    const item = s.inbox.find((i) => i.payload.kind === "ipo") as InboxItem;
    expect(item).toBeDefined();

    s = reducer(s, { type: "DECIDE", inboxId: item.id, option: "ipo" });
    expect(s.gameWon).toBe(true);
    expect(IPO_EQUITY).toBeLessThanOrEqual(100_000_000);
  });
});

describe("valhändelser via inkorgen", () => {
  it("uppköpsbud: sälj överlåter fastigheten till konkurrenten", () => {
    const p = makeProperty({ id: 5, purchasePrice: 20_000_000 });
    const rival = makeCompetitor({ name: "Nordhem Fastigheter" });
    const item: InboxItem = {
      id: 999,
      title: "Bud",
      desc: "",
      monthsLeft: 2,
      options: [
        { id: "sell", label: "Sälj" },
        { id: "decline", label: "Neka" },
      ],
      defaultOption: "decline",
      payload: {
        kind: "buyout_offer",
        propertyId: 5,
        rival: "Nordhem Fastigheter",
        amount: 45_000_000,
      },
    };
    let s = makeState({ cash: 0, portfolio: [p], competitors: [rival], inbox: [item] });
    s = reducer(s, { type: "DECIDE", inboxId: 999, option: "sell" });
    expect(s.portfolio).toHaveLength(0);
    expect(s.cash).toBe(45_000_000);
    expect(s.competitors[0].holdings.some((h) => h.parcelId === p.parcelId)).toBe(true);
  });

  it("förfallna beslut löses automatiskt med defaultOption", () => {
    const p = makeProperty({ id: 5 });
    const item: InboxItem = {
      id: 998,
      title: "Bud",
      desc: "",
      monthsLeft: 1,
      options: [
        { id: "sell", label: "Sälj" },
        { id: "decline", label: "Neka" },
      ],
      defaultOption: "decline",
      payload: { kind: "buyout_offer", propertyId: 5, rival: "X", amount: 1 },
    };
    const s = advanceMonth(makeState({ portfolio: [p], inbox: [item] }));
    expect(s.inbox).toHaveLength(0);
    expect(s.portfolio).toHaveLength(1); // neka = behåll
  });
});
