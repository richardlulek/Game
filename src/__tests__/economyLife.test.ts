/* Tester för den levande ekonomin: Riksbanken, flyttkedjor,
   rivalbyggen, grannskapseffekter, budkrig/motbud, hyresgästernas
   livscykel, kommunala infraprojekt och att synliga hus aldrig
   försvinner från kartan. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blockConditionMult } from "../engine/blocks";
import { parcelsIn } from "../engine/city";
import { movePressure, rateValueFactor } from "../engine/economyLife";
import { propMarketValue } from "../engine/property";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { Competitor } from "../engine/types";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const rival = (over: Partial<Competitor> = {}): Competitor => ({
  name: "Kustlinjen AB",
  cash: 20_000_000,
  units: 0,
  equity: 50_000_000,
  portfolio: [],
  ...over,
});

describe("1. Riksbanken", () => {
  it("kvartalsbesked: räntan stegar 25 punkter mot cykelmålet", () => {
    const s0 = makeState({ month: 1, marketCycle: { phase: "stable", monthsRemaining: 10 } });
    const s1 = advanceMonth(s0); // month 1 % 3 === 1 → besked (mål 3,25 vid stabilt)
    expect(s1.interestRate).toBe(3.75);
    expect(s1.log.some((l) => l.t.includes("Riksbanken sänker"))).toBe(true);
  });

  it("räntan andas i värdena: låg ränta lyfter, hög trycker", () => {
    const p = makeProperty({});
    const low = propMarketValue(p, makeState({ interestRate: 2.5 }));
    const high = propMarketValue(p, makeState({ interestRate: 5.5 }));
    expect(low).toBeGreaterThan(high);
    expect(rateValueFactor(4)).toBe(1); // neutralränta
  });
});

describe("2. Flyttkedjor", () => {
  it("löst vakansläge gör det lättare att flytta, tight håller kvar", () => {
    expect(movePressure(0.2)).toBeGreaterThan(1);
    expect(movePressure(0.01)).toBeLessThan(1);
    expect(movePressure(0.06)).toBe(1);
  });
});

describe("3. Rivalerna bygger", () => {
  it("rivalens bygge tickar och färdigställs", () => {
    const bygge = makeProperty({ id: 77, status: "bygger", buildLeft: 1 });
    const s1 = advanceMonth(makeState({ competitors: [rival({ portfolio: [bygge] })] }));
    expect(s1.competitors[0].portfolio[0].status).toBe("klar");
    expect(s1.log.some((l) => l.t.includes("färdigställde sitt nybygge"))).toBe(true);
  });
});

describe("4. Grannskapseffekter", () => {
  // Två tomter i samma centrumkvarter.
  const block = (() => {
    const byBlock = new Map<string, string[]>();
    for (const p of parcelsIn("centrum")) {
      byBlock.set(p.blockId, [...(byBlock.get(p.blockId) ?? []), p.id]);
    }
    return [...byBlock.values()].find((ids) => ids.length >= 2)!;
  })();

  it("förfallna grannar drar ner värdet, fina lyfter det", () => {
    const mine = makeProperty({ id: 1, condition: 90, parcelId: block[0] });
    const worn = makeState({
      portfolio: [mine],
      listings: [makeProperty({ id: 2, condition: 15, parcelId: block[1], owned: false })],
    });
    const fine = makeState({
      portfolio: [mine],
      listings: [makeProperty({ id: 2, condition: 95, parcelId: block[1], owned: false })],
    });
    expect(blockConditionMult(mine, worn)).toBeLessThan(1);
    expect(blockConditionMult(mine, fine)).toBeGreaterThan(1);
    expect(propMarketValue(mine, worn)).toBeLessThan(propMarketValue(mine, fine));
  });
});

describe("5. Budkrig och motbud", () => {
  const offered = () =>
    makeState({
      cash: 0,
      portfolio: [makeProperty({ id: 1, condition: 95, tenants: [makeTenantFixture({ id: 1 }), makeTenantFixture({ id: 2 })] })],
      competitors: [rival()],
      offers: [{ id: 1, kind: "listing" as const, propId: 1, propLabel: "Bostadshus", districtName: "Centrum", from: "Kustlinjen AB", amount: 10_000_000, expiresIn: 3 }],
    });

  it("rimligt motbud accepteras och affären genomförs till det högre priset", () => {
    const s1 = reducer(offered(), { type: "COUNTER_OFFER", offerId: 1, amount: 10_500_000 });
    expect(s1.portfolio).toHaveLength(0);
    expect(s1.cash).toBe(10_500_000);
    expect(s1.log.some((l) => l.t.includes("gick med på ditt motbud"))).toBe(true);
  });

  it("girigt motbud får köparen att dra sig ur", () => {
    const s1 = reducer(offered(), { type: "COUNTER_OFFER", offerId: 1, amount: 15_000_000 });
    expect(s1.portfolio).toHaveLength(1);
    expect(s1.offers).toHaveLength(0);
    expect(s1.log.some((l) => l.t.includes("drog sig ur"))).toBe(true);
  });
});

describe("6. Hyresgästernas livscykel", () => {
  const withTenant = (phase: "boom" | "bust") =>
    makeState({
      marketCycle: { phase, monthsRemaining: 8 },
      portfolio: [
        makeProperty({
          id: 1,
          type: "kontor",
          typeLabel: "Kontor",
          tenants: [makeTenantFixture({ defaultRisk: 0.4, monthsLeft: 24 })],
        }),
      ],
    });

  it("konkursrisken stiger i lågkonjunktur och sjunker i boom", () => {
    // 0,4 × 1,6 = 0,64 > 0,5 → konkurs i bust; 0,4 × 0,6 = 0,24 → kvar i boom.
    expect(advanceMonth(withTenant("bust")).portfolio[0].tenants).toHaveLength(0);
    expect(advanceMonth(withTenant("boom")).portfolio[0].tenants).toHaveLength(1);
  });
});

describe("7. Kommunala infraprojekt", () => {
  it("invigning lyfter distriktets områdesutveckling permanent", () => {
    const s0 = makeState({
      infraProjects: [{ id: 1, name: "Spårvägslinje", district: "hamnen", districtName: "Hamnen", monthsLeft: 1, totalMonths: 24, boost: 0.1 }],
    });
    const s1 = advanceMonth(s0);
    // Andra system knuffar districtDev marginellt – boosten ska synas tydligt.
    expect(s1.districtDev?.["hamnen"]).toBeGreaterThanOrEqual(1.1);
    expect(s1.infraProjects).toHaveLength(0);
    expect(s1.log.some((l) => l.t.includes("INVIGT"))).toBe(true);
  });
});

describe("synliga hus försvinner aldrig från kartan", () => {
  it("utgången annons plockas upp av ett stadsbolag med tomtrutan kvar", () => {
    const listed = makeProperty({ id: 5, owned: false, parcelId: "centrum-x", listedMonth: 10, expiresMonth: 11 });
    const s1 = advanceMonth(makeState({ listings: [listed], competitors: [rival()] }));
    // Nya annonser kan ha tillkommit under månaden – den utgångna ska vara borta.
    expect(s1.listings.find((p) => p.id === 5)).toBeUndefined();
    const hosRival = s1.competitors[0].portfolio.find((p) => p.id === 5);
    expect(hosRival).toBeDefined();
    expect(hosRival!.parcelId).toBe("centrum-x");
    expect((s1.worldPool ?? []).find((p) => p.id === 5)).toBeUndefined();
    expect(s1.log.some((l) => l.t.includes("plockade upp"))).toBe(true);
  });
});

/* ── Stadshändelser ─────────────────────────────────────────────────── */

describe("stadshändelser", () => {
  it("elpriskaoset lyfter energiintäkter och fastigheters driftkostnad", async () => {
    const { energyMonthlyRevenue } = await import("../engine/industries");
    const { propAnnualOpex } = await import("../engine/property");
    const { makeIndustryAsset, makeProperty, makeState } = await import("./factories");
    const park = makeIndustryAsset({
      sector: "energi", hotelMeta: null,
      energyMeta: { subType: "vind", installedMW: 15, capacityFactor: 0.28, ppaContracts: [], degradationPct: 0, subsidyActive: true, commissionedAbs: 0 },
    });
    const hus = makeProperty({ baseRent: 2_000_000 });
    const lugnt = makeState({ month: 4 });
    const kaos = makeState({ month: 4, cityEvent: { id: "elkris", name: "Elpriskaoset", monthsLeft: 2 } });
    expect(energyMonthlyRevenue(park, kaos)).toBeGreaterThan(energyMonthlyRevenue(park, lugnt));
    expect(propAnnualOpex(hus, kaos)).toBeGreaterThan(propAnnualOpex(hus, lugnt));
  });

  it("hamnstrejken halverar terminalgodset, mässan fyller hotellen", async () => {
    const { hotelMonthlyRevenue, logisticsMonthlyRevenue } = await import("../engine/industries");
    const { makeIndustryAsset, makeState } = await import("./factories");
    const hotel = makeIndustryAsset({});
    const terminal = makeIndustryAsset({
      sector: "logistik", hotelMeta: null,
      logisticsMeta: { totalBays: 16, automationLevel: 0, peakSurchargeActive: false,
        throughputContracts: [{ id: 1, clientName: "K", clientProfile: "3pl", guaranteedM3: 10_000, ratePerM3: 30, monthsLeft: 24, termTotal: 24, penaltyRisk: 0, defaultRisk: 0 }] },
    });
    const lugnt = makeState({ month: 4 });
    expect(hotelMonthlyRevenue(hotel, makeState({ month: 4, cityEvent: { id: "massa", name: "Stadsmässan", monthsLeft: 1 } })))
      .toBeGreaterThan(hotelMonthlyRevenue(hotel, lugnt));
    expect(logisticsMonthlyRevenue(terminal, makeState({ month: 4, cityEvent: { id: "hamnstrejk", name: "Hamnstrejken", monthsLeft: 2 } })))
      .toBeLessThan(logisticsMonthlyRevenue(terminal, lugnt));
  });

  it("tickCityEvent lottar fram, räknar ner och avslutar händelser", async () => {
    const { tickCityEvent } = await import("../engine/cityEvents");
    const { makeState } = await import("./factories");
    const events: { t: string; kind: string }[] = [];
    const s = makeState({ month: 4 });
    tickCityEvent(s, events as never, () => 0.01); // låg roll: händelse startar
    expect(s.cityEvent).toBeDefined();
    const months = s.cityEvent!.monthsLeft;
    for (let i = 0; i < months; i++) tickCityEvent(s, events as never, () => 0.99);
    expect(s.cityEvent).toBeUndefined();
    expect(events.some((e) => e.t.includes("!") || e.t.length > 0)).toBe(true);
  });
});
