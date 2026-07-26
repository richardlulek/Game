/* MÄTNING (körs inte i vanliga sviten): visar yieldstrukturen och hur den
   slår igenom i värdet per tillgångsslag och distrikt. Används för att
   kalibrera BASE_YIELD / DISTRICT_YIELD_MULT i engine/property.ts.
   PROBE=1 npx vitest run src/__tests__/valuationCalibration.probe.test.ts */
import { describe, it } from "vitest";
import { initState } from "../engine/initState";
import { placeCity } from "../engine/city";
import { advanceMonth } from "../engine/simulation";
import {
  propAnnualOpex, propCapRate, propMarketValue, propPotentialRent,
} from "../engine/property";
import { clearRng, seedRng } from "../engine/random";
import type { GameState, Property } from "../engine/types";

declare const process: { env: Record<string, string | undefined> };
const suite = process.env.PROBE === "1" ? describe : describe.skip;

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const med = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : NaN;
};

suite("yieldstruktur och värderingseffekt", () => {
  it("visar avkastningskrav och värde per typ och distrikt", () => {
    seedRng(4242);
    let s = placeCity(initState());
    const seen = new Map<number, { p: Property; state: GameState }>();
    for (let m = 0; m < 120; m++) {
      for (const p of [...s.listings, ...s.portfolio]) {
        if (p.status === "klar" && !seen.has(p.id)) seen.set(p.id, { p, state: s });
      }
      s = advanceMonth({ ...s, pendingDecision: null, auction: undefined });
    }
    const all = [...seen.values()];

    /** Fullt uthyrt till marknadshyra – stabiliserat läge. */
    const stabilised = (p: Property, st: GameState): Property => {
      const perUnit = propPotentialRent(p, st) / 12 / Math.max(1, p.capacity);
      return {
        ...p,
        tenants: Array.from({ length: p.capacity }, (_, i) => ({
          id: 9000 + i, profile: "smb" as const, name: "T", quality: 1,
          defaultRisk: 0.018, monthsLeft: 24, termTotal: 24, rent: perUnit,
        })),
      };
    };

    const byType = new Map<string, { cap: number[]; eff: number[] }>();
    const byDistrict = new Map<string, { cap: number[]; eff: number[] }>();
    const allEff: number[] = [];
    let totalValue = 0;

    for (const { p, state } of all) {
      const full = stabilised(p, state);
      const noi = propPotentialRent(full, state) - propAnnualOpex(full, state);
      if (noi <= 0) continue;
      const value = propMarketValue(full, state);
      const cap = propCapRate(full, state);
      const eff = noi / value; // yield på det värde spelet faktiskt sätter
      allEff.push(eff);
      totalValue += value;
      const t = byType.get(p.type) ?? { cap: [], eff: [] };
      t.cap.push(cap); t.eff.push(eff); byType.set(p.type, t);
      const d = byDistrict.get(p.district) ?? { cap: [], eff: [] };
      d.cap.push(cap); d.eff.push(eff); byDistrict.set(p.district, d);
    }

    console.log(`\nOBJEKT ${allEff.length}   TOTALVÄRDE ${(totalValue / 1e6).toFixed(0)} MSEK`);
    console.log(`effektiv yield (median) ${pct(med(allEff))}`);
    console.log("\nPER TYPSLAG        krav → effektiv yield   (önskad ordning: bostad < kontor < butik < industri)");
    for (const t of ["bostad", "kontor", "butik", "industri"]) {
      const x = byType.get(t);
      if (!x) continue;
      console.log(`  ${t.padEnd(10)} n=${String(x.cap.length).padStart(3)}  ` +
                  `krav ${pct(med(x.cap))}  →  ${pct(med(x.eff))}`);
    }
    console.log("\nPER DISTRIKT (sorterat på krav)");
    for (const [d, x] of [...byDistrict.entries()].sort((a, b) => med(a[1].cap) - med(b[1].cap))) {
      console.log(`  ${d.padEnd(11)} n=${String(x.cap.length).padStart(3)}  ` +
                  `krav ${pct(med(x.cap))}  →  ${pct(med(x.eff))}`);
    }
    console.log("");
    clearRng();
  });
});
