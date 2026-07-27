/* MÄTNING (körs inte i vanliga sviten): 50 år på 55 % belåningsgrad, med en
   portföljdirektör som gör mer än underhåll. Samma kompetenta men enkla
   strategi som hävstångsmätningen – köp på 55 %, refinansiera tillbaka UPP
   till 55 % när amortering och värdetillväxt tryckt ner belåningen, försäkra
   allt, och låt renoveringsprogrammet sköta investeringarna i beståndet.

   Halva speltiden är en hel fastighetscykel; 50 år är fyra. Poängen är att
   se om en medelbelånad förvaltare håller genom flera konjunkturvändningar
   och vad direktörens renoveringar faktiskt gör med hyra och värde.

   PROBE=1 npx vitest run src/__tests__/directorFiftyYears.probe.test.ts   */
import { describe, it } from "vitest";
import { initState } from "../engine/initState";
import { placeCity } from "../engine/city";
import { advanceMonth } from "../engine/simulation";
import { reducer } from "../engine/reducer";
import { equityOf, loanTerms, ltvOf, portfolioValue } from "../engine/finance";
import { propAnnualOpex, propPotentialRent } from "../engine/property";
import { _resetIdCounter, clearRng, seedRng } from "../engine/random";
import type { GameAction } from "../engine/types";

declare const process: { env: Record<string, string | undefined> };
const suite = process.env.PROBE === "1" ? describe : describe.skip;

const YEARS = 50;
const TARGET_LTV = 0.55;
const SEEDS = [11, 23, 37, 51, 68, 74, 89, 103, 117, 128];

/** Vad direktören får beställa: allt utom underhållet, som styrs av
 *  skicktröskeln. Det är hela poängen – en direktör som gör mer än att laga. */
const ALLOWED_WORKS = ["energi", "smart", "fasad", "renovering", "tillbygg", "totalrenovering", "påbyggnad"];

interface Run {
  seed: number;
  equity: number;
  peakEquity: number;
  troughAfterPeak: number;
  properties: number;
  portfolioValue: number;
  annualRent: number;
  bankrupt: boolean;
  bankruptYear: number | null;
  maxLtv: number;
  endLtv: number;
  /** Vad renoveringsprogrammet hann beställa, per åtgärd. */
  jobs: Record<string, number>;
  /** Ögonblicksbild vart tionde år: [år, EK, värde, hus, LTV, snittålder]. */
  decades: [number, number, number, number, number, number][];
}

function play(seed: number, years: number): Run {
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

    let peak = equityOf(s);
    let trough = peak;
    let bankruptYear: number | null = null;
    let maxLtvSeen = 0;
    const jobs: Record<string, number> = {};
    const decades: [number, number, number, number, number, number][] = [];

    for (let m = 0; m < years * 12; m++) {
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
            .filter((p) => {
              const noi = propPotentialRent(p, s) - propAnnualOpex(p, s);
              return noi > p.askPrice * ltv * (terms.rate / 100);
            })
            .sort((a, b) => {
              const ya = (propPotentialRent(a, s) - propAnnualOpex(a, s)) / a.askPrice;
              const yb = (propPotentialRent(b, s) - propAnnualOpex(b, s)) / b.askPrice;
              return yb - ya;
            });
          if (affordable[0]) R({ type: "BUY", id: affordable[0].id });
        }

        if (s.cash < 500_000 && s.portfolio.length > 0 && s.revolving && s.revolving.used < s.revolving.limit)
          R({ type: "DRAW_REVOLVING", amount: Math.min(2_000_000, s.revolving.limit - s.revolving.used) });

        // Refinansiera tillbaka upp till målet en gång om året.
        if (m % 12 === 6 && s.portfolio.length > 0 && ltvOf(s) < TARGET_LTV - 0.05)
          R({ type: "REFINANCE", amount: 500_000_000 });

        if (s.cash > 25_000_000 && s.debt > 0)
          R({ type: "AMORT", amount: Math.min(s.debt, Math.round(s.cash * 0.3)) });
      }

      const wasOver = s.gameOver;
      // Bara uppgraderingar räknas – underhållet ligger på skicktröskeln.
      const before = s.portfolio.map(
        (p) => [p.id, (p.pendingWorks ?? []).filter((w) => w.kind === "uppgradering").length, p.status] as const,
      );
      s = advanceMonth({ ...s, pendingDecision: null, auction: undefined });

      // Räkna vad renoveringsprogrammet beställde: ett nytt pendingWork eller
      // ett hus som gick i byggnation utan att spelaren beordrat något.
      for (const p of s.portfolio) {
        const prev = before.find(([id]) => id === p.id);
        if (!prev) continue;
        const upgrades = (p.pendingWorks ?? []).filter((w) => w.kind === "uppgradering");
        const newWork = upgrades[upgrades.length - 1];
        if (upgrades.length > prev[1] && newWork?.upgradeId)
          jobs[newWork.upgradeId] = (jobs[newWork.upgradeId] ?? 0) + 1;
        if (prev[2] === "klar" && p.status === "bygger" && p.renovation?.kind)
          jobs[p.renovation.kind] = (jobs[p.renovation.kind] ?? 0) + 1;
      }

      if (s.gameOver && !wasOver && bankruptYear === null) bankruptYear = Math.floor(m / 12) + 1;

      const eq = equityOf(s);
      if (eq > peak) { peak = eq; trough = eq; }
      if (eq < trough) trough = eq;
      maxLtvSeen = Math.max(maxLtvSeen, ltvOf(s));

      if ((m + 1) % 120 === 0) {
        const age = s.portfolio.length
          ? s.portfolio.reduce((a, p) => a + (s.year - (p.builtYear ?? s.year)), 0) / s.portfolio.length
          : 0;
        decades.push([(m + 1) / 12, equityOf(s), portfolioValue(s), s.portfolio.length, ltvOf(s), age]);
      }
    }

    return {
      seed,
      equity: equityOf(s),
      peakEquity: peak,
      troughAfterPeak: trough,
      properties: s.portfolio.length,
      portfolioValue: portfolioValue(s),
      annualRent: s.portfolio.reduce((a, p) => a + p.tenants.reduce((b, t) => b + t.rent, 0), 0) * 12,
      bankrupt: !!s.gameOver,
      bankruptYear,
      maxLtv: maxLtvSeen,
      endLtv: ltvOf(s),
      jobs,
      decades,
    };
  } finally {
    clearRng();
  }
}

const msek = (x: number) => (x / 1e6).toFixed(0);
const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};

suite("50 år på 55 % belåning med aktiv direktör", () => {
  it(`${SEEDS.length} frön`, () => {
    const runs = SEEDS.map((sd) => play(sd, YEARS));
    const alive = runs.filter((r) => !r.bankrupt);
    const eq = runs.map((r) => r.equity).sort((a, b) => a - b);
    const dd = runs.map((r) => (r.peakEquity > 0 ? 1 - r.troughAfterPeak / r.peakEquity : 0));

    console.log(`\n${YEARS} år · ${SEEDS.length} frön · mål-LTV ${TARGET_LTV * 100} % · direktör med renoveringsprogram\n`);
    console.log(
      `SAMMANFATTNING  EK median ${msek(median(eq))} MSEK` +
      `  spann ${msek(eq[0])}–${msek(eq[eq.length - 1])}` +
      `  hus ${(runs.reduce((a, r) => a + r.properties, 0) / runs.length).toFixed(1)}` +
      `  konkurs ${runs.length - alive.length}/${runs.length}` +
      `  snitt max nedgång ${(dd.reduce((a, b) => a + b, 0) / dd.length * 100).toFixed(0)} %` +
      `  topp-LTV ${(Math.max(...runs.map((r) => r.maxLtv)) * 100).toFixed(0)} %\n`,
    );

    console.log("frö    EK MSEK   värde MSEK   hyra MSEK/år   hus   slut-LTV   utfall");
    for (const r of runs) {
      console.log(
        `${String(r.seed).padStart(3)}  ${msek(r.equity).padStart(9)}` +
        `  ${msek(r.portfolioValue).padStart(10)}` +
        `  ${(r.annualRent / 1e6).toFixed(1).padStart(12)}` +
        `  ${String(r.properties).padStart(4)}` +
        `  ${(r.endLtv * 100).toFixed(0).padStart(8)} %` +
        `   ${r.bankrupt ? `❌ konkurs år ${r.bankruptYear}` : "✅"}`,
      );
    }

    console.log("\nDECENNIEVIS (år: EK / värde MSEK / hus / LTV / snittålder)");
    for (const r of runs) {
      console.log(
        `  frö ${String(r.seed).padStart(3)}  ` +
        r.decades.map(([y, e, v, n, l, a]) =>
          `${y}: ${msek(e)}/${msek(v)}/${n}h/${(l * 100).toFixed(0)}%/${a.toFixed(0)}yr`).join("   "),
      );
    }

    // Vad direktören faktiskt gjorde.
    const total: Record<string, number> = {};
    for (const r of runs) for (const [k, v] of Object.entries(r.jobs)) total[k] = (total[k] ?? 0) + v;
    const jobCount = Object.values(total).reduce((a, b) => a + b, 0);
    console.log(`\nRENOVERINGSPROGRAMMET  ${jobCount} jobb totalt (${(jobCount / runs.length).toFixed(1)} per parti):`);
    for (const [k, v] of Object.entries(total).sort((a, b) => b[1] - a[1]))
      console.log(`    ${k.padEnd(18)} ${String(v).padStart(4)}`);
    console.log("");
  }, 1_800_000);
});
