import { describe, expect, it } from "vitest";
import {
  MIN_PHASE_MONTHS,
  PHASE_THRESHOLD,
  constructionShare,
  cityCreditRatio,
  cyclePressures,
  nextHeat,
  nextOverhang,
  nextPhase,
  playerMarketShare,
} from "../engine/cycle";
import { clearRng, seedRng } from "../engine/random";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { GameState } from "../engine/types";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

/* Den emergenta cykeln (masterplan fas 1): boom/bust härleds ur stadens
   obalanser i stället för en slumptimer. */

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

const fullHouse = (id: number) => makeProperty({
  id, capacity: 2,
  tenants: [makeTenantFixture({ id: id * 10 + 1 }), makeTenantFixture({ id: id * 10 + 2 })],
});
const emptyHouse = (id: number) => makeProperty({ id, capacity: 3, tenants: [] });

describe("EMERGENT CYKEL: obalanserna styr, inte timern", () => {
  it("tight marknad + billiga pengar ger boom-tryck; glut + åtstramning ger bust-tryck", () => {
    // Vakansen mäts mot sitt EMA-ankare: het stad = vakans klart UNDER
    // ankaret, kall stad = klart över.
    const hot = makeState({
      interestRate: 1.5,
      marketSentiment: 1.3,
      portfolio: [fullHouse(1), fullHouse(2), fullHouse(3)],
      marketCycle: { phase: "stable", monthsRemaining: 12, vacAnchor: 0.30 },
    });
    const ph = cyclePressures(hot);
    expect(ph.boom).toBeGreaterThanOrEqual(PHASE_THRESHOLD);
    expect(ph.drivers).toContain("tightening rental market");

    const cold = makeState({
      interestRate: 7,
      marketSentiment: 0.7,
      portfolio: [emptyHouse(1), emptyHouse(2), emptyHouse(3)],
      marketCycle: { phase: "stable", monthsRemaining: 12, vacAnchor: 0.05 },
    });
    const pc = cyclePressures(cold);
    expect(pc.bust).toBeGreaterThanOrEqual(PHASE_THRESHOLD);
    expect(pc.drivers).toContain("rising vacancies");
  });

  it("hysteres: inga fasbyten före minsta faslängd; värmen styr riktningen", () => {
    expect(nextPhase("stable", 0, 5)).toBe("stable");
    expect(nextPhase("stable", MIN_PHASE_MONTHS, 5)).toBe("boom");
    expect(nextPhase("stable", MIN_PHASE_MONTHS, -PHASE_THRESHOLD)).toBe("bust");
    // Boom kraschar direkt till bust bara vid STORA obalanser.
    expect(nextPhase("boom", 12, -(PHASE_THRESHOLD + 1.1))).toBe("bust");
    expect(nextPhase("boom", 12, 2)).toBe("boom");
    expect(nextPhase("bust", 12, 0)).toBe("stable");
    // Ihållande tryck driver upp värmen förbi tröskeln.
    seedRng(5);
    let heat = 0;
    for (let i = 0; i < 24; i++) heat = nextHeat(heat, { boom: 2.5, bust: 0, drivers: [] });
    clearRng();
    expect(heat).toBeGreaterThan(PHASE_THRESHOLD);
  });

  it("byggtakten lagras som utbudsöverhäng som klingar av", () => {
    const busy = makeState({
      portfolio: [
        ...Array.from({ length: 3 }, (_, i) => makeProperty({ id: 10 + i, status: "bygger", buildLeft: 5 })),
        ...Array.from({ length: 7 }, (_, i) => fullHouse(20 + i)),
      ],
    });
    expect(constructionShare(busy)).toBeCloseTo(0.3, 2);
    const o1 = nextOverhang(busy);
    expect(o1).toBeGreaterThan(0);
    const calm = makeState({ marketCycle: { phase: "stable", monthsRemaining: 12, overhang: 2 } });
    expect(nextOverhang(calm)).toBeLessThan(2);
  });

  it("kreditkvoten räknar hela skuldstacken mot stadens värden", () => {
    const s = makeState({
      debt: 40_000_000,
      bonds: [{ id: "b", amount: 10_000_000, rate: 4, matureAbs: 999 }],
      commercialPaper: { amount: 5_000_000, rate: 4, matureAbs: 999 },
      portfolio: [makeProperty({ id: 1, askPrice: 50_000_000 })],
      competitors: [{ name: "R", cash: 0, units: 1, equity: 0, strategy: "värde", portfolio: [makeProperty({ id: 2, askPrice: 50_000_000 })] }],
    });
    const ratio = cityCreditRatio(s);
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(1);
  });

  it("40 år: cykler uppstår naturligt utan timer, med rimliga faslängder", { timeout: 120_000 }, () => {
    seedRng(13);
    try {
      let s = makeState({
        cash: 80_000_000,
        portfolio: Array.from({ length: 6 }, (_, i) => fullHouse(100 + i)),
        competitors: [{ name: "R", cash: 30_000_000, units: 8, equity: 0, strategy: "värde", portfolio: Array.from({ length: 8 }, (_, i) => fullHouse(900 + i)) }],
      });
      let switches = 0, prev = "stable";
      let phaseLen = 0, longest = 0;
      const lens: number[] = [];
      for (let m = 0; m < 480; m++) {
        s = tick(s);
        const ph = s.marketCycle!.phase;
        if (ph !== prev) {
          lens.push(phaseLen);
          switches++;
          prev = ph;
          phaseLen = 0;
        } else {
          phaseLen++;
          longest = Math.max(longest, phaseLen);
        }
      }
      // Cykeln lever och fastnar aldrig: flera fasbyten, ingen evighetsfas.
      // (Fas-tröttheten hindrar den gamla dödsspiralen där en strukturell
      // obalans låste ekonomin i permanent bust.)
      expect(switches).toBeGreaterThanOrEqual(4);
      expect(longest).toBeLessThan(200);
      // Hysteresen håller: inga fasbyten snabbare än minsta faslängden.
      for (const len of lens) expect(len).toBeGreaterThanOrEqual(MIN_PHASE_MONTHS - 1);
    } finally { clearRng(); }
  });

  it("systemviktighet: hög andel + egna obalanser tynger cykeln, händelsen loggas en gång", () => {
    seedRng(31);
    try {
      // Spelaren äger nästan hela staden, halvtomt och överbelånat.
      const big = makeState({
        debt: 900_000_000,
        portfolio: Array.from({ length: 10 }, (_, i) => emptyHouse(500 + i)).map((p) => ({ ...p, askPrice: 100_000_000 })),
        competitors: [{ name: "R", cash: 0, units: 1, equity: 0, strategy: "värde", portfolio: [makeProperty({ id: 600, askPrice: 20_000_000 })] }],
      });
      expect(playerMarketShare(big)).toBeGreaterThan(0.4);
      const p = cyclePressures(big);
      expect(p.drivers).toContain("the dominant landlord's empty units");
      expect(p.drivers).toContain("systemic landlord over-leveraged");
      const ticked = tick(big);
      expect(ticked.log.some((l) => l.t.includes("SYSTEMICALLY IMPORTANT"))).toBe(true);
      expect(ticked.systemicNoted).toBe(true);
    } finally { clearRng(); }
  });

  it("too big to fail: krisande systemjätte erbjuds stödpaket i stället för rekonstruktion", () => {
    seedRng(37);
    try {
      const mk = () => makeState({
        cash: -1_500_000,
        crisisMonthsLeft: 6,
        portfolio: Array.from({ length: 8 }, (_, i) => fullHouse(700 + i)).map((p) => ({ ...p, askPrice: 60_000_000 })),
        competitors: [{ name: "R", cash: 0, units: 1, equity: 0, strategy: "värde", portfolio: [makeProperty({ id: 800, askPrice: 30_000_000 })] }],
      });
      const s = advanceMonth({ ...mk(), auction: undefined });
      expect(s.pendingDecision?.id).toBe("tbtf_bailout");
      expect(s.receivership).toBeUndefined();
      // Acceptera: kassainjektion + covenants + rep-smäll.
      const accepted = reducer(s, { type: "RESOLVE_DECISION", optionIndex: 0 });
      expect(accepted.cash).toBeGreaterThan(0);
      expect(accepted.restructuringTerms).toBeDefined();
      // Avböj: vanlig rekonstruktion öppnas.
      const refused = reducer(s, { type: "RESOLVE_DECISION", optionIndex: 1 });
      expect(refused.receivership).toBeDefined();
    } finally { clearRng(); }
  });
});
