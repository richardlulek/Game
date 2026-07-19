import { describe, expect, it } from "vitest";
import { advanceMonth } from "../engine/simulation";
import { seedRng, clearRng } from "../engine/random";
import { makeIndustryAsset, makeState } from "./factories";
import { BAY_CAPACITY_M3, contractedM3, logisticsMonthlyRevenue } from "../engine/industries";
import type { GameState } from "../engine/types";

/* Vakt för användarrapporterade buggar:
   1) Logistikterminaler fick ALDRIG intäkter – kontraktsinflödet fanns inte
      (ADD_THROUGHPUT_CONTRACT hade ingen avsändare) och terminalerna
      skapades med tomma kontraktslistor.
   2) Marknadstrenden var systematiskt negativ i sena partier: boom/bust-paret
      drog −0,6 %, sällsynta chocker −5 % styck (2 av 3 negativa), kriser
      lämnade −9 % permanent och bubbelvakten halshögg varje uppgång över
      absoluta 1,12. */

/** Kör en månad med beslut/auktioner bortklickade – advanceMonth pausar
 *  annars helt (spelaren förväntas svara), och långkörningar fryser. */
function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

function terminal(): ReturnType<typeof makeIndustryAsset> {
  return makeIndustryAsset({
    sector: "logistik",
    name: "Test Terminal",
    hotelMeta: null,
    logisticsMeta: {
      totalBays: 14,
      automationLevel: 0,
      throughputContracts: [],
      peakSurchargeActive: false,
    },
  });
}

describe("INDUSTRI: logistiken tjänar pengar och trenden är inte riggad nedåt", () => {
  it("fyller en tom terminal med kontrakt och intäkter inom ett år", () => {
    seedRng(7);
    try {
      let s: GameState = makeState({ industryPortfolio: [terminal()], cash: 50_000_000 });
      for (let m = 0; m < 12; m++) s = tick(s);
      const t = (s.industryPortfolio ?? [])[0];
      expect(t.logisticsMeta!.throughputContracts.length).toBeGreaterThan(0);
      expect(logisticsMonthlyRevenue(t, s)).toBeGreaterThan(0);
      expect(t.totalRevenue).toBeGreaterThan(0);
    } finally {
      clearRng();
    }
  });

  it("kontraktsvolymen respekterar terminalens kapacitet", () => {
    seedRng(11);
    try {
      let s: GameState = makeState({ industryPortfolio: [terminal()], cash: 50_000_000 });
      for (let m = 0; m < 48; m++) s = tick(s);
      const meta = (s.industryPortfolio ?? [])[0].logisticsMeta!;
      expect(contractedM3(meta)).toBeLessThanOrEqual(meta.totalBays * BAY_CAPACITY_M3);
    } finally {
      clearRng();
    }
  });

  it("nyskapade terminaler (marknadslistor) har ett sittande kontrakt", async () => {
    const { makeIndustryAssetFromTemplate } = await import("../engine/industries");
    const s = makeState();
    const asset = makeIndustryAssetFromTemplate(
      { sector: "logistik", name: "T", district: "centrum", districtName: "Downtown", basePrice: 16_000_000, totalBays: 14 },
      999,
      s,
    );
    expect(asset.logisticsMeta!.throughputContracts.length).toBe(1);
    expect(logisticsMonthlyRevenue(asset, s)).toBeGreaterThan(0);
  });

  it("marknadsnivån har ingen systematisk nedåtdrift över 30 år", { timeout: 60_000 }, () => {
    // Median över flera seeds: sekulär drift (+2 %/år) ska inte ätas upp av
    // chockerna. Enstaka partier får sluta lågt (kriser är på riktigt), men
    // hälften av partierna ska sluta ≥ startnivån.
    const finals: number[] = [];
    let peak = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      seedRng(seed);
      try {
        let s: GameState = makeState({ cash: 100_000_000 });
        for (let m = 0; m < 360; m++) {
          s = tick(s);
          peak = Math.max(peak, s.marketMod);
        }
        finals.push(s.marketMod);
      } finally {
        clearRng();
      }
    }
    finals.sort((a, b) => a - b);
    const median = (finals[3] + finals[4]) / 2;
    expect(median, `slutnivåer: ${finals.map((f) => f.toFixed(2)).join(", ")}`).toBeGreaterThanOrEqual(1.0);
    // Uppgångar får LEVA en tid: gamla absoluttaket 1,12 klippte varje topp.
    expect(peak).toBeGreaterThan(1.15);
  });
});
