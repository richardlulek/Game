/* Seedad RNG: samma frö + samma händelsesekvens ⇒ identiskt utfall.
   Skyddar determinism-kontraktet som store/gameStore-boundaryn bygger på. */

import { afterEach, describe, expect, it } from "vitest";
import { initState } from "../engine/initState";
import { advanceMonth } from "../engine/simulation";
import { _resetIdCounter, clearRng, seedRng } from "../engine/random";

/** Kör ett helt parti från ett frö och samma sekvens (12 månader). */
function run(seed: number) {
  seedRng(seed);        // seeda PRNG:n som boundaryn annars gör
  _resetIdCounter(1);   // samma id-ström varje körning
  let s = initState({ seed });
  for (let i = 0; i < 12; i++) s = advanceMonth(s);
  return s;
}

afterEach(() => {
  clearRng();           // lämna inte det seedade läget kvar för andra tester
  _resetIdCounter(1);
});

describe("seedad RNG är deterministisk", () => {
  it("samma frö + sekvens ger identiskt tillstånd", () => {
    expect(run(1234567)).toEqual(run(1234567));
  });

  it("olika frö ger olika tillstånd", () => {
    const a = run(1234567);
    const b = run(7654321);
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a));
  });
});
