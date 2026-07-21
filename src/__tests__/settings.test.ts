/* Svårighetsgrader och Friläge-anpassningar (InitOptions). */

import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_NAMES } from "../engine/data";
import { DIFFICULTIES, difficultyById } from "../engine/difficulty";
import { initState } from "../engine/initState";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import { makeState } from "./factories";

afterEach(() => vi.restoreAllMocks());

describe("initState med InitOptions", () => {
  it("honorerar kapital, ränta, rivalantal och rivalstyrka", () => {
    const s = initState({ cash: 12_000_000, interestRate: 4.5, rivalCount: 3, rivalStrength: 1.4 });
    expect(s.cash).toBe(12_000_000);
    expect(s.interestRate).toBe(4.5);
    // Rivalantalet styr de stora bolagen; uppstickarna skalar med (3×4/7 ≈ 2).
    expect(s.competitors.filter((c) => !c.small)).toHaveLength(3);
    expect(s.competitors.filter((c) => c.small)).toHaveLength(2);
    // Styrkan skalar portföljstorleken (10 → 14).
    expect(s.competitors[0].portfolio).toHaveLength(14);
  });

  it("rivalCount 0 ger en stad utan rivaler", () => {
    const s = initState({ rivalCount: 0 });
    expect(s.competitors).toHaveLength(0);
  });

  it("utan options är allt som spelets grundbalans (och inga settings)", () => {
    const s = initState();
    expect(s.cash).toBe(5_000_000);
    expect(s.interestRate).toBe(2.5);
    expect(s.competitors.filter((c) => !c.small)).toHaveLength(AI_NAMES.length);
    expect(s.settings).toBeUndefined();
  });

  it("calmMode/noBankruptcy hamnar i settings", () => {
    const s = initState({ calmMode: true, noBankruptcy: true, difficulty: "custom" });
    expect(s.settings).toEqual({ difficulty: "custom", calmMode: true, noBankruptcy: true });
  });
});

describe("svårighetspresets", () => {
  it("lätt/normal/svår ger förväntade startvillkor", () => {
    const lätt = initState(difficultyById("lätt").options);
    const svår = initState(difficultyById("svår").options);
    expect(lätt.cash).toBe(8_000_000);
    expect(lätt.interestRate).toBe(2.0);
    expect(svår.cash).toBe(3_000_000);
    expect(svår.interestRate).toBe(3.5);
    expect(svår.competitors[0].portfolio.length).toBeGreaterThan(lätt.competitors[0].portfolio.length);
    expect(DIFFICULTIES.map((d) => d.id)).toEqual(["lätt", "normal", "svår"]);
  });

  it("RESET med options sätter settings i state", () => {
    const s = reducer(makeState(), {
      type: "RESET",
      scenarioId: "sandbox",
      options: { cash: 2_000_000, difficulty: "svår" },
    });
    expect(s.cash).toBe(2_000_000);
    expect(s.settings?.difficulty).toBe("svår");
    expect(s.scenarioId).toBe("sandbox");
  });

  it("berättelseläget ignorerar options (egen balans)", () => {
    const s = reducer(makeState(), { type: "RESET", mode: "story", options: { cash: 50_000_000 } });
    expect(s.cash).toBe(850_000);
    expect(s.settings).toBeUndefined();
  });
});

describe("lugnt läge", () => {
  it("triggar inga slumphändelser eller kriser trots maximal otur", () => {
    // Math.random 0 skulle annars trigga makrohändelse (<0.35), chockhändelse
    // (<0.03) och distrikthändelse (<0.08) varje månad.
    vi.spyOn(Math, "random").mockReturnValue(0.0);
    const calm = advanceMonth(makeState({ settings: { difficulty: "custom", calmMode: true } }));
    expect(calm.log.some((l) => l.t.startsWith("📰"))).toBe(false);
    expect(calm.log.some((l) => l.t.startsWith("🚨"))).toBe(false);
    expect(calm.recessionMonthsLeft ?? 0).toBe(0);

    const wild = advanceMonth(makeState());
    expect(wild.log.some((l) => l.t.startsWith("📰"))).toBe(true);
  });
});

describe("konkurs av", () => {
  it("kassa under −1 MSEK ger ingen gameOver när noBankruptcy är satt", () => {
    const s = advanceMonth(makeState({ cash: -1_050_000, settings: { difficulty: "custom", noBankruptcy: true } }));
    expect(s.gameOver).toBe(false);
    expect(s.log.some((l) => l.t.includes("bankruptcy is disabled"))).toBe(true);
  });

  it("utan inställningen gäller konkurs som vanligt", () => {
    const s = advanceMonth(makeState({ cash: -1_050_000 }));
    expect(s.gameOver).toBe(true);
  });
});
