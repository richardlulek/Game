import { describe, expect, it } from "vitest";
import {
  INFLATION_TARGET,
  RATE_MAX,
  RATE_MIN,
  centralBankDecision,
  taylorTarget,
  tickInflation,
} from "../engine/centralBank";
import { EVENTS } from "../engine/data";
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
    const hot = makeState({ marketMod: 1.35, marketModAnchor: 1.0 });
    for (let i = 0; i < 12; i++) tickInflation(hot);
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
});
