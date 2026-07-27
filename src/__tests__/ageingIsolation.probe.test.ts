/* MÄTNING: ORSAKAR åldrandet de sena rasen?

   Femtioårskörningen visade bestånd på 46–62 års snittålder vid slutet och
   kollapser mellan år 35 och 50. Det är en KORRELATION över tio frön – inte
   ett orsakssamband. Den här sonden isolerar frågan genom att stänga av
   åldrandets två halvor, var för sig och tillsammans, och köra exakt samma
   spel med samma frön:

     · obsolescensen  (lifecycle.obsolescenceFactor) – åldern äter värde och
       hyra, ner till 70 % av full nivå
     · slitaget       (ageStepFactor × ageWearFactor) – gamla hus förfaller
       snabbare, vilket i sin tur äter värde via skicket

   Försvinner rasen när de stängs av är åldern orsaken och etappvis
   totalrenovering är rätt medicin. Består de ligger felet någon annanstans –
   sannolikt i belåningen vid cykeltoppen.

   PROBE=1 npx vitest run src/__tests__/ageingIsolation.probe.test.ts       */
import { describe, it, vi } from "vitest";

/* Reglagen måste finnas innan vi.mock-fabriken kör – vi.hoisted garanterar
   det. Sonden vrider på dem mellan varianterna. */
const ageing = vi.hoisted(() => ({ obsolescence: true, wear: true }));

vi.mock("../engine/lifecycle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/lifecycle")>();
  return {
    ...actual,
    obsolescenceFactor: (...a: Parameters<typeof actual.obsolescenceFactor>) =>
      ageing.obsolescence ? actual.obsolescenceFactor(...a) : 1,
    ageStepFactor: (...a: Parameters<typeof actual.ageStepFactor>) =>
      ageing.wear ? actual.ageStepFactor(...a) : 1,
    ageWearFactor: (...a: Parameters<typeof actual.ageWearFactor>) =>
      ageing.wear ? actual.ageWearFactor(...a) : 1,
  };
});

import { initState } from "../engine/initState";
import { placeCity } from "../engine/city";
import { advanceMonth } from "../engine/simulation";
import { reducer } from "../engine/reducer";
import { equityOf, loanTerms, ltvOf, portfolioValue } from "../engine/finance";
import { propAnnualOpex, propMarketValue, propPotentialRent } from "../engine/property";
import { _resetIdCounter, clearRng, seedRng } from "../engine/random";
import type { GameAction } from "../engine/types";

declare const process: { env: Record<string, string | undefined> };
const suite = process.env.PROBE === "1" ? describe : describe.skip;

const YEARS = 50;
const TARGET_LTV = 0.55;
const SEEDS = [11, 23, 37, 51, 68, 74, 89, 103, 117, 128];
const ALLOWED_WORKS = ["energi", "smart", "fasad", "renovering", "tillbygg", "totalrenovering", "påbyggnad"];
const EARLY_STAGE_MAX = 6;
const UPLIFT_TO_SELL = 0.25;

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
  jobs: Record<string, number>;
  decades: [number, number, number, number, number, number][];
  sold: number;
  realisedUplift: number;
}

function play(seed: number, years: number, recycle: boolean): Run {
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
    let sold = 0;
    let realisedUplift = 0;
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

          // ── Frigör övervärdet ───────────────────────────────────
          // I ett tidigt skede räcker varken kassaflödet eller refinansier-
          // ingen till nästa kontantinsats. Det som finns är övervärdet i
          // huset man redan äger: köpeskillingen plus nedlagd capex mot vad
          // marknaden säger idag. Kan man inte köpa, men äger ett hus som
          // stigit rejält, säljs det och pengarna blir kontantinsatser i
          // flera nya. Annonsering ger fullt pris (snabbförsäljning kostar
          // 15 % och äter upp just den vinst man är ute efter).
          if (recycle && !affordable[0] && s.portfolio.length > 0 && s.portfolio.length < EARLY_STAGE_MAX) {
            const cheapest = s.listings
              .filter((p) => p.status === "klar")
              .reduce((min, p) => Math.min(min, p.askPrice), Number.POSITIVE_INFINITY);
            const needed = Number.isFinite(cheapest) ? cheapest * (1 - ltv) + buffer : Infinity;
            if (s.cash < needed) {
              const best = s.portfolio
                .filter((p) => p.status === "klar" && !p.forSale && (p.pendingWorks ?? []).length === 0)
                .map((p) => {
                  const value = propMarketValue(p, s);
                  const basis = (p.purchasePrice || value) + (p.capexTotal ?? 0);
                  return { p, value, basis, uplift: value / Math.max(1, basis) - 1 };
                })
                .filter((x) => x.uplift >= UPLIFT_TO_SELL)
                .sort((a, b) => b.uplift - a.uplift)[0];
              if (best) R({ type: "LIST_FOR_SALE", id: best.p.id, ask: Math.round(best.value) });
            }
          }
        }

        // Ta emot bud på det som ligger ute: fullt pris eller nära det.
        if (recycle) {
          for (const o of s.offers ?? []) {
            const p = s.portfolio.find((x) => x.id === o.propId);
            if (!p?.forSale) continue;
            const value = propMarketValue(p, s);
            if (o.amount >= value * 0.95) {
              const basis = (p.purchasePrice || value) + (p.capexTotal ?? 0);
              realisedUplift += o.amount - basis;
              sold += 1;
              R({ type: "ACCEPT_OFFER", offerId: o.id });
              break; // ett i taget
            }
          }
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
      sold,
      realisedUplift,
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

interface Variant {
  label: string;
  obsolescence: boolean;
  wear: boolean;
}

const VARIANTS: Variant[] = [
  { label: "GRUND        allt åldrande på", obsolescence: true, wear: true },
  { label: "UTAN OBSOLES obsolescens av", obsolescence: false, wear: true },
  { label: "UTAN SLITAGE åldersslitage av", obsolescence: true, wear: false },
  { label: "INGET ÅLDRANDE", obsolescence: false, wear: false },
];

function summarise(label: string, runs: Run[]): void {
  const alive = runs.filter((r) => !r.bankrupt);
  const eq = runs.map((r) => r.equity).sort((a, b) => a - b);
  const dd = runs.map((r) => (r.peakEquity > 0 ? 1 - r.troughAfterPeak / r.peakEquity : 0));
  const lateDeaths = runs.filter((r) => r.bankrupt && (r.bankruptYear ?? 0) >= 30).length;
  const endAge = runs
    .filter((r) => r.decades.length > 0 && r.properties > 0)
    .map((r) => r.decades[r.decades.length - 1][5]);
  console.log(
    `${label.padEnd(32)}  EK median ${msek(median(eq)).padStart(6)} MSEK` +
    `  hus ${(runs.reduce((a, r) => a + r.properties, 0) / runs.length).toFixed(1).padStart(5)}` +
    `  konkurs ${runs.length - alive.length}/${runs.length}` +
    `  varav sena (år 30+) ${lateDeaths}` +
    `  nedgång ${(dd.reduce((a, b) => a + b, 0) / dd.length * 100).toFixed(0).padStart(3)} %` +
    `  slutålder ${endAge.length ? (endAge.reduce((a, b) => a + b, 0) / endAge.length).toFixed(0) : "–"} yr`,
  );
  const deaths = runs.filter((r) => r.bankrupt).map((r) => `${r.seed}:år${r.bankruptYear}`);
  console.log(`    konkurser: ${deaths.length ? deaths.join("  ") : "inga"}`);
}

suite("åldrandets orsaksverkan", () => {
  it(`${VARIANTS.length} varianter × ${SEEDS.length} frön × ${YEARS} år`, () => {
    for (const recycle of [false, true]) {
      console.log(`\n═══ ${recycle ? "OMSÄTTER beståndet" : "KÖPER OCH BEHÅLLER"} ═══`);
      for (const v of VARIANTS) {
        ageing.obsolescence = v.obsolescence;
        ageing.wear = v.wear;
        summarise(v.label, SEEDS.map((sd) => play(sd, YEARS, recycle)));
      }
    }
    ageing.obsolescence = true;
    ageing.wear = true;
  }, 3_600_000);
});
