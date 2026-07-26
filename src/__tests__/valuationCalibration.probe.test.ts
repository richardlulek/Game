/* MÄTNING (inte ett skydd): vilken direktavkastning implicerar den nuvarande
   tillgångsbaserade värderingen? Används för att kalibrera den inkomst-
   baserade komponenten så att ett stabiliserat objekt värderas ~lika som
   förut – annars kastas hela balansen omkull.
   Kör:  PROBE=1 npx vitest run src/__tests__/capRateCalibration.probe.test.ts */
import { describe, it } from "vitest";
import { initState } from "../engine/initState";
import { placeCity } from "../engine/city";
import { advanceMonth } from "../engine/simulation";
import { propAnnualOpex, propMarketValue, propPotentialRent } from "../engine/property";
import { PROP_TYPES } from "../engine/data";
import type { PropTypeKey } from "../engine/types";

declare const process: { env: Record<string, string | undefined> };
const suite = process.env.PROBE === "1" ? describe : describe.skip;

suite("implicit direktavkastning i nuvarande värdering", () => {
  it("mäter stabiliserat driftnetto / marknadsvärde", () => {
    let s = placeCity(initState());
    // Samla objekt över tid – startläget har bara en handfull annonser.
    const seen = new Map<number, { p: (typeof s.listings)[number]; state: typeof s }>();
    for (let m = 0; m < 120; m++) {
      for (const p of [...s.listings, ...s.portfolio]) {
        if (p.status === "klar" && !seen.has(p.id)) seen.set(p.id, { p, state: s });
      }
      s = advanceMonth({ ...s, pendingDecision: null, auction: undefined });
    }
    const all = [...seen.values()];

    const byType = new Map<string, number[]>();
    const byDistrict = new Map<string, number[]>();
    const overall: number[] = [];

    for (const { p, state } of all) {
      const value = propMarketValue(p, state);
      if (value <= 0) continue;
      const stabilisedNOI = propPotentialRent(p, state) - propAnnualOpex(p, state);
      const cap = stabilisedNOI / value;
      if (!Number.isFinite(cap)) continue;
      overall.push(cap);
      (byType.get(p.type) ?? byType.set(p.type, []).get(p.type)!).push(cap);
      (byDistrict.get(p.district) ?? byDistrict.set(p.district, []).get(p.district)!).push(cap);
    }

    const med = (xs: number[]) => {
      const a = [...xs].sort((x, y) => x - y);
      return a.length ? a[Math.floor(a.length / 2)] : NaN;
    };
    const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

    console.log(`\nOBJEKT: ${overall.length}`);
    console.log(`MEDIAN implicit yield: ${pct(med(overall))}`);
    console.log(`  min ${pct(Math.min(...overall))}  max ${pct(Math.max(...overall))}`);

    console.log("\nPER TYP:");
    for (const [t, xs] of [...byType.entries()].sort()) {
      const def = PROP_TYPES[t as PropTypeKey];
      console.log(
        `  ${t.padEnd(10)} n=${String(xs.length).padStart(3)}  median ${pct(med(xs))}` +
        `   (rentFactor ${def.rentFactor} · opexFactor ${def.opexFactor})`,
      );
    }

    console.log("\nPER DISTRIKT:");
    for (const [d, xs] of [...byDistrict.entries()].sort()) {
      console.log(`  ${d.padEnd(11)} n=${String(xs.length).padStart(3)}  median ${pct(med(xs))}`);
    }
    console.log("");
  });
});
