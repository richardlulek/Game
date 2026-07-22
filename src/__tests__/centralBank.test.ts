import { describe, expect, it } from "vitest";
import {
  INFLATION_TARGET,
  RATE_MAX,
  RATE_MIN,
  TERM_PREMIUM,
  centralBankDecision,
  curveInverted,
  longRate,
  taylorTarget,
  tickInflation,
} from "../engine/centralBank";
import { bondRateFor, creditRatingOf } from "../engine/rating";
import { placeCity } from "../engine/city";
import { EVENTS } from "../engine/data";
import { initState } from "../engine/initState";
import { loanTerms } from "../engine/finance";
import { clearRng, seedRng } from "../engine/random";
import { advanceMonth } from "../engine/simulation";
import type { GameState } from "../engine/types";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

/* Riksbanken 2.0 (masterplan fas 1): inflationen modelleras ur stadens
   läge, styrräntan följer en Taylor-regel, och refinansieringar sätter en
   personlig premie i stället för att flytta basräntan. */

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

describe("RIKSBANKEN 2.0: inflationen driver räntan", () => {
  it("överhettad marknad lyfter inflationen, kris sänker den", () => {
    // 24 månader: den omkalibrerade heat-termen (tak +1.5) ger ett lägre
    // jämviktsläge (~3.1) som EMA:n behöver längre tid att nå.
    const hot = makeState({ marketMod: 1.35, marketModAnchor: 1.0 });
    for (let i = 0; i < 24; i++) tickInflation(hot);
    expect(hot.centralBank!.inflation).toBeGreaterThan(INFLATION_TARGET + 1);

    const crisis = makeState({ crisisMonthsLeft: 6, marketCycle: { phase: "bust", monthsRemaining: 8 } });
    for (let i = 0; i < 12; i++) tickInflation(crisis);
    expect(crisis.centralBank!.inflation).toBeLessThan(INFLATION_TARGET - 1);
  });

  it("Taylor-målet: 1,5× inflationsgap plus konjunkturgap, klämt till banden", () => {
    expect(taylorTarget(2.0, "stable")).toBeCloseTo(3.25, 2);
    expect(taylorTarget(5.0, "stable")).toBeCloseTo(3.25 + 4.5, 2);
    expect(taylorTarget(-3.0, "bust")).toBe(RATE_MIN);
    expect(taylorTarget(30, "boom")).toBe(RATE_MAX);
  });

  it("räntebeskedet rör sig max 50 punkter mot målet", () => {
    const s = makeState({ interestRate: 3.0, centralBank: { inflation: 6, impulse: 0 } });
    centralBankDecision(s);
    expect(s.interestRate).toBe(3.5);
    const low = makeState({ interestRate: 3.0, centralBank: { inflation: 0, impulse: 0 } });
    centralBankDecision(low);
    expect(low.interestRate).toBe(2.5);
  });

  it("händelser är inflationschocker – de rör inte styrräntan direkt", () => {
    const s = makeState({ interestRate: 4.0 });
    const shocked = EVENTS.find((e) => e.id === "rate_up")!.apply(s);
    expect(shocked.interestRate).toBe(4.0);
    expect(shocked.centralBank!.impulse).toBeGreaterThan(0);
    // Impulsen letar sig in i inflationen under följande månader.
    for (let i = 0; i < 3; i++) tickInflation(shocked);
    expect(shocked.centralBank!.inflation).toBeGreaterThan(INFLATION_TARGET);
  });

  it("refinansiering sätter en personlig premie – inte basräntan", () => {
    seedRng(3);
    try {
      let s = makeState({
        cash: 20_000_000,
        debt: 100_000_000,
        debtMatureAbs: makeState({}).year * 12 + makeState({}).month,
        recessionMonthsLeft: 4,
        reputation: 70,
        portfolio: [makeProperty({ id: 1, tenants: [makeTenantFixture({ rent: 500_000 })] })],
      });
      const rateBefore = s.interestRate;
      const base = loanTerms(s).rate;
      s = tick(s);
      // Basräntan orörd av förfallet (bara riksbanken flyttar den – och
      // beskedmånaden är month % 3 === 1; starten är month 1 så ETT besked
      // kan ha skett; premien syns däremot alltid i loanTerms).
      expect(s.refiSpreadAdj).toBeGreaterThan(0); // recession ⇒ dyr refi
      expect(loanTerms(s).rate).toBeGreaterThan(base + (s.interestRate - rateBefore) + 0.5);
      expect(s.log.some((l) => l.t.includes("Refi premium"))).toBe(true);
    } finally { clearRng(); }
  });

  it("30 år: räntan håller banden och följer inflationen", { timeout: 120_000 }, () => {
    seedRng(7);
    try {
      let s = makeState({ cash: 50_000_000, portfolio: [makeProperty({ id: 1, tenants: [makeTenantFixture({ rent: 300_000 })] })] });
      const hi: number[] = [];
      const lo: number[] = [];
      for (let m = 0; m < 360; m++) {
        s = tick(s);
        expect(s.interestRate).toBeGreaterThanOrEqual(RATE_MIN);
        expect(s.interestRate).toBeLessThanOrEqual(RATE_MAX);
        const inf = s.centralBank?.inflation ?? 2;
        if (inf > 3.5) hi.push(s.interestRate);
        if (inf < 1.0) lo.push(s.interestRate);
      }
      // Lös korrelationssanity: högsinflationsmånader har högre snittränta.
      if (hi.length > 5 && lo.length > 5) {
        const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
        expect(avg(hi)).toBeGreaterThan(avg(lo));
      }
    } finally { clearRng(); }
  });

  it("avkastningskurvan: positiv lutning i normalläge, inverterad efter höjningar när inflationen faller", () => {
    // Normalläge: långräntan över styrräntan (löptidspremie).
    const normal = makeState({ interestRate: 3.25, centralBank: { inflation: 2, impulse: 0 } });
    expect(longRate(normal)).toBeGreaterThan(normal.interestRate);
    expect(curveInverted(normal)).toBe(false);
    // Hög styrränta + fallande inflation ⇒ marknaden prisar in sänkningar.
    const late = makeState({ interestRate: 8, centralBank: { inflation: 0.5, impulse: 0 } });
    expect(curveInverted(late)).toBe(true);
    expect(longRate(late)).toBeLessThan(late.interestRate);
    expect(TERM_PREMIUM).toBeGreaterThan(0);
  });

  it("obligationer prissätts i långa änden: billigare än korta när sänkningar väntas", () => {
    const late = makeState({
      interestRate: 8,
      centralBank: { inflation: 0.5, impulse: 0 },
      cash: 60_000_000,
      portfolio: [makeProperty({ id: 1, tenants: [makeTenantFixture({ rent: 500_000 })] })],
    });
    const rating = creditRatingOf(late).rating;
    // Långt ankare: kupongen ska ligga under styrränta + ratingspread.
    expect(bondRateFor(late, rating)).toBeLessThan(8 + 0.6);
    expect(bondRateFor(late, rating)).toBeCloseTo(Math.max(3, longRate(late) + (rating === "AAA" ? 0.6 : rating === "AA" ? 0.8 : rating === "A" ? 1.0 : rating === "BBB" ? 1.4 : rating === "BB" ? 2.2 : rating === "B" ? 3.2 : 5)), 2);
  });

  it("räntan lever i ett realistiskt band över 30 år: median nära neutralt, sällan över 7 %", () => {
    // Regressionsvakt för omkalibreringen: den gamla inflationsmodellen lät
    // bygg-/befolkningstermerna bara dra uppåt och styrräntan fastnade på
    // 7–10 %. Nu ska en levande stad ge median ≤ 4.75 och nästan aldrig ≥ 7.
    for (const seed of [3, 29]) {
      seedRng(seed);
      try {
        let s = placeCity(initState());
        const rates: number[] = [];
        for (let m = 0; m < 360; m++) {
          s = advanceMonth({ ...s, pendingDecision: null, auction: undefined, receivership: undefined });
          rates.push(s.interestRate);
        }
        const sorted = [...rates].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const p90 = sorted[Math.floor(sorted.length * 0.9)];
        const over7 = rates.filter((r) => r >= 7).length / rates.length;
        expect(median, `seed ${seed} median`).toBeLessThanOrEqual(4.75);
        expect(median, `seed ${seed} median`).toBeGreaterThanOrEqual(1.5);
        expect(p90, `seed ${seed} p90`).toBeLessThanOrEqual(6.5);
        expect(over7, `seed ${seed} andel ≥7%`).toBeLessThanOrEqual(0.05);
        // Cykeln ska fortfarande röra räntan – inte platt linje.
        expect(sorted[sorted.length - 1] - sorted[0]).toBeGreaterThanOrEqual(1.5);
      } finally { clearRng(); }
    }
  }, 120_000);

  it("inversionen varnas en gång i simulationen och tynger sentimentet", () => {
    seedRng(21);
    try {
      let s = makeState({
        interestRate: 8,
        centralBank: { inflation: 0.5, impulse: 0 },
        marketSentiment: 1.2,
        cash: 30_000_000,
      });
      s = tick(s);
      expect(s.log.some((l) => l.t.includes("INVERTED YIELD CURVE"))).toBe(true);
      expect(s.centralBank?.inverted).toBe(true);
    } finally { clearRng(); }
  });
});
