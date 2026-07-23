/* M&A 2.0 batch 5: partiella affärer och konkurrensvakten. Divisionsköp i
   ett paket, byteshandel som bygger relationer, paketbolagsförsäljning –
   och dominansaffärer som får villkor av myndigheten. */

import { describe, expect, it } from "vitest";
import {
  DIVEST_MONTHS,
  DIVISION_PREMIUM,
  PACKAGE_PHASE_MULT,
  competitionBreach,
  divisionPrice,
  swapAccepted,
} from "../engine/mna";
import { propMarketValue } from "../engine/property";
import { clearRng, seedRng } from "../engine/random";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { Competitor, GameState } from "../engine/types";
import { makeProperty, makeState } from "./factories";

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

function rival(name: string, over: Partial<Competitor> = {}): Competitor {
  return { name, cash: 30_000_000, units: 0, equity: 120_000_000, portfolio: [], strategy: "värde", ...over };
}

describe("DIVISIONSKÖP: ett distrikt, en affär", () => {
  it("köper hela distriktsbeståndet med paketpremie – rivalen amorterar med likviden", () => {
    const props = [1, 2, 3].map((n) => makeProperty({ id: 7300 + n, district: "hamnen", owned: false }));
    const seller = rival("Wellspring Invest", {
      portfolio: [...props, makeProperty({ id: 7310, district: "centrum", owned: false })],
      debt: 50_000_000,
    });
    const s = makeState({ cash: 60_000_000, competitors: [seller] });
    const price = divisionPrice(s, seller, "hamnen");
    expect(price).toBe(Math.round(props.reduce((a, p) => a + propMarketValue(p, s), 0) * DIVISION_PREMIUM));
    const after = reducer(s, { type: "BUY_DIVISION", competitorName: seller.name, district: "hamnen" });
    expect(after.portfolio.filter((p) => p.district === "hamnen")).toHaveLength(3);
    const sold = after.competitors.find((c) => c.name === seller.name)!;
    expect(sold.portfolio).toHaveLength(1); // centrum-huset kvar
    expect(sold.debt!).toBeLessThan(50_000_000); // 70 % av likviden till skulden
    expect(after.debt).toBe(price - Math.round(price * 0.25));
  });
});

describe("BYTESHANDEL: passform eller relation", () => {
  it("distriktsbolag tar bytet i sin stadsdel; andra kräver standing ≥ 20", () => {
    const focused = rival("Oakvale & Sons", { strategy: "distrikt", preferredDistrict: "förort" });
    const s = makeState({});
    expect(swapAccepted(s, focused, "förort")).toBe(true);
    expect(swapAccepted(s, focused, "centrum")).toBe(false);
    const warm = makeState({ standing: { rivals: { "Wellspring Invest": 25 } } });
    expect(swapAccepted(warm, rival("Wellspring Invest"), "centrum")).toBe(true);
  });

  it("genomfört byte flyttar husen, reglerar mellanskillnaden och värmer relationen", () => {
    const mine = makeProperty({ id: 7320, district: "förort", askPrice: 10_000_000 });
    const theirs = makeProperty({ id: 7321, district: "centrum", owned: false, askPrice: 30_000_000 });
    const partner = rival("Oakvale & Sons", { strategy: "distrikt", preferredDistrict: "förort", portfolio: [theirs] });
    const s = makeState({ cash: 100_000_000, portfolio: [mine], competitors: [partner] });
    const after = reducer(s, { type: "PROPOSE_SWAP", myPropertyId: 7320, rivalName: partner.name, rivalPropertyId: 7321 });
    expect(after.portfolio.some((p) => p.id === 7321 && p.owned)).toBe(true);
    expect(after.portfolio.some((p) => p.id === 7320)).toBe(false);
    const comp = after.competitors[0];
    expect(comp.portfolio.some((p) => p.id === 7320)).toBe(true);
    expect(after.standing?.rivals?.[partner.name]).toBe(8);
    // Mellanskillnaden: deras hus är dyrare → du betalade.
    expect(after.cash).toBeLessThan(s.cash);
  });

  it("en mellanskillnad under det jämna värdet kontras – bytet uteblir", () => {
    const mine = makeProperty({ id: 7330, district: "förort", askPrice: 10_000_000 });
    const theirs = makeProperty({ id: 7331, district: "centrum", owned: false, askPrice: 30_000_000 });
    const partner = rival("Oakvale & Sons", { strategy: "distrikt", preferredDistrict: "förort", portfolio: [theirs] });
    const s = makeState({ cash: 100_000_000, portfolio: [mine], competitors: [partner] });
    // Lågt bud på mellanskillnaden → rivalen kontrar, husen står kvar.
    const low = reducer(s, { type: "PROPOSE_SWAP", myPropertyId: 7330, rivalName: partner.name, rivalPropertyId: 7331, cashBoot: 1_000_000 });
    expect(low.portfolio.some((p) => p.id === 7331 && p.owned)).toBe(false);
    expect(low.portfolio.some((p) => p.id === 7330)).toBe(true);
    // Möt det jämna värdet → affären går igenom.
    const fair = reducer(s, { type: "PROPOSE_SWAP", myPropertyId: 7330, rivalName: partner.name, rivalPropertyId: 7331, cashBoot: 20_000_000 });
    expect(fair.portfolio.some((p) => p.id === 7331 && p.owned)).toBe(true);
  });
});

describe("PAKETBOLAG: säljsidans M&A", () => {
  it("distriktspaketet går till bäst kapitaliserade rival, prissatt efter fasen", () => {
    const pack = [1, 2, 3].map((n) => makeProperty({ id: 7330 + n, district: "kulle" }));
    const buyer = rival("Northgate Properties", { cash: 500_000_000 });
    const s = makeState({ portfolio: pack, competitors: [buyer], marketCycle: { phase: "bust", monthsRemaining: 6 } });
    const est = Math.round(pack.reduce((a, p) => a + propMarketValue(p, s), 0) * PACKAGE_PHASE_MULT.bust);
    const after = reducer(s, { type: "SELL_PORTFOLIO_COMPANY", district: "kulle" });
    expect(after.cash - s.cash).toBe(est);
    expect(after.portfolio).toHaveLength(0);
    expect(after.competitors[0].portfolio).toHaveLength(3);
    expect(after.competitors[0].debt ?? 0).toBeGreaterThan(0); // köparen belånade
  });
});

describe("KONKURRENSVAKTEN: dominans får villkor", () => {
  it("breach-detektorn slår vid > 45 % i ett distrikt med riktig marknad", () => {
    const mine = [1, 2, 3, 4].map((n) => makeProperty({ id: 7400 + n, district: "hamnen" }));
    const others = rival("Northgate Properties", {
      portfolio: [5, 6, 7].map((n) => makeProperty({ id: 7400 + n, district: "hamnen", owned: false })),
    });
    const s = makeState({ portfolio: mine, competitors: [others] });
    // 4 av 7 = 57 % > 45 %.
    expect(competitionBreach(s)).toMatchObject({ district: "hamnen", maxAllowed: 3 });
    // Under tröskeln: ingen breach.
    const small = makeState({ portfolio: mine.slice(0, 2), competitors: [others] });
    expect(competitionBreach(small)).toBeNull();
  });

  it("försutten frist ger vite och omstart av klockan", () => {
    seedRng(149);
    try {
      const mine = [1, 2, 3, 4].map((n) => makeProperty({ id: 7410 + n, district: "hamnen" }));
      let s = makeState({
        cash: 50_000_000,
        portfolio: mine,
        competitors: [rival("Northgate Properties", { portfolio: [makeProperty({ id: 7420, district: "hamnen", owned: false })] })],
        divestOrders: [{ district: "hamnen", maxAllowed: 2, dueAbs: 13 }], // redan förfallen
      });
      s = tick(s);
      expect(s.log.some((e) => e.t.includes("FINED"))).toBe(true);
      expect(s.divestOrders![0].dueAbs).toBeGreaterThan(13 + DIVEST_MONTHS - 2);
      // Säljer du ned dig godkänns du nästa månad.
      s.portfolio = s.portfolio.slice(0, 2);
      s = tick(s);
      expect(s.divestOrders).toHaveLength(0);
      expect(s.log.some((e) => e.t.includes("COMPLIANCE"))).toBe(true);
    } finally {
      clearRng();
    }
  });
});
