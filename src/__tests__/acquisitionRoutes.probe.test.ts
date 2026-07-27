/* MÄTNING: vad kostar SAMMA hus genom spelets olika förvärvsvägar?

   Sessionens ekonomiändringar – avkastningsbaserad värdering, valbar
   belåningsgrad, kreditlina mot pantutrymme – verifierades bara på vanliga
   fastighetsköp. M&A-sviterna testar förhandlingen (bud, motbud, due
   diligence, integration), inte vad affären gör med balansräkningen.

   Sonden köper ett och samma bestånd genom varje väg från identiskt
   utgångsläge och ställer utfallen bredvid varandra: pris per krona
   marknadsvärde, kontantinsats, skuld som uppstår och belåningsgrad direkt
   efter affären. Är en väg systematiskt billigare per krona bestånd är den
   dominant strategi och resten är dekoration.

   PROBE=1 npx vitest run src/__tests__/acquisitionRoutes.probe.test.ts    */
import { describe, it } from "vitest";
import { reducer } from "../engine/reducer";
import { acquisitionLtv, loanTerms, ltvOf, portfolioValue } from "../engine/finance";
import { propMarketValue } from "../engine/property";
import { divisionPrice } from "../engine/mna";
import { clearRng, seedRng } from "../engine/random";
import { makeProperty, makeState, makeTenantFixture } from "./factories";
import type { Competitor, DealFinancing, GameState, Property } from "../engine/types";

declare const process: { env: Record<string, string | undefined> };
const suite = process.env.PROBE === "1" ? describe : describe.skip;

const START_CASH = 2_000_000_000;
const UNITS = 4;

/** Fyra likadana hus i samma distrikt – beståndet som ska köpas.
 *  Utgångspriset sätts till husets FAKTISKA marknadsvärde, annars mäter
 *  jämförelsen bara hur jag råkat välja askPrice. */
function stock(ask = 0): Property[] {
  return [1, 2, 3, 4].map((i) =>
    makeProperty({
      id: 7700 + i,
      owned: false,
      status: "klar",
      district: "innerstad",
      districtName: "Inner City",
      askPrice: ask,
      baseRent: 4_800_000,
      capacity: UNITS,
      condition: 80,
      tenants: [1, 2, 3, 4].map((t) => makeTenantFixture({ id: (7700 + i) * 10 + t, rent: 100_000 })),
    }),
  );
}

function rival(portfolio: Property[]): Competitor {
  return {
    name: "Harborwick",
    cash: 20_000_000,
    units: portfolio.length,
    equity: portfolio.length * 60_000_000,
    debt: 0,
    portfolio,
    strategy: "värde",
  };
}

/** Utgångsläget: spelaren äger inget, rivalen äger beståndet. */
function base(over: Partial<GameState> = {}): GameState {
  // Två steg: bygg först för att kunna mäta marknadsvärdet, sätt sedan
  // utgångspriset till just det värdet.
  const probe = makeState({ cash: START_CASH, competitors: [rival(stock(1))] }) as GameState;
  const fair = Math.round(propMarketValue(probe.competitors[0].portfolio![0], probe));
  const props = stock(fair);
  return makeState({
    cash: START_CASH,
    debt: 0,
    reputation: 50,
    competitors: [rival(props)],
    ...over,
  }) as GameState;
}

interface Outcome {
  label: string;
  ok: boolean;
  note?: string;
  cashOut: number;
  debtAdded: number;
  properties: number;
  valueGained: number;
  ltvAfter: number;
}

/** Kör en väg och mät vad den gjorde med balansräkningen. */
function route(label: string, run: (s: GameState) => GameState, over: Partial<GameState> = {}): Outcome {
  seedRng(4242);
  try {
    const before = base(over);
    const after = run(before);
    const gained = after.portfolio.length - before.portfolio.length;
    const newest = after.log[0]?.t ?? "";
    return {
      label,
      ok: gained > 0,
      note: gained > 0 ? undefined : newest.slice(0, 90),
      cashOut: before.cash - after.cash,
      debtAdded: after.debt - before.debt,
      properties: gained,
      valueGained: portfolioValue(after) - portfolioValue(before),
      ltvAfter: ltvOf(after),
    };
  } finally {
    clearRng();
  }
}

const msek = (x: number) => (x / 1e6).toFixed(1);

function report(title: string, rows: Outcome[]): void {
  console.log(`\n═══ ${title} ═══`);
  console.log("väg                          hus   kontant     skuld    totalt   värde    pris/kr   LTV efter");
  for (const r of rows) {
    if (!r.ok) {
      console.log(`${r.label.padEnd(28)}  — gick inte igenom${r.note ? `: ${r.note}` : ""}`);
      continue;
    }
    const total = r.cashOut + r.debtAdded;
    const perKrona = r.valueGained > 0 ? total / r.valueGained : NaN;
    console.log(
      `${r.label.padEnd(28)} ${String(r.properties).padStart(3)}` +
      ` ${msek(r.cashOut).padStart(9)} ${msek(r.debtAdded).padStart(9)} ${msek(total).padStart(9)}` +
      ` ${msek(r.valueGained).padStart(8)} ${perKrona.toFixed(3).padStart(9)}` +
      ` ${(r.ltvAfter * 100).toFixed(0).padStart(9)} %`,
    );
  }
}

/** Bolagsaffär: lägg in en accepterad förhandling och stäng den. */
function closeDeal(financing: DealFinancing) {
  return (s: GameState): GameState => {
    const target = s.competitors[0];
    const offer = Math.round((target.equity ?? 0) * 1.1);
    const withDeal: GameState = {
      ...s,
      pendingDeal: { target: target.name, offer, round: 1, status: "accepted", startedAbs: 0 },
    };
    return reducer(withDeal, { type: "FINALIZE_DEAL", financing });
  };
}

suite("förvärvsvägarnas ekonomi", () => {
  it("samma bestånd, alla vägar", () => {
    const probe = base();
    const oneValue = propMarketValue(probe.competitors[0].portfolio![0], probe);
    const allValue = probe.competitors[0].portfolio!.reduce((a, p) => a + propMarketValue(p, probe), 0);
    console.log(
      `\nBeståndet: ${UNITS} hus i Inner City, ${msek(oneValue)} MSEK styck ` +
      `(${msek(allValue)} MSEK totalt). Rykte 50 ⇒ bankens tak ${(loanTerms(probe).maxLtv * 100).toFixed(1)} %.`,
    );

    const rows: Outcome[] = [
      // Ett hus i taget från öppna marknaden.
      route("Köp på marknaden (1 hus)", (s) => {
        const p = s.competitors[0].portfolio![0];
        return reducer({ ...s, listings: [p] }, { type: "BUY", id: p.id });
      }),
      // Ett hus direkt från rivalen.
      route("Bud till rival (1 hus)", (s) => {
        const p = s.competitors[0].portfolio![0];
        return reducer(s, {
          type: "OFFER_TO_RIVAL",
          competitorName: s.competitors[0].name,
          propertyId: p.id,
          amount: Math.round(propMarketValue(p, s) * 1.05),
        });
      }),
      // Hela distriktet i en affär.
      route("Divisionsaffär (4 hus)", (s) =>
        reducer(s, { type: "BUY_DIVISION", competitorName: s.competitors[0].name, district: "innerstad" }),
      ),
      // Bolaget, en gång per finansieringsform.
      ...(["kontant", "lan", "aktier", "lbo", "earnout"] as DealFinancing[]).map((f) =>
        route(`Bolagsaffär · ${f}`, closeDeal(f)),
      ),
    ];

    report("Rykte 50, ingen policy (bankens tak gäller)", rows);

    // Samma vägar med en försiktig policy: 40 % belåning vid förvärv.
    const cautious = [
      route("Köp på marknaden (1 hus)", (s) => {
        const p = s.competitors[0].portfolio![0];
        return reducer({ ...s, listings: [p] }, { type: "BUY", id: p.id });
      }, { policy: { purchaseLtv: 0.4 } }),
      route("Divisionsaffär (4 hus)", (s) =>
        reducer(s, { type: "BUY_DIVISION", competitorName: s.competitors[0].name, district: "innerstad" }),
      { policy: { purchaseLtv: 0.4 } }),
      ...(["lan", "lbo"] as DealFinancing[]).map((f) =>
        route(`Bolagsaffär · ${f}`, closeDeal(f), { policy: { purchaseLtv: 0.4 } }),
      ),
    ];
    report("Policy: 40 % belåning vid förvärv", cautious);

    const pol = base({ policy: { purchaseLtv: 0.4 } });
    console.log(
      `\nPolicyns belåningsgrad: acquisitionLtv = ${(acquisitionLtv(pol) * 100).toFixed(0)} %` +
      `  ·  bankens tak = ${(loanTerms(pol).maxLtv * 100).toFixed(1)} %` +
      `  ·  divisionspris = ${msek(divisionPrice(pol, pol.competitors[0], "innerstad"))} MSEK` +
      ` (marknadsvärde ${msek(allValue)} MSEK)\n`,
    );
  }, 600_000);
});
