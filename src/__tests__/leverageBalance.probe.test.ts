/* MÄTNING (körs inte i vanliga sviten): är låg, mellan och hög belåning alla
   gångbara vägar? Samma köpstrategi spelas vid tre belåningsgrader över flera
   frön. Målbilden: låg = trygg men långsam, mellan = balanserad, hög = snabb
   men konjunkturkänslig. Alla ska kunna överleva; ingen ska dominera.

   PROBE=1 npx vitest run src/__tests__/leverageBalance.probe.test.ts        */
import { describe, it } from "vitest";
import { initState } from "../engine/initState";
import { placeCity } from "../engine/city";
import { advanceMonth } from "../engine/simulation";
import { reducer } from "../engine/reducer";
import { equityOf, loanTerms, ltvOf } from "../engine/finance";
import { propAnnualOpex, propPotentialRent } from "../engine/property";
import { _resetIdCounter, clearRng, seedRng } from "../engine/random";
import type { GameAction } from "../engine/types";

declare const process: { env: Record<string, string | undefined> };
const suite = process.env.PROBE === "1" ? describe : describe.skip;

const YEARS = 25;
const SEEDS = [11, 23, 37, 51, 68, 74, 89, 103, 117, 128, 141, 156];

interface Run {
  equity: number;
  peakEquity: number;
  troughAfterPeak: number;
  properties: number;
  bankrupt: boolean;
  bankruptYear: number | null;
  maxLtv: number;
}

/** Spelar en enkel men kompetent förvärvsstrategi i `years` år. */
function play(seed: number, purchaseLtv: number | undefined, years: number): Run {
  seedRng(seed);
  // Id-räknaren är global och används som frö för tomtvalet (city.claimFor).
  // Utan nollställning smittar en körning nästa: samma frö ger olika stad.
  _resetIdCounter();
  try {
    let s = placeCity(initState());
    if (purchaseLtv !== undefined) s = { ...s, policy: { ...(s.policy ?? {}), purchaseLtv } };
    const R = (a: GameAction) => { s = reducer(s, a); };

    let peak = equityOf(s);
    let trough = peak;
    let bankruptYear: number | null = null;
    let maxLtvSeen = 0;

    for (let m = 0; m < years * 12; m++) {
      if (!s.gameOver) {
        // Förvaltning: sköt beståndet så jämförelsen handlar om HÄVSTÅNG.
        if (!s.globalManager?.active && s.portfolio.length >= 1)
          R({ type: "SET_GLOBAL_MANAGER", settings: { active: true, minCondition: 60, minTenantQuality: 0.5, rentTargetPct: 1.0 } });

        // Försäkring på allt. Utan den är ~1,5 % risk per månad för en skada
        // på 8 % av värdet – ren otur som inte har med hävstång att göra och
        // som annars dränker mätningen i brus.
        for (const p of s.portfolio) if (p.status === "klar" && !p.insurance) R({ type: "BUY_INSURANCE", id: p.id });

        // Köp: objekt vars driftnetto täcker räntan på lånedelen, om kassan
        // räcker till kontantinsatsen med marginal.
        if (m % 2 === 0) {
          const terms = loanTerms(s);
          const ltv = purchaseLtv === undefined ? terms.maxLtv : Math.min(purchaseLtv, terms.maxLtv);
          // Bufferten måste vara liten innan man äger något – annars kan låg
          // belåning aldrig komma igång och mätningen mäter bara min spärr.
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
              return yb - ya; // bäst avkastning först
            });
          if (affordable[0]) R({ type: "BUY", id: affordable[0].id });
        }

        // Likviditetsvakt.
        if (s.cash < 500_000 && s.portfolio.length > 0 && s.revolving && s.revolving.used < s.revolving.limit)
          R({ type: "DRAW_REVOLVING", amount: Math.min(2_000_000, s.revolving.limit - s.revolving.used) });

        // Refinansiera: eget kapital byggs inne i fastigheterna (amortering +
        // värdetillväxt) men blir bara köpkraft om det frigörs. Utan detta
        // steg stannar tillväxten helt oavsett belåningsgrad.
        // REFINANCE följer numera vald belåningsgrad, så ALLA strategier kan
        // frigöra kapital – var och en upp till sin egen nivå.
        const target = purchaseLtv ?? loanTerms(s).maxLtv;
        if (m % 12 === 6 && s.portfolio.length > 0 && ltvOf(s) < target - 0.05)
          R({ type: "REFINANCE", amount: 500_000_000 });

        // Amortera när kassan är stark – gäller alla strategier lika.
        if (s.cash > 25_000_000 && s.debt > 0)
          R({ type: "AMORT", amount: Math.min(s.debt, Math.round(s.cash * 0.3)) });
      }

      const wasOver = s.gameOver;
      s = advanceMonth({ ...s, pendingDecision: null, auction: undefined });
      if (s.gameOver && !wasOver && bankruptYear === null) bankruptYear = Math.floor(m / 12) + 1;

      const eq = equityOf(s);
      if (eq > peak) { peak = eq; trough = eq; }
      if (eq < trough) trough = eq;
      maxLtvSeen = Math.max(maxLtvSeen, ltvOf(s));
    }

    return {
      equity: equityOf(s),
      peakEquity: peak,
      troughAfterPeak: trough,
      properties: s.portfolio.length,
      bankrupt: !!s.gameOver,
      bankruptYear,
      maxLtv: maxLtvSeen,
    };
  } finally {
    clearRng();
  }
}

const msek = (x: number) => (x / 1e6).toFixed(0);

suite("hävstångsbalans", () => {
  it(`jämför låg / mellan / hög belåning över ${YEARS} år`, () => {
    const strategies: { label: string; ltv: number | undefined }[] = [
      { label: "LÅG  40%", ltv: 0.4 },
      { label: "MELL 60%", ltv: 0.6 },
      { label: "HÖG  max", ltv: undefined },
    ];

    console.log(`\n${YEARS} år · ${SEEDS.length} frön\n`);
    for (const st of strategies) {
      const runs = SEEDS.map((sd) => play(sd, st.ltv, YEARS));
      const alive = runs.filter((r) => !r.bankrupt);
      const eq = runs.map((r) => r.equity).sort((a, b) => a - b);
      const median = eq[Math.floor(eq.length / 2)];
      const drawdown = runs.map((r) => (r.peakEquity > 0 ? 1 - r.troughAfterPeak / r.peakEquity : 0));
      const avgDd = drawdown.reduce((a, b) => a + b, 0) / drawdown.length;
      const props = runs.reduce((a, r) => a + r.properties, 0) / runs.length;

      console.log(
        `${st.label}  EK median ${msek(median).padStart(6)} MSEK` +
        `  spann ${msek(eq[0])}–${msek(eq[eq.length - 1])}` +
        `  hus ${props.toFixed(1)}` +
        `  konkurs ${runs.length - alive.length}/${runs.length}` +
        `  max nedgång ${(avgDd * 100).toFixed(0)}%` +
        `  topp-LTV ${(Math.max(...runs.map((r) => r.maxLtv)) * 100).toFixed(0)}%`,
      );
      for (const [i, r] of runs.entries()) {
        console.log(
          `    frö ${String(SEEDS[i]).padStart(2)}: EK ${msek(r.equity).padStart(6)} MSEK` +
          `  hus ${String(r.properties).padStart(2)}` +
          (r.bankrupt ? `  ❌ konkurs år ${r.bankruptYear}` : "  ✅"),
        );
      }
      console.log("");
    }
  }, 600_000);
});
