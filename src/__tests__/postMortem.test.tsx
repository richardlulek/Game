/* Obduktionen: nederlaget ska gå att förstå EFTERÅT, utan att spelet blir
   lättare. Spelet säger ingenting under partiets gång — slutskärmen får
   siffrorna, och slutsatsen är spelarens att dra.

   Det som mättes (peakLeverage.probe, 30 partier × 50 år): de som klarade
   sig hade 24,3 fastigheter vid toppen, de som föll 2,5. Slutskärmen kunde
   inte berätta det, för `history` bär bara kapital per månad. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GameOverModal } from "../components/GameOverModal";
import { BENCHMARK_SAFE_PROPS, benchmarkLine, postMortem } from "../engine/postMortem";
import { advanceMonth } from "../engine/simulation";
import { clearRng, seedRng } from "../engine/random";
import { makeProperty, makeState, makeTenantFixture } from "./factories";
import type { GameState } from "../engine/types";

const house = (id: number) =>
  makeProperty({
    id, baseRent: 2_400_000, capacity: 2, condition: 80,
    tenants: [1, 2].map((t) => makeTenantFixture({ id: id * 10 + t, rent: 60_000 })),
  });

const tick = (s: GameState) => advanceMonth({ ...s, pendingDecision: null, auction: undefined });

function run<T>(fn: () => T): T {
  seedRng(7788);
  try { return fn(); } finally { clearRng(); }
}

describe("toppen fångas när den inträffar", () => {
  it("registrerar bestånd och belåning vid toppen – inte vid slutet", () => {
    run(() => {
      let s = makeState({ cash: 200_000_000, portfolio: [house(1), house(2), house(3)] }) as GameState;
      s = tick(s);
      const atPeak = s.peak!.properties;
      expect(atPeak).toBe(3);

      // Sälj av allt: slutet ser annorlunda ut än toppen.
      s = tick({ ...s, portfolio: [] });
      const pm = postMortem(s);
      expect(pm.peakProperties).toBe(3);
      expect(s.portfolio).toHaveLength(0);
    });
  });

  it("toppen flyttas när kapitalet stiger", () => {
    run(() => {
      let s = makeState({ cash: 10_000_000, portfolio: [house(1)] }) as GameState;
      s = tick(s);
      const first = s.peak!.equity;
      s = tick({ ...s, cash: s.cash + 500_000_000 });
      expect(s.peak!.equity).toBeGreaterThan(first);
      expect(s.peak!.monthAbs).toBeGreaterThan(0);
    });
  });

  it("toppen står kvar när kapitalet faller", () => {
    run(() => {
      let s = makeState({ cash: 500_000_000, portfolio: [house(1)] }) as GameState;
      s = tick(s);
      const peak = s.peak!;
      s = tick({ ...s, cash: 1_000_000 });
      expect(s.peak!.equity).toBe(peak.equity);
      expect(s.peak!.monthAbs).toBe(peak.monthAbs);
      expect(postMortem(s).drawdown).toBeGreaterThan(0.5);
    });
  });

  it("största beståndet minns sin storlek även efter försäljning", () => {
    run(() => {
      let s = makeState({ cash: 100_000_000, portfolio: [house(1), house(2), house(3), house(4)] }) as GameState;
      s = tick(s);
      expect(s.largestPortfolio!.count).toBe(4);
      s = tick({ ...s, portfolio: [house(1)] });
      expect(s.largestPortfolio!.count).toBe(4);
      expect(postMortem(s).largestPortfolio).toBe(4);
    });
  });
});

describe("obduktionen räknar rätt", () => {
  it("år efter toppen räknas från toppen till slutet", () => {
    run(() => {
      let s = makeState({ cash: 500_000_000, portfolio: [house(1)] }) as GameState;
      s = tick(s);
      // Kapitalet faller och partiet rullar vidare två år.
      s = { ...s, cash: 1_000_000 };
      for (let i = 0; i < 24; i++) s = tick(s);
      const pm = postMortem(s);
      expect(pm.yearsAfterPeak).toBeGreaterThanOrEqual(1);
      expect(pm.yearsAfterPeak).toBeLessThanOrEqual(3);
    });
  });

  it("ett parti utan topp kraschar inte", () => {
    const s = makeState({ portfolio: [], history: [] }) as GameState;
    const pm = postMortem(s);
    expect(pm.peakYear).toBeNull();
    expect(pm.peakEquity).toBe(0);
    expect(pm.drawdown).toBe(0);
  });
});

describe("jämförelsen konstaterar, den råder inte", () => {
  const pmWith = (largest: number) =>
    postMortem(makeState({
      portfolio: [],
      largestPortfolio: { count: largest, monthAbs: 24 },
      peak: { monthAbs: 24, equity: 50_000_000, properties: largest, ltv: 0.5 },
    }) as GameState);

  it("skiljer på dem som passerade tröskeln och dem som inte gjorde det", () => {
    expect(pmWith(BENCHMARK_SAFE_PROPS + 5).reachedSafeSize).toBe(true);
    expect(pmWith(2).reachedSafeSize).toBe(false);
    expect(benchmarkLine(pmWith(BENCHMARK_SAFE_PROPS + 5)))
      .not.toBe(benchmarkLine(pmWith(2)));
  });

  it("innehåller inga råd – bara vad andra bolag gjorde", () => {
    for (const n of [2, 20]) {
      const line = benchmarkLine(pmWith(n));
      expect(line).toMatch(/simulated runs/);
      // Ingen uppmaning: inga "you should", "try", "consider".
      expect(line).not.toMatch(/\byou should\b|\btry\b|\bconsider\b|\bnext run\b/i);
    }
  });
});

/* Slutskärmen renderad: en obduktion som inte går att läsa är inte klar. */
describe("slutskärmens text", () => {
  const stalled = () =>
    makeState({
      portfolio: [],
      cash: 0,
      debt: 4_000_000,
      year: 22,
      month: 3,
      gameOver: true,
      gameOverReason: { icon: "🧾", title: "The company is wound up", text: "Nothing left to run." },
      history: [{ month: 0, equity: 15_000_000 }, { month: 1, equity: -2_000_000 }],
      peak: { monthAbs: 78, equity: 15_000_000, properties: 2, ltv: 0.47 },
      largestPortfolio: { count: 2, monthAbs: 78 },
    }) as GameState;

  it("berättar när toppen låg, hur stort beståndet var och vad som hände sedan", () => {
    const html = renderToStaticMarkup(
      <GameOverModal state={stalled()} onNewGame={() => {}} onDismiss={() => {}} />,
    );
    const text = html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(text).toContain("Equity peaked in year 6");
    expect(text).toContain("2 properties");
    expect(text).toContain("47% loan-to-value");
    expect(text).toMatch(/Over the 1[0-9] years that followed, equity fell past zero/);
    expect(text).toContain("simulated runs");
  });

  it("säger inte åt spelaren vad hen borde ha gjort", () => {
    const html = renderToStaticMarkup(
      <GameOverModal state={stalled()} onNewGame={() => {}} onDismiss={() => {}} />,
    );
    const block = html.slice(html.indexOf("The record"));
    expect(block.replace(/<[^>]+>/g, " ")).not.toMatch(/should have|you could|instead of/i);
  });
});
