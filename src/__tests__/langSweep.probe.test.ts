/* Engångssond för språksvepet: kör motorn några år och flagga varje
   loggrad och nyhetstext som innehåller svenska. Körs med PROBE=1,
   ingår inte i standardsviten. */
import { describe, expect, it } from "vitest";
import { advanceMonth } from "../engine/simulation";
import { devSeed } from "../engine/devSeed";
import { initState } from "../engine/initState";
import { placeCity } from "../engine/city";
import { seedRng, _resetIdCounter } from "../engine/random";
import type { GameState } from "../engine/types";

declare const process: { env: Record<string, string | undefined> };
const suite = process.env.PROBE === "1" ? describe : describe.skip;

suite("språksvep: motorn skriver engelska", () => {
  it("48 månader över 3 seeds – ingen svensk text i logg eller nyheter", () => {
    const bad = new Set<string>();
    for (const seed of [11, 22, 33]) {
      seedRng(seed);
      _resetIdCounter();
      let s: GameState = devSeed(placeCity(initState()));
      for (let m = 0; m < 48; m++) {
        s = advanceMonth({ ...s, pendingDecision: null, auction: undefined });
        for (const l of s.log) if (/[åäöÅÄÖ]/.test(l.t)) bad.add(l.t.slice(0, 100));
        for (const st of s.stocks ?? []) {
          for (const n of st.newsHistory ?? []) {
            if (/[åäöÅÄÖ]/.test(n.text)) bad.add(n.text.slice(0, 100));
          }
        }
      }
    }
    if (bad.size) console.log("SVENSKA KVAR:\n" + [...bad].join("\n"));
    expect([...bad]).toEqual([]);
  });
});
