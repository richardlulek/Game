/* Enhetstester för industrisektorer – hotell, energi, logistik. */

import { describe, expect, it, vi } from "vitest";
import {
  energyMonthlyRevenue,
  energySynergyMult,
  hotelMonthlyOpex,
  hotelMonthlyRevenue,
  hotelMarketValue,
  logisticsMonthlyRevenue,
  logisticsMarketValue,
  industryAssetValue,
} from "../engine/industries";
import { propAnnualOpex } from "../engine/property";
import { makeIndustryAsset, makeProperty, makeState } from "./factories";
import type { IndustryAsset } from "../engine/types";

// ── Hotell ──────────────────────────────────────────────────────────────────

describe("hotell", () => {
  it("genererar RevPAR-intäkt för 3-stjärnigt hotell (högsäsong)", () => {
    const state = makeState({ month: 7 }); // sommar
    const asset = makeIndustryAsset({
      hotelMeta: { starRating: 3, totalRooms: 80, baseAdr: 1_200, bookingChannels: ["direktbokning"], reputationScore: 60, revParHistory: [] },
    });
    const rev = hotelMonthlyRevenue(asset, state);
    // ADR ≈ 1200 × 1.5 (star3) × 1.22 (sommar) × 1.0 (kondition) ≈ 2196
    // OCC ≈ min(0.98, (0.57 + 0.02) × 1.0 × 1.22) ≈ 0.72
    // RevPAR ≈ 2196 × 0.72 = 1581, × 80 rum × 30.5 ≈ 3 858 000
    expect(rev).toBeGreaterThan(1_000_000);
    expect(rev).toBeLessThan(8_000_000);
  });

  it("OTA-kanal höjer OCC men sänker ADR", () => {
    const state = makeState({ month: 3 });
    const assetDirect = makeIndustryAsset({
      hotelMeta: { starRating: 3, totalRooms: 80, baseAdr: 1_200, bookingChannels: ["direktbokning"], reputationScore: 60, revParHistory: [] },
    });
    const assetOta = makeIndustryAsset({
      hotelMeta: { starRating: 3, totalRooms: 80, baseAdr: 1_200, bookingChannels: ["direktbokning", "ota"], reputationScore: 60, revParHistory: [] },
    });
    // OTA ökar OCC (+0.04) men sänker ADR (×0.88) — nettot är mer komplext
    // Säkerställ att intäkterna faktiskt skiljer sig
    const revDirect = hotelMonthlyRevenue(assetDirect, state);
    const revOta = hotelMonthlyRevenue(assetOta, state);
    expect(typeof revDirect).toBe("number");
    expect(typeof revOta).toBe("number");
    expect(revOta).not.toEqual(revDirect);
  });

  it("dåligt skick sänker intäkterna", () => {
    const state = makeState({ month: 3 });
    const goodAsset = makeIndustryAsset({ condition: 100 });
    const badAsset  = makeIndustryAsset({ condition: 20 });
    expect(hotelMonthlyRevenue(goodAsset, state)).toBeGreaterThan(hotelMonthlyRevenue(badAsset, state));
  });

  it("cap-rate-värdering: 3-stjärna ger kapitalvärde baserat på NOI/6.5 %", () => {
    const state = makeState({ month: 3 });
    const asset = makeIndustryAsset({ condition: 80 });
    const rev  = hotelMonthlyRevenue(asset, state);
    const opex = hotelMonthlyOpex(asset, state);
    const annualNOI = (rev - opex) * 12;
    const expectedValue = Math.round(annualNOI / 0.065);
    const actualValue = hotelMarketValue(asset, state);
    // Bör ligga inom ±5 % av förväntat cap-rate-värde
    expect(Math.abs(actualValue - expectedValue) / expectedValue).toBeLessThan(0.05);
  });

  it("bygger-status ger halva inköpspriset i värdering", () => {
    const state = makeState({ month: 3 });
    const asset = makeIndustryAsset({ status: "bygger", buildLeft: 6, purchasePrice: 10_000_000 });
    expect(hotelMarketValue(asset, state)).toBe(5_000_000);
  });
});

// ── Förnybar energi ────────────────────────────────────────────────────────

describe("energi", () => {
  function makeSolarAsset(overMeta: Partial<IndustryAsset["energyMeta"]> = {}): IndustryAsset {
    return makeIndustryAsset({
      sector: "energi",
      hotelMeta: null,
      energyMeta: {
        subType: "sol",
        installedMW: 10,
        capacityFactor: 0.13,
        ppaContracts: [],
        degradationPct: 0,
        subsidyActive: false,
        ...overMeta,
      },
      logisticsMeta: null,
    });
  }

  it("genererar spot-intäkt (vintermånad, högt pris)", () => {
    const state = makeState({ month: 1 }); // vinter
    const asset = makeSolarAsset();
    const rev = energyMonthlyRevenue(asset, state);
    // MWh ≈ 10 × 0.13 × 730 = 949 MWh
    // Spot ≈ 650 × 1.0 × 1.35 = 878 kr/MWh
    // Rev ≈ 949 × 878 ≈ 833 000 kr
    expect(rev).toBeGreaterThan(300_000);
    expect(rev).toBeLessThan(2_000_000);
  });

  it("PPA-kontrakt ger garanterad intäkt utöver spot", () => {
    const state = makeState({ month: 3 });
    const assetNoПPA = makeSolarAsset({ ppaContracts: [] });
    const ppaContract = { id: 1, clientName: "Kommunen", mwh: 200, pricePerMwh: 720, monthsLeft: 36, termTotal: 36, defaultRisk: 0.001 };
    const assetWithPPA = makeSolarAsset({ ppaContracts: [ppaContract] });
    const revNoPPA = energyMonthlyRevenue(assetNoПPA, state);
    const revWithPPA = energyMonthlyRevenue(assetWithPPA, state);
    // PPA-pris 720 kr/MWh > spot 650 kr/MWh → totalen ökar
    expect(revWithPPA).toBeGreaterThan(revNoPPA);
  });

  it("elcertifikat (subsidyActive) ökar intäkten", () => {
    const state = makeState({ month: 3 });
    const assetNoSub = makeSolarAsset({ subsidyActive: false });
    const assetSub   = makeSolarAsset({ subsidyActive: true });
    expect(energyMonthlyRevenue(assetSub, state)).toBeGreaterThan(energyMonthlyRevenue(assetNoSub, state));
  });
});

// ── Energisynergi ──────────────────────────────────────────────────────────

describe("energySynergyMult", () => {
  it("0 MW → faktor 1.0 (ingen rabatt)", () => {
    const state = makeState({ energyOwnedMW: 0 });
    expect(energySynergyMult(state)).toBe(1.0);
  });

  it("20 MW → faktor 0.90 (−10 % opex)", () => {
    const state = makeState({ energyOwnedMW: 20 });
    expect(energySynergyMult(state)).toBeCloseTo(0.90, 5);
  });

  it("30 MW → faktor 0.85 (tak på −15 %)", () => {
    const state = makeState({ energyOwnedMW: 30 });
    expect(energySynergyMult(state)).toBe(0.85);
  });

  it("100 MW → faktor 0.85 (tak kvarstår)", () => {
    const state = makeState({ energyOwnedMW: 100 });
    expect(energySynergyMult(state)).toBe(0.85);
  });

  it("energisynergi reducerar propAnnualOpex för fastigheter", () => {
    const stateNoEnergy = makeState({ energyOwnedMW: 0 });
    const stateWith20MW = makeState({ energyOwnedMW: 20 });
    const p = makeProperty({ baseRent: 100_000 });
    const opexNoEnergy = propAnnualOpex(p, stateNoEnergy);
    const opexWithEnergy = propAnnualOpex(p, stateWith20MW);
    expect(opexWithEnergy).toBeCloseTo(opexNoEnergy * 0.90, -2);
  });
});

// ── Logistik ───────────────────────────────────────────────────────────────

describe("logistik", () => {
  function makeLogisticsAsset(overMeta: Partial<IndustryAsset["logisticsMeta"]> = {}): IndustryAsset {
    return makeIndustryAsset({
      sector: "logistik",
      hotelMeta: null,
      energyMeta: null,
      logisticsMeta: {
        totalBays: 20,
        automationLevel: 0,
        throughputContracts: [],
        peakSurchargeActive: false,
        ...overMeta,
      },
    });
  }

  it("inga kontrakt → noll intäkt", () => {
    const state = makeState({ month: 3 });
    const asset = makeLogisticsAsset({ throughputContracts: [] });
    expect(logisticsMonthlyRevenue(asset, state)).toBe(0);
  });

  it("enkelt kontrakt genererar korrekt intäkt (Q3, inget Q4-tillägg)", () => {
    const state = makeState({ month: 7 });
    const contract = { id: 1, clientName: "E-handel AB", clientProfile: "ehandel" as const, guaranteedM3: 1000, ratePerM3: 180, monthsLeft: 24, termTotal: 24, penaltyRisk: 0.05, defaultRisk: 0.025 };
    const asset = makeLogisticsAsset({ throughputContracts: [contract] });
    const rev = logisticsMonthlyRevenue(asset, state);
    expect(rev).toBeCloseTo(1000 * 180, -1); // 180 000 kr
  });

  it("Q4-topptillägg (+28 %) aktiveras för e-handelsaktör i oktober", () => {
    const stateQ3 = makeState({ month: 7 });
    const stateQ4 = makeState({ month: 10 });
    const contract = { id: 1, clientName: "E-handel AB", clientProfile: "ehandel" as const, guaranteedM3: 1000, ratePerM3: 180, monthsLeft: 24, termTotal: 24, penaltyRisk: 0, defaultRisk: 0 };
    const asset = makeLogisticsAsset({ throughputContracts: [contract], peakSurchargeActive: true });
    const revQ3 = logisticsMonthlyRevenue(asset, stateQ3);
    const revQ4 = logisticsMonthlyRevenue({ ...asset, logisticsMeta: { ...asset.logisticsMeta!, peakSurchargeActive: true } }, stateQ4);
    expect(revQ4).toBeCloseTo(revQ3 * 1.28, -2);
  });

  it("automation nivå 2 ger 18 % högre throughput", () => {
    const state = makeState({ month: 3 });
    const contract = { id: 1, clientName: "Test", clientProfile: "industri_kund" as const, guaranteedM3: 1000, ratePerM3: 160, monthsLeft: 12, termTotal: 12, penaltyRisk: 0, defaultRisk: 0 };
    const assetAuto0 = makeLogisticsAsset({ throughputContracts: [contract], automationLevel: 0 });
    const assetAuto2 = makeLogisticsAsset({ throughputContracts: [contract], automationLevel: 2 });
    const rev0 = logisticsMonthlyRevenue(assetAuto0, state);
    const rev2 = logisticsMonthlyRevenue(assetAuto2, state);
    expect(rev2).toBeCloseTo(rev0 * 1.18, -1);
  });

  it("cap-rate värdering är proportionell mot NOI", () => {
    const state = makeState({ month: 3 });
    const contract = { id: 1, clientName: "Test", clientProfile: "industri_kund" as const, guaranteedM3: 2000, ratePerM3: 160, monthsLeft: 36, termTotal: 36, penaltyRisk: 0, defaultRisk: 0 };
    const asset = makeLogisticsAsset({ throughputContracts: [contract] });
    const value = logisticsMarketValue(asset, state);
    expect(value).toBeGreaterThan(1_000_000);
  });
});

// ── industryAssetValue dispatcher ─────────────────────────────────────────

describe("industryAssetValue", () => {
  it("delegerar till hotelMarketValue för hotell", () => {
    const state = makeState({ month: 3 });
    const asset = makeIndustryAsset({ sector: "hotell" });
    const val = industryAssetValue(asset, state);
    expect(val).toBeGreaterThan(0);
  });

  it("delegerar till energyMarketValue för energi", () => {
    const state = makeState({ month: 3 });
    const asset = makeIndustryAsset({
      sector: "energi",
      hotelMeta: null,
      energyMeta: { subType: "sol", installedMW: 10, capacityFactor: 0.13, ppaContracts: [], degradationPct: 0, subsidyActive: false },
      logisticsMeta: null,
    });
    // 10 MW × 8 000 000 = 80 000 000
    const val = industryAssetValue(asset, state);
    expect(val).toBeGreaterThan(0);
    expect(val).toBeLessThanOrEqual(10 * 8_000_000 * 1.2);
  });
});

/* ── Balansrevision: priser hänger ihop med intäktsmodellen ────────── */

describe("industripriser är kapitaliserat driftnetto", () => {
  it("hotell och energi till salu avkastar aldrig mer än ~12 %/år på priset", async () => {
    const { initState } = await import("../engine/initState");
    const { industryMonthlyRevenue, industryMonthlyOpex } = await import("../engine/industries");
    for (let i = 0; i < 6; i++) {
      const s = initState();
      for (const a of s.industryListings ?? []) {
        if (a.sector === "logistik") continue; // tom terminal – kontrakten är uppsidan
        const noi = (industryMonthlyRevenue(a, s) - industryMonthlyOpex(a, s)) * 12;
        expect(noi / a.purchasePrice).toBeLessThan(0.12);
      }
    }
  });

  it("köp + direktförsäljning av industri är aldrig lönsamt", async () => {
    const { initState } = await import("../engine/initState");
    const { reducer } = await import("../engine/reducer");
    const { equityOf } = await import("../engine/finance");
    const s0 = initState();
    const rich = { ...s0, cash: 5_000_000_000 };
    for (const a of rich.industryListings ?? []) {
      const before = equityOf(rich);
      let s = reducer(rich, { type: "BUY_INDUSTRY", id: a.id });
      s = reducer(s, { type: "SELL_INDUSTRY", id: a.id });
      expect(equityOf(s)).toBeLessThanOrEqual(before);
    }
  });
});

/* ── Symbios: industrierna och fastighetsbeståndet är EN ekonomi ───── */

describe("symbios stad ↔ industri", () => {
  it("hotell i distriktet lyfter butikshyran (turistflöden)", async () => {
    const { propPotentialRent } = await import("../engine/property");
    const butik = makeProperty({ type: "butik", district: "centrum", baseRent: 1_200_000 });
    const utan = makeState({ portfolio: [butik] });
    const med = makeState({
      portfolio: [butik],
      industryPortfolio: [makeIndustryAsset({ district: "centrum" })], // 3★
    });
    const lyft = propPotentialRent(butik, med) / propPotentialRent(butik, utan);
    expect(lyft).toBeCloseTo(1.03, 2); // +1 %/stjärna
    // …men bara för butiker i samma distrikt.
    const bostad = makeProperty({ type: "bostad", district: "centrum", baseRent: 1_200_000 });
    expect(propPotentialRent(bostad, med)).toBe(propPotentialRent(bostad, utan));
  });

  it("områdesutveckling lyfter hotellets beläggning och intäkt", () => {
    const hotel = makeIndustryAsset({ district: "centrum" });
    const lugnt = makeState({ districtDev: { centrum: 1 } });
    const hett = makeState({ districtDev: { centrum: 1.4 } });
    expect(hotelMonthlyRevenue(hotel, hett)).toBeGreaterThan(hotelMonthlyRevenue(hotel, lugnt));
  });

  it("stadens industristock ger terminalerna mer gods", () => {
    const terminal = makeIndustryAsset({
      sector: "logistik",
      hotelMeta: null,
      logisticsMeta: {
        totalBays: 16, automationLevel: 0, peakSurchargeActive: false,
        throughputContracts: [{ id: 1, clientName: "Test 3PL", clientProfile: "3pl", guaranteedM3: 10_000, ratePerM3: 30, monthsLeft: 24, termTotal: 24, penaltyRisk: 0, defaultRisk: 0 }],
      },
    });
    const tomStad = makeState({ month: 3 });
    const industristad = makeState({
      month: 3,
      portfolio: Array.from({ length: 10 }, (_, i) => makeProperty({ id: 500 + i, type: "industri" })),
    });
    expect(logisticsMonthlyRevenue(terminal, industristad)).toBeGreaterThan(
      logisticsMonthlyRevenue(terminal, tomStad),
    );
  });

  it("egen förnybar el förbättrar ESG-betyget (gröna lån för koncernen)", async () => {
    const { esgRatingOf } = await import("../engine/esg");
    const props = [makeProperty({ energyClass: "C" })];
    const utan = esgRatingOf(makeState({ portfolio: props, energyOwnedMW: 0 }));
    const med = esgRatingOf(makeState({ portfolio: props, energyOwnedMW: 25 }));
    expect(med.score).toBeGreaterThan(utan.score);
    expect(med.letter).toBe("B"); // C-bestånd + 25 MW ⇒ grönt lånebetyg
  });
});

/* ── Rivalerna på industrimarknaden + konjunktur ↔ hotell ──────────── */

describe("rivaler och konjunktur i industrisektorn", () => {
  it("hotellintäkten följer konjunkturen: boom > stable > bust", () => {
    const hotel = makeIndustryAsset({});
    const mk = (phase: "boom" | "stable" | "bust") =>
      hotelMonthlyRevenue(hotel, makeState({ marketCycle: { phase, monthsRemaining: 12 } }));
    expect(mk("boom")).toBeGreaterThan(mk("stable"));
    expect(mk("stable")).toBeGreaterThan(mk("bust"));
  });

  it("BUY_INDUSTRY_FROM_RIVAL: 125 % accepteras alltid, tillgången byter ägare", async () => {
    const { reducer } = await import("../engine/reducer");
    const { industryAssetValue } = await import("../engine/industries");
    const asset = makeIndustryAsset({ id: 700 });
    const rival = { name: "Nordfast AB", cash: 5e6, units: 0, equity: 50e6, portfolio: [], industries: [asset] };
    const s0 = makeState({ cash: 2_000_000_000, competitors: [rival] });
    const bud = Math.round(industryAssetValue(asset, s0) * 1.25);
    const s1 = reducer(s0, { type: "BUY_INDUSTRY_FROM_RIVAL", competitorName: "Nordfast AB", industryId: 700, amount: bud });
    expect((s1.industryPortfolio ?? []).some((a) => a.id === 700)).toBe(true);
    expect(s1.competitors[0].industries).toHaveLength(0);
    expect(s1.competitors[0].cash).toBe(5e6 + bud);
    expect(s1.cash).toBe(2_000_000_000 - bud);
  });

  it("förvärv av rival tar med industrierna in i koncernen", async () => {
    const { reducer } = await import("../engine/reducer");
    const asset = makeIndustryAsset({ id: 701 });
    const hus = makeProperty({ id: 44, owned: false, askPrice: 5e6 });
    const rival = { name: "Nordfast AB", cash: 1e6, units: 1, equity: 6e6, portfolio: [hus], industries: [asset] };
    const s0 = makeState({ cash: 100e6, competitors: [rival] });
    const s1 = reducer(s0, { type: "ACQUIRE_RIVAL", competitorName: "Nordfast AB", amount: Math.round(6e6 * 1.3) });
    expect(s1.competitors).toHaveLength(0);
    expect((s1.industryPortfolio ?? []).some((a) => a.id === 701)).toBe(true);
  });

  it("rival kan köpa ett industriobjekt från marknaden (simulering)", async () => {
    const { advanceMonth } = await import("../engine/simulation");
    vi.spyOn(Math, "random").mockReturnValue(0.02); // låg roll: rivalköpet triggar
    const asset = makeIndustryAsset({ id: 702, purchasePrice: 8_000_000 });
    const rival = { name: "Nordfast AB", cash: 100e6, units: 0, equity: 100e6, portfolio: [] };
    const s1 = advanceMonth(makeState({ industryListings: [asset], competitors: [rival] }));
    const köpare = s1.competitors.find((c) => c.name === "Nordfast AB");
    expect((s1.industryListings ?? []).length + ((köpare?.industries ?? []).length) ).toBeGreaterThan(0);
    // antingen köpte rivalen (industries=1) eller inte (listan kvar) – med roll 0.02 ska köpet ske
    expect(köpare?.industries ?? []).toHaveLength(1);
    vi.restoreAllMocks();
  });
});
