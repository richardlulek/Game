import { describe, expect, it } from "vitest";
import { execSalaryMult, talentOf, talentStars } from "../engine/executives";
import {
  CAMPAIGN_LEAD,
  ELECTION_PERIOD,
  FAVOR_AUCTION_MULT,
  campaignDecision,
  campaignDonationSize,
  favorAuctionMult,
} from "../engine/politics";
import { salariesTotal, spreadDelta } from "../engine/progression";
import { clearRng, seedRng } from "../engine/random";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { GameState } from "../engine/types";
import { makeState } from "./factories";

/* Namngivna chefer + politik light (Capitalism Lab-luckorna 4 och 5):
   varje stabsroll besätts av en person vars talang skalar effekt och
   lön, och kommunalvalet kan påverkas med kampanjdonationer. */

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

describe("NAMNGIVNA CHEFER: personer med talang, inte anonyma nivåer", () => {
  it("HIRE_STAFF tillsätter en namngiven chef med talang 0,85–1,30", () => {
    seedRng(3);
    try {
      const s = reducer(makeState({ cash: 10_000_000 }), { type: "HIRE_STAFF", role: "cfo" });
      const exec = s.executives?.cfo;
      expect(exec).toBeDefined();
      expect(exec!.name.length).toBeGreaterThan(3);
      expect(exec!.talent).toBeGreaterThanOrEqual(0.85);
      expect(exec!.talent).toBeLessThanOrEqual(1.3);
      expect(s.log[0].t).toContain(exec!.name);
      // Befordran behåller samma person.
      const s2 = reducer({ ...s, cash: 10_000_000 }, { type: "HIRE_STAFF", role: "cfo" });
      expect(s2.executives?.cfo?.name).toBe(exec!.name);
      expect(s2.staff.cfo).toBe(2);
      // Uppsägning tar bort personen.
      const s3 = reducer(s2, { type: "FIRE_STAFF", role: "cfo" });
      expect(s3.executives?.cfo).toBeUndefined();
      expect(s3.staff.cfo).toBeUndefined();
    } finally {
      clearRng();
    }
  });

  it("talangen skalar rollens effekt och lön", () => {
    const base = { name: "Test", raises: 0, hiredAbs: 0 };
    const star = makeState({ staff: { cfo: 2 }, executives: { cfo: { ...base, talent: 1.3 } } });
    const dud = makeState({ staff: { cfo: 2 }, executives: { cfo: { ...base, talent: 0.85 } } });
    expect(talentOf(star, "cfo")).toBe(1.3);
    // CFO: −0,15 %-enheter ränta per nivå × talang.
    expect(spreadDelta(star)).toBeCloseTo(0.15 * 2 * 1.3, 5);
    expect(spreadDelta(dud)).toBeCloseTo(0.15 * 2 * 0.85, 5);
    // Lönen följer talangen – stjärnor kostar.
    expect(salariesTotal(star)).toBeGreaterThan(salariesTotal(dud));
    expect(talentStars(1.3)).toBe(5);
    expect(talentStars(0.85)).toBeLessThanOrEqual(2);
  });

  it("rekryteringsstrid: matchat bud höjer lönen, tappad chef kostar en nivå", () => {
    seedRng(7);
    try {
      const exec = { name: "Testina Provsson", talent: 1.25, raises: 0, hiredAbs: 0 };
      const decision = {
        id: "exec_poach_cfo",
        title: "t",
        text: "t",
        options: [
          { label: "m", detail: "", effect: { execRaise: "cfo", log: "stannar", logKind: "info" as const } },
          { label: "s", detail: "", effect: { execPoached: "cfo", log: "gick", logKind: "warn" as const } },
        ],
      };
      const s = makeState({ staff: { cfo: 2 }, executives: { cfo: exec }, pendingDecision: decision });
      // Matcha: permanent +25 % lön, personen kvar.
      const matched = reducer(s, { type: "RESOLVE_DECISION", optionIndex: 0 });
      expect(matched.executives?.cfo?.raises).toBe(1);
      expect(execSalaryMult(matched.executives!.cfo)).toBeCloseTo(1.25 * 1.25, 5);
      // Släpp: nivån sjunker och en ersättare med ny talang tar över.
      const lost = reducer({ ...s, pendingDecision: decision }, { type: "RESOLVE_DECISION", optionIndex: 1 });
      expect(lost.staff.cfo).toBe(1);
      expect(lost.executives?.cfo?.name).not.toBe("Testina Provsson");
    } finally {
      clearRng();
    }
  });
});

describe("POLITIK LIGHT: kampanjpengar köper välvilja i stadshuset", () => {
  it("kampanjbeslutet dyker upp tre månader före valet", () => {
    seedRng(5);
    try {
      // Månaden räknas upp i slutet av ticket: absM under ticket är 45 = 48 − 3.
      let s = makeState({ year: 3, month: 9, cash: 100_000_000 });
      s = tick(s);
      expect(s.pendingDecision?.id).toBe("election_campaign");
      expect(s.pendingDecision?.options).toHaveLength(3);
    } finally {
      clearRng();
    }
  });

  it("donationen registreras och kostar kassa", () => {
    const eq = 500_000_000;
    const d = campaignDecision(makeState({}), eq);
    const amount = campaignDonationSize(eq);
    const s = reducer(
      makeState({ cash: 50_000_000, pendingDecision: d }),
      { type: "RESOLVE_DECISION", optionIndex: 0 },
    );
    expect(s.politics?.backed).toBe("borgerlig");
    expect(s.politics?.secret).toBe(false);
    expect(s.cash).toBe(50_000_000 - amount);
    // Diskret väg: billigare, flaggad som hemlig.
    const s2 = reducer(
      makeState({ cash: 50_000_000, pendingDecision: d }),
      { type: "RESOLVE_DECISION", optionIndex: 1 },
    );
    expect(s2.politics?.secret).toBe(true);
    expect(s2.cash).toBeGreaterThan(s.cash);
  });

  it("välviljan sänker auktionsbud och tickar ned månad för månad", () => {
    seedRng(9);
    try {
      const favored = makeState({ politics: { favorMonthsLeft: 24, favorParty: "Center-right majority" } });
      expect(favorAuctionMult(favored)).toBe(FAVOR_AUCTION_MULT);
      expect(favorAuctionMult(makeState({}))).toBe(1);
      const after = tick(favored);
      expect(after.politics?.favorMonthsLeft).toBe(23);
    } finally {
      clearRng();
    }
  });

  it("valet vart 4:e år utser ett styrande parti", () => {
    seedRng(11);
    try {
      // absM under ticket är 48 = valmånad (månaden räknas upp i slutet).
      let s = makeState({ year: 3, month: 12, cash: 20_000_000 });
      s = tick(s);
      expect(s.electionResult).toBeDefined();
      expect(ELECTION_PERIOD).toBe(48);
      expect(CAMPAIGN_LEAD).toBe(3);
    } finally {
      clearRng();
    }
  });
});
