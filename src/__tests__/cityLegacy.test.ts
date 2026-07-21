/* Stadsbyggnadsarvet: det du bygger ÅT staden räknas in i dynastipoängen,
   och Stadslegenden är ett vinstmål bortom förmögenhet. */

import { describe, expect, it } from "vitest";
import { dynastyScore } from "../engine/lateGame";
import { SCENARIOS } from "../engine/scenarios";
import { makeState } from "./factories";

describe("STADSBYGGNADSARVET: gärningar ger dynastipoäng", () => {
  it("byggen, projekt och stadssatsningar räknas – med tak", () => {
    const none = dynastyScore(makeState({}));
    expect(none.stadsbyggnad).toBe(0);
    const builder = dynastyScore(
      makeState({ chainCounters: { cityWorks: 4, builds: 5, renovations: 4 } }),
    );
    // 4×15 + 5×8 + 4×5 = 120
    expect(builder.stadsbyggnad).toBe(120);
    expect(builder.total).toBe(none.total + 120);
    const maxed = dynastyScore(
      makeState({ chainCounters: { cityWorks: 100, builds: 100, renovations: 100 } }),
    );
    expect(maxed.stadsbyggnad).toBe(250); // dynastin kan inte köpas med enbart spadar
  });
});

describe("STADSLEGENDEN: vinstmål bortom förmögenhet", () => {
  it("kräver 600 dynastipoäng och läser stadsbyggnadsarvet", () => {
    const sc = SCENARIOS.find((x) => x.id === "stadslegend")!;
    expect(sc.check(makeState({}))).toBe(false);
    // Utdelningar (500 p) + stadsbyggnad (120 p) ⇒ 620 ≥ 600.
    const s = makeState({
      dividendsPaid: 1_000_000_000,
      chainCounters: { cityWorks: 4, builds: 5, renovations: 4 },
    });
    expect(dynastyScore(s).total).toBeGreaterThanOrEqual(600);
    expect(sc.check(s)).toBe(true);
    expect(sc.progress(makeState({})).max).toBe(600);
  });
});
