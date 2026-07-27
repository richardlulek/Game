/* MÄTNING: är belåningen vid cykeltoppen det som fäller bolagen sent?

   De tidigare sonderna jämförde REGELVARIANTER över samma frön. Det duger
   inte: ändrar man en regel ändras varje efterföljande beslut, slumpbanan
   rullas om, och med tio frön dränks effekten av bruset. Åldersisoleringen
   visade det tydligt – att stänga AV åldersslitaget gjorde utfallet sämre,
   vilket är kausalt omöjligt och alltså bara var brus.

   Den här sonden ändrar ingen regel alls. Den spelar EN uppsättning partier
   och tittar inom varje bana: var låg toppen, vilken belåningsgrad hade
   bolaget då, och hur djupt föll det efteråt? Sambandet mäts sedan TVÄRS
   partierna. Inget rullas om, så det som syns är verkligt.

   PROBE=1 npx vitest run src/__tests__/peakLeverage.probe.test.ts        */
import { describe, it } from "vitest";
import { initState } from "../engine/initState";
import { placeCity } from "../engine/city";
import { advanceMonth } from "../engine/simulation";
import { reducer } from "../engine/reducer";
import { equityOf, loanTerms, ltvOf } from "../engine/finance";
import { propAnnualOpex, propMarketValue, propPotentialRent } from "../engine/property";
import { _resetIdCounter, clearRng, seedRng } from "../engine/random";
import type { GameAction } from "../engine/types";

declare const process: { env: Record<string, string | undefined> };
const suite = process.env.PROBE === "1" ? describe : describe.skip;

const YEARS = 50;
const TARGET_LTV = 0.55;
const SEEDS = [11, 23, 37, 51, 68, 74, 89, 103, 117, 128, 141, 156, 163, 177, 189,
  201, 214, 228, 233, 247, 259, 266, 271, 288, 293, 305, 317, 322, 338, 349];
const ALLOWED_WORKS = ["energi", "smart", "fasad", "renovering", "tillbygg", "totalrenovering", "påbyggnad", "etapprenovering"];
const EARLY_STAGE_MAX = 6;
const UPLIFT_TO_SELL = 0.25;

interface Run {
  seed: number;
  /** Toppen: högsta egna kapital under partiet. */
  peakEquity: number;
  peakMonth: number;
  /** Läget VID toppen. */
  ltvAtPeak: number;
  propsAtPeak: number;
  phaseAtPeak: string;
  /** Efter toppen. */
  troughAfterPeak: number;
  drawdown: number;
  endEquity: number;
  bankrupt: boolean;
  bankruptYear: number | null;
  /** Högsta belåningsgrad någon gång under partiet. */
  maxLtv: number;
}

function play(seed: number): Run {
  seedRng(seed);
  _resetIdCounter();
  try {
    let s = placeCity(initState());
    s = {
      ...s,
      policy: {
        ...(s.policy ?? {}),
        purchaseLtv: TARGET_LTV,
        autoWorks: { enabled: true, allowed: ALLOWED_WORKS, cashFloor: 2_000_000 },
      },
    };
    const R = (a: GameAction) => { s = reducer(s, a); };

    let peakEquity = equityOf(s);
    let peakMonth = 0;
    let ltvAtPeak = 0;
    let propsAtPeak = 0;
    let phaseAtPeak = "stable";
    let trough = peakEquity;
    let bankruptYear: number | null = null;
    let maxLtv = 0;

    for (let m = 0; m < YEARS * 12; m++) {
      if (!s.gameOver) {
        if (!s.globalManager?.active && s.portfolio.length >= 1)
          R({ type: "SET_GLOBAL_MANAGER", settings: { active: true, minCondition: 60, minTenantQuality: 0.5, rentTargetPct: 1.0 } });
        for (const p of s.portfolio) if (p.status === "klar" && !p.insurance) R({ type: "BUY_INSURANCE", id: p.id });

        if (m % 2 === 0) {
          const terms = loanTerms(s);
          const ltv = Math.min(TARGET_LTV, terms.maxLtv);
          const buffer = s.portfolio.length === 0 ? 300_000 : 2_000_000;
          const affordable = s.listings
            .filter((p) => p.status === "klar")
            .filter((p) => s.cash - p.askPrice * (1 - ltv) > buffer)
            .filter((p) => propPotentialRent(p, s) - propAnnualOpex(p, s) > p.askPrice * ltv * (terms.rate / 100))
            .sort((a, b) =>
              (propPotentialRent(b, s) - propAnnualOpex(b, s)) / b.askPrice -
              (propPotentialRent(a, s) - propAnnualOpex(a, s)) / a.askPrice);
          if (affordable[0]) R({ type: "BUY", id: affordable[0].id });

          // Omsätter beståndet: frigör övervärdet tidigt (den väg som visat
          // sig vara den enda som faktiskt växer).
          if (!affordable[0] && s.portfolio.length > 0 && s.portfolio.length < EARLY_STAGE_MAX) {
            const cheapest = s.listings.filter((p) => p.status === "klar")
              .reduce((min, p) => Math.min(min, p.askPrice), Number.POSITIVE_INFINITY);
            const needed = Number.isFinite(cheapest) ? cheapest * (1 - ltv) + buffer : Infinity;
            if (s.cash < needed) {
              const best = s.portfolio
                .filter((p) => p.status === "klar" && !p.forSale && (p.pendingWorks ?? []).length === 0)
                .map((p) => {
                  const value = propMarketValue(p, s);
                  return { p, value, uplift: value / Math.max(1, (p.purchasePrice || value) + (p.capexTotal ?? 0)) - 1 };
                })
                .filter((x) => x.uplift >= UPLIFT_TO_SELL)
                .sort((a, b) => b.uplift - a.uplift)[0];
              if (best) R({ type: "LIST_FOR_SALE", id: best.p.id, ask: Math.round(best.value) });
            }
          }
        }

        for (const o of s.offers ?? []) {
          const p = s.portfolio.find((x) => x.id === o.propId);
          if (p?.forSale && o.amount >= propMarketValue(p, s) * 0.95) {
            R({ type: "ACCEPT_OFFER", offerId: o.id });
            break;
          }
        }

        if (s.cash < 500_000 && s.portfolio.length > 0 && s.revolving && s.revolving.used < s.revolving.limit)
          R({ type: "DRAW_REVOLVING", amount: Math.min(2_000_000, s.revolving.limit - s.revolving.used) });
        if (m % 12 === 6 && s.portfolio.length > 0 && ltvOf(s) < TARGET_LTV - 0.05)
          R({ type: "REFINANCE", amount: 500_000_000 });
        if (s.cash > 25_000_000 && s.debt > 0)
          R({ type: "AMORT", amount: Math.min(s.debt, Math.round(s.cash * 0.3)) });
      }

      const wasOver = s.gameOver;
      s = advanceMonth({ ...s, pendingDecision: null, auction: undefined });
      if (s.gameOver && !wasOver && bankruptYear === null) bankruptYear = Math.floor(m / 12) + 1;

      const eq = equityOf(s);
      const ltv = ltvOf(s);
      maxLtv = Math.max(maxLtv, ltv);
      if (eq > peakEquity) {
        peakEquity = eq;
        peakMonth = m;
        ltvAtPeak = ltv;
        propsAtPeak = s.portfolio.length;
        phaseAtPeak = s.marketCycle?.phase ?? "stable";
        trough = eq;
      }
      if (eq < trough) trough = eq;
    }

    return {
      seed, peakEquity, peakMonth, ltvAtPeak, propsAtPeak, phaseAtPeak,
      troughAfterPeak: trough,
      drawdown: peakEquity > 0 ? 1 - trough / peakEquity : 0,
      endEquity: equityOf(s),
      bankrupt: !!s.gameOver,
      bankruptYear,
      maxLtv,
    };
  } finally {
    clearRng();
  }
}

const msek = (x: number) => (x / 1e6).toFixed(0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** Pearson-korrelation – hur starkt hänger två serier ihop? */
function corr(xs: number[], ys: number[]): number {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}

suite("belåningen vid toppen", () => {
  it(`${SEEDS.length} partier × ${YEARS} år, ingen regel ändrad`, () => {
    const runs = SEEDS.map(play).filter((r) => r.peakEquity > 1_000_000);

    console.log(`\n${runs.length} partier med en mätbar topp (av ${SEEDS.length})\n`);
    console.log("frö   topp MSEK  år   LTV vid topp  hus  fas      nedgång   slut MSEK  utfall");
    for (const r of runs) {
      console.log(
        `${String(r.seed).padStart(3)} ${msek(r.peakEquity).padStart(10)}` +
        ` ${String(Math.floor(r.peakMonth / 12) + 1).padStart(4)}` +
        ` ${(r.ltvAtPeak * 100).toFixed(0).padStart(12)} %` +
        ` ${String(r.propsAtPeak).padStart(4)} ${r.phaseAtPeak.padEnd(7)}` +
        ` ${(r.drawdown * 100).toFixed(0).padStart(7)} %` +
        ` ${msek(r.endEquity).padStart(10)}` +
        `  ${r.bankrupt ? `❌ år ${r.bankruptYear}` : "✅"}`,
      );
    }

    // ── Sambandet ────────────────────────────────────────────────
    const ltvs = runs.map((r) => r.ltvAtPeak);
    const dds = runs.map((r) => r.drawdown);
    console.log(`\nKORRELATION  LTV vid toppen ↔ nedgång efteråt:  r = ${corr(ltvs, dds).toFixed(3)}`);
    console.log(`             topp-LTV under partiet ↔ nedgång:   r = ${corr(runs.map((r) => r.maxLtv), dds).toFixed(3)}`);

    // ── Grupperat ────────────────────────────────────────────────
    const buckets: [string, (r: Run) => boolean][] = [
      ["LTV < 50 % vid toppen", (r) => r.ltvAtPeak < 0.5],
      ["LTV 50–65 %", (r) => r.ltvAtPeak >= 0.5 && r.ltvAtPeak < 0.65],
      ["LTV ≥ 65 %", (r) => r.ltvAtPeak >= 0.65],
    ];
    console.log("\ngrupp                      n   snitt nedgång   konkurs   median slut-EK");
    for (const [label, pred] of buckets) {
      const g = runs.filter(pred);
      if (!g.length) { console.log(`${label.padEnd(24)}   0            –         –              –`); continue; }
      const ends = g.map((r) => r.endEquity).sort((a, b) => a - b);
      console.log(
        `${label.padEnd(24)} ${String(g.length).padStart(3)}` +
        ` ${(mean(g.map((r) => r.drawdown)) * 100).toFixed(0).padStart(13)} %` +
        ` ${`${g.filter((r) => r.bankrupt).length}/${g.length}`.padStart(9)}` +
        ` ${msek(ends[Math.floor(ends.length / 2)]).padStart(14)} MSEK`,
      );
    }

    // Överlevare mot fallna: skiljer sig belåningen vid toppen?
    const dead = runs.filter((r) => r.bankrupt);
    const alive = runs.filter((r) => !r.bankrupt);
    console.log(
      `\nVID TOPPEN   fallna (${dead.length}): LTV ${(mean(dead.map((r) => r.ltvAtPeak)) * 100).toFixed(0)} %` +
      `, ${mean(dead.map((r) => r.propsAtPeak)).toFixed(1)} hus` +
      `  ·  överlevare (${alive.length}): LTV ${(mean(alive.map((r) => r.ltvAtPeak)) * 100).toFixed(0)} %` +
      `, ${mean(alive.map((r) => r.propsAtPeak)).toFixed(1)} hus\n`,
    );
  }, 3_600_000);
});
