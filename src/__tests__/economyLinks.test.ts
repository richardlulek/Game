/* Tester för att ekonomins delar talar med varandra:
   läge ↔ värde/hyra, förhandlingar ↔ batch-åtgärder, pool ↔ marknad,
   konjunktur ↔ börs/rivaler, nybygge ↔ kapacitet/energiklass. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parcelsIn } from "../engine/city";
import { builtYearFor, calcCapacity, energyClassFor, genListing } from "../engine/generators";
import { propMarketValue, propPotentialRent } from "../engine/property";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import { stepSentiment } from "../engine/stocks";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("lägesfaktor i ekonomin", () => {
  it("central tomt ger högre värde och hyra än utkantstomt", () => {
    const central = parcelsIn("centrum")
      .reduce((a, b) => (Math.hypot(a.x, a.z) < Math.hypot(b.x, b.z) ? a : b));
    const perifer = parcelsIn("hamnen")
      .reduce((a, b) => (Math.hypot(a.x, a.z) > Math.hypot(b.x, b.z) ? a : b));
    const s = makeState();
    const base = makeProperty({ tenants: [makeTenantFixture()] });
    const inCity = { ...base, parcelId: central.id };
    const onEdge = { ...base, parcelId: perifer.id };
    expect(propMarketValue(inCity, s)).toBeGreaterThan(propMarketValue(onEdge, s));
    expect(propPotentialRent(inCity, s)).toBeGreaterThan(propPotentialRent(onEdge, s));
  });

  it("fastighet utan tomtruta värderas neutralt (faktor 1)", () => {
    const s = makeState();
    const p = makeProperty({});
    expect(propMarketValue(p, s)).toBe(propMarketValue({ ...p, parcelId: undefined }, s));
  });
});

describe("pendingRenewals hålls i synk", () => {
  const renewal = {
    propertyId: 1,
    tenantId: 100,
    tenantName: "Mindre företag",
    districtName: "Centrum",
    currentRent: 10_000,
    termTotal: 24,
  };

  it("RENEW_ALL rensar förhandlingen för förnyade kontrakt", () => {
    const t = makeTenantFixture({ id: 100, monthsLeft: 1 });
    const p = makeProperty({ id: 1, tenants: [t] });
    const s = reducer(makeState({ portfolio: [p], pendingRenewals: [renewal] }), {
      type: "RENEW_ALL",
      monthsLeft: 3,
    });
    expect(s.pendingRenewals).toHaveLength(0);
    expect(s.portfolio[0].tenants[0].monthsLeft).toBe(24);
  });

  it("EVICT rensar förhandlingen för den uppsagda", () => {
    const t = makeTenantFixture({ id: 100, monthsLeft: 1 });
    const p = makeProperty({ id: 1, tenants: [t] });
    const s = reducer(makeState({ portfolio: [p], pendingRenewals: [renewal] }), {
      type: "EVICT",
      id: 1,
      tenantId: 100,
    });
    expect(s.pendingRenewals).toHaveLength(0);
  });

  it("SELL rensar alla förhandlingar för fastigheten", () => {
    const t = makeTenantFixture({ id: 100, monthsLeft: 1 });
    const p = makeProperty({ id: 1, tenants: [t] });
    const s = reducer(makeState({ portfolio: [p], pendingRenewals: [renewal] }), {
      type: "SELL",
      id: 1,
    });
    expect(s.pendingRenewals).toHaveLength(0);
  });

  it("månadsstädningen tar bort inaktuella ärenden men behåller aktiva", () => {
    // 2 → 1 under månaden: ärendet är fortfarande öppet efter ticken.
    const waiting = makeTenantFixture({ id: 100, monthsLeft: 2 });
    const renewed = makeTenantFixture({ id: 101, monthsLeft: 24 });
    const p = makeProperty({ id: 1, capacity: 2, tenants: [waiting, renewed] });
    const stale = { ...renewal, tenantId: 101 }; // förnyad – ska städas
    const gone = { ...renewal, propertyId: 99 }; // såld fastighet – ska städas
    const s = advanceMonth(
      makeState({ portfolio: [p], pendingRenewals: [renewal, stale, gone] }),
    );
    expect(s.pendingRenewals?.map((r) => r.tenantId)).toEqual([100]);
  });
});

describe("världspoolens priser", () => {
  it("utgången listing återgår med ursprungspris – inget ackumulerat påslag", () => {
    const listed = makeProperty({
      id: 7,
      owned: false,
      askPrice: 1_200_000,
      baseRent: 120_000,
      poolAskPrice: 1_000_000,
      poolBaseRent: 100_000,
      parcelId: "centrum-0",
      listedMonth: 10,
      expiresMonth: 13,
      tenants: [],
    });
    // Fyll marknaden så att poolen inte återavslöjas direkt samma månad.
    const fillers = Array.from({ length: 12 }, (_, i) =>
      makeProperty({ id: 100 + i, owned: false, expiresMonth: 99 }),
    );
    const s = advanceMonth(
      makeState({ year: 1, month: 1, listings: [listed, ...fillers], marketMod: 1.2 }),
    );
    const pooled = (s.worldPool ?? []).find((p) => p.id === 7);
    expect(pooled).toBeDefined();
    expect(pooled!.askPrice).toBe(1_000_000);
    expect(pooled!.baseRent).toBe(100_000);
    expect(pooled!.parcelId).toBeUndefined();
    expect(pooled!.poolAskPrice).toBeUndefined();
  });

  it("avslöjande ur poolen sparar snapshot för återställning", () => {
    const pool = makeProperty({ id: 8, owned: false, askPrice: 1_000_000, baseRent: 100_000 });
    const s = advanceMonth(makeState({ worldPool: [pool], marketMod: 1.5 }));
    const listing = s.listings.find((p) => p.id === 8);
    expect(listing).toBeDefined();
    expect(listing!.askPrice).toBe(1_500_000);
    expect(listing!.poolAskPrice).toBe(1_000_000);
  });
});

describe("köp och budgivning", () => {
  it("BUY avslutar en pågående budgivning om samma objekt", () => {
    const listing = makeProperty({ id: 5, owned: false, askPrice: 1_000_000 });
    const s = reducer(
      makeState({
        cash: 10_000_000,
        listings: [listing],
        competingBid: { listingId: 5, rivalName: "Rival AB", amount: 1_100_000, expiresAbs: 99 },
      }),
      { type: "BUY", id: 5 },
    );
    expect(s.portfolio).toHaveLength(1);
    expect(s.competingBid).toBeUndefined();
  });

  it("ACCEPT_OFFER flyttar fastigheten till världspoolen istället för att radera den", () => {
    const p = makeProperty({ id: 3, parcelId: "centrum-1" });
    const s = reducer(
      makeState({
        portfolio: [p],
        offers: [
          {
            id: 1,
            kind: "buyout",
            propId: 3,
            propLabel: "Bostadshus",
            districtName: "Centrum",
            from: "Rival AB",
            amount: 2_000_000,
            expiresIn: 3,
          },
        ],
      }),
      { type: "ACCEPT_OFFER", offerId: 1 },
    );
    expect(s.portfolio).toHaveLength(0);
    const pooled = (s.worldPool ?? []).find((x) => x.id === 3);
    expect(pooled).toBeDefined();
    expect(pooled!.owned).toBe(false);
    expect(pooled!.parcelId).toBeUndefined();
    expect(pooled!.askPrice).toBe(2_000_000);
  });
});

describe("nyproduktion och generatorer", () => {
  it("BUILD ger kapacitet efter yta, energiklass A och byggår", () => {
    const s0 = makeState({
      cash: 50_000_000,
      year: 4,
      lots: [
        {
          id: 11,
          district: "centrum",
          districtName: "Centrum",
          area: 3500,
          price: 1_000_000,
          owned: true,
        },
      ],
    });
    const s = reducer(s0, { type: "BUILD", id: 11, propType: "kontor" });
    const built = s.portfolio[0];
    expect(built.capacity).toBe(calcCapacity(3500)); // 4, inte hårdkodad 1
    expect(built.capacity).toBe(4);
    expect(built.energyClass).toBe("A");
    expect(built.builtYear).toBe(4);
  });

  it("genListing sätter energiklass och byggår", () => {
    const p = genListing(makeState());
    expect(p.energyClass).toBeDefined();
    expect(p.builtYear).toBeDefined();
    expect(energyClassFor(100)).toBe("A");
    expect(energyClassFor(10)).toBe("F");
    expect(builtYearFor(100, 5)).toBe(5);
    expect(builtYearFor(30, 5)).toBeLessThan(5);
  });
});

describe("konjunktur talar med börs och rivaler", () => {
  it("stepSentiment driver uppåt i boom och nedåt i bust", () => {
    // Math.random = 0.5 ⇒ bruset blir 0, kvar är drift + medelåtergång.
    expect(stepSentiment(1, "boom")).toBeGreaterThan(stepSentiment(1, "stable"));
    expect(stepSentiment(1, "bust")).toBeLessThan(stepSentiment(1, "stable"));
  });

  it("rivalers eget kapital följer marknadsvärderingen", () => {
    const prop = makeProperty({ id: 40, owned: false, askPrice: 1_000_000 });
    const mk = (marketMod: number) =>
      advanceMonth(
        makeState({
          marketMod,
          marketCycle: { phase: "stable", monthsRemaining: 12 },
          competitors: [
            { name: "Rival AB", cash: 1_000_000, units: 1, equity: 0, portfolio: [{ ...prop }] },
          ],
        }),
      );
    const boomEq = mk(1.4).competitors[0].equity;
    const bustEq = mk(0.8).competitors[0].equity;
    expect(boomEq).toBeGreaterThan(bustEq);
  });
});
