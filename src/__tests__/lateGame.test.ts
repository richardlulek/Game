/* Tester för slutspelet: institutionella fonder, aktivistfonden,
   Konkurrensverket, fastighetskrisen, megaprojekt, dynastipoäng
   samt ägarens privata förmögenhet (utdelningar → lyxköp). */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loanTerms } from "../engine/finance";
import {
  ACTIVIST_TAKEOVER_AT,
  LUXURIES,
  MEGA_PROJECTS,
  activistTick,
  districtShareOf,
  dividendRelief,
  dynastyScore,
  shouldTriggerCrisis,
} from "../engine/lateGame";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { Competitor, Property } from "../engine/types";
import { makeProperty, makeState } from "./factories";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

/* ── A1: Institutionella fonder ────────────────────────────────────── */

describe("institutionella fonder", () => {
  it("kliver in när spelarens eget kapital passerar tröskeln", () => {
    const s0 = makeState({ cash: 500_000_000 });
    const s1 = advanceMonth(s0);
    const funds = s1.competitors.filter((c) => c.institutional);
    expect(funds).toHaveLength(2);
    expect(funds.map((f) => f.name)).toContain("Meridian Global Partners");
    expect(funds.every((f) => f.cash > 100_000_000)).toBe(true);
    expect(s1.log.some((l) => l.t.includes("INTERNATIONAL CAPITAL"))).toBe(true);
  });

  it("hålls kapitaliserade i nivå med spelaren (kapitalinjektion)", () => {
    const fund: Competitor = {
      name: "Meridian Global Partners",
      cash: 1_000_000,
      units: 0,
      equity: 1_000_000,
      portfolio: [],
      institutional: true,
    };
    const s1 = advanceMonth(makeState({ cash: 500_000_000, competitors: [fund] }));
    // fundsActive → ingen ny spawn, men den fattiga fonden fylls på.
    expect(s1.competitors.filter((c) => c.institutional)).toHaveLength(1);
    expect(s1.competitors[0].cash).toBeGreaterThan(100_000_000);
  });
});

/* ── A2/A3: Aktivistfonden ─────────────────────────────────────────── */

describe("aktivistfonden", () => {
  it("död kassa och svag avkastning bygger positionen", () => {
    const tick = activistTick(100_000_000, 100_000_000, 0); // idle 100 %, ROE 0
    expect(tick.delta).toBe(2.5);
    expect(tick.reason).toContain("död kassa");
    expect(tick.reason).toContain("svag avkastning");
  });

  it("stark ROE och arbetande kassa säljer av positionen", () => {
    expect(activistTick(10_000_000, 100_000_000, 10_000_000).delta).toBe(-1); // ROE 10 %
    expect(activistTick(10_000_000, 100_000_000, 6_000_000).delta).toBe(-0.5); // ROE 6 %, idle 10 %
  });

  it("utdelning blidkar: relief växer med andel av EK, tak 10", () => {
    expect(dividendRelief(2_000_000, 100_000_000)).toBeCloseTo(3);
    expect(dividendRelief(50_000_000, 100_000_000)).toBe(10);
    expect(dividendRelief(1_000_000, 0)).toBe(0);
  });

  it("vid 50 % ägarandel tas bolaget över — game over", () => {
    const s0 = makeState({
      cash: 100_000_000, // idle kassa utan portfölj → aktivisten köper
      ipoActive: true,
      takeoverPressure: ACTIVIST_TAKEOVER_AT - 1,
    });
    const s1 = advanceMonth(s0);
    expect(s1.takeoverPressure).toBeGreaterThanOrEqual(ACTIVIST_TAKEOVER_AT);
    expect(s1.gameOver).toBe(true);
    expect(s1.log.some((l) => l.t.includes("HOSTILE TAKEOVER"))).toBe(true);
  });

  it("PAY_DIVIDEND fyller ägarens plånbok och lugnar aktivisten", () => {
    const s0 = makeState({ cash: 10_000_000, takeoverPressure: 30 });
    const s1 = reducer(s0, { type: "PAY_DIVIDEND", amount: 5_000_000 });
    expect(s1.cash).toBe(5_000_000);
    expect(s1.ownerWealth).toBe(5_000_000);
    expect(s1.dividendsPaid).toBe(5_000_000);
    expect(s1.takeoverPressure).toBe(20); // relief 10 (taket)
  });
});

/* ── B4: Konkurrensverket ──────────────────────────────────────────── */

const centrumHus = (id: number, over: Partial<Property> = {}) =>
  makeProperty({ id, district: "centrum", districtName: "Centrum", ...over });

describe("konkurrensverket", () => {
  it("distriktsandelen är 0 tills marknaden har minst 6 kända fastigheter", () => {
    const litet = makeState({ portfolio: [centrumHus(1)] });
    expect(districtShareOf(litet, "centrum")).toBe(0);

    const stort = makeState({
      portfolio: [1, 2, 3, 4, 5].map((i) => centrumHus(i)),
      listings: [centrumHus(99, { owned: false })],
    });
    expect(districtShareOf(stort, "centrum")).toBeCloseTo(5 / 6);
  });

  it("dominans utlöser review fee på 5 % vid köp", () => {
    const listing = centrumHus(99, { owned: false, askPrice: 10_000_000 });
    const dominant = makeState({
      cash: 20_000_000,
      portfolio: [1, 2, 3, 4, 5].map((i) => centrumHus(i)),
      listings: [listing],
    });
    const down = listing.askPrice * (1 - loanTerms(dominant).maxLtv);
    const s1 = reducer(dominant, { type: "BUY", id: 99 });
    expect(s1.cash).toBe(dominant.cash - down - 500_000); // + 5 % avgift
    expect(s1.log[0].t).toContain("review fee");

    // Utan dominans (liten marknad) → ingen avgift.
    const liten = makeState({ cash: 20_000_000, portfolio: [centrumHus(1)], listings: [listing] });
    const s2 = reducer(liten, { type: "BUY", id: 99 });
    expect(s2.cash).toBe(liten.cash - listing.askPrice * (1 - loanTerms(liten).maxLtv));
  });

  it("dominans ≥ 50 % ger löpande tillsynsavgift", () => {
    const s0 = makeState({
      month: 3, // avgiftsnotisen loggas kvartalsvis
      cash: 50_000_000,
      portfolio: [1, 2, 3, 4, 5, 6].map((i) => centrumHus(i)),
    });
    const s1 = advanceMonth(s0);
    expect(s1.log.some((l) => l.t.includes("Supervision fee"))).toBe(true);
  });
});

/* ── B5: Fastighetskrisen ──────────────────────────────────────────── */

describe("fastighetskrisen", () => {
  it("utlöses bara när bubblan är uppblåst", () => {
    expect(shouldTriggerCrisis(1.2, 0.5)).toBe(true);
    expect(shouldTriggerCrisis(1.05, 0.5)).toBe(false);
    expect(shouldTriggerCrisis(1.2, 0.7)).toBe(false);
  });

  it("första halvan faller värdena, andra halvan bottnar de ur", () => {
    const fall = advanceMonth(makeState({ crisisMonthsLeft: 14, marketMod: 1.0 }));
    expect(fall.marketMod).toBeLessThan(1.0);
    expect(fall.crisisMonthsLeft).toBe(13);

    const botten = advanceMonth(makeState({ crisisMonthsLeft: 5, marketMod: 0.9 }));
    expect(botten.marketMod).toBeGreaterThan(0.9);
    expect(botten.crisisMonthsLeft).toBe(4);
  });

  it("kreditmarknaden är stängd: varken refinansiering eller obligationer", () => {
    const s0 = makeState({
      crisisMonthsLeft: 5,
      cash: 1_000_000,
      reputation: 80,
      portfolio: [makeProperty({ askPrice: 10_000_000 })],
    });
    const s1 = reducer(s0, { type: "REFINANCE", amount: 1_000_000 });
    expect(s1.debt).toBe(0);
    expect(s1.cash).toBe(1_000_000);
    expect(s1.log[0].t).toContain("credit market is closed");

    const s2 = reducer(s0, { type: "ISSUE_BOND", amount: 5_000_000, years: 5 });
    expect(s2.bonds ?? []).toHaveLength(0);
    expect(s2.log[0].t).toContain("bond market is frozen");

    // Kontroll: samma emission går igenom utan kris.
    const s3 = reducer({ ...s0, crisisMonthsLeft: 0 }, { type: "ISSUE_BOND", amount: 5_000_000, years: 5 });
    expect(s3.bonds).toHaveLength(1);
  });
});

/* ── C6: Megaprojekt ───────────────────────────────────────────────── */

describe("megaprojekt", () => {
  it("kräver gott rykte och etablerat bolag – inte längre helägt kvarter", () => {
    const s0 = makeState({ cash: 400_000_000, reputation: 40, companyLevel: 4 });
    const s1 = reducer(s0, { type: "START_MEGA", projectId: "arena" });
    expect(s1.megaActive ?? []).toHaveLength(0);
    expect(s1.log[0].t).toContain("reputation");
  });

  it("byggstartar som landmärke och invigs när tiden gått", () => {
    const arena = MEGA_PROJECTS.find((m) => m.id === "arena")!;
    const s0 = makeState({ cash: 400_000_000, reputation: 70, companyLevel: 4 });
    const s1 = reducer(s0, { type: "START_MEGA", projectId: "arena" });
    expect(s1.cash).toBe(400_000_000 - arena.cost);
    expect(s1.megaActive).toHaveLength(1);
    expect(s1.megaActive![0].monthsLeft).toBe(arena.months);
    expect(s1.megaActive![0].district).toBe(arena.site.district);

    // Sista månaden tickar ut → invigning med distriktslyft.
    const nästan = { ...s1, megaActive: [{ ...s1.megaActive![0], monthsLeft: 1 }] };
    const klar = advanceMonth(nästan);
    expect(klar.megaActive ?? []).toHaveLength(0);
    expect(klar.megaCompleted).toContain("arena");
    expect(klar.districtDev![arena.site.district]).toBeGreaterThan(s0.districtDev![arena.site.district] ?? 1);
    expect(klar.log.some((l) => l.t.includes("OPENING"))).toBe(true);
  });

  it("samma projekt kan inte startas två gånger", () => {
    let s = makeState({ cash: 1_000_000_000, reputation: 70, companyLevel: 5 });
    s = reducer(s, { type: "START_MEGA", projectId: "arena" });
    s = reducer(s, { type: "START_MEGA", projectId: "arena" });
    expect(s.megaActive).toHaveLength(1);
  });
});

/* ── Ägarens förmögenhet & dynastipoäng ────────────────────────────── */

describe("ägarens lyxliv", () => {
  it("BUY_LUXURY betalas med privata pengar och ägs bara en gång", () => {
    const s0 = makeState({ cash: 0, ownerWealth: 5_000_000 });
    const s1 = reducer(s0, { type: "BUY_LUXURY", luxuryId: "sportbil" });
    expect(s1.ownerWealth).toBe(2_000_000);
    expect(s1.ownerLuxuries).toEqual(["sportbil"]);
    expect(s1.cash).toBe(0); // bolagets kassa rörs inte

    const s2 = reducer(s1, { type: "BUY_LUXURY", luxuryId: "sportbil" });
    expect(s2.ownerWealth).toBe(2_000_000); // redan ägd → inget dras
  });

  it("för dyr lyx nekas, och yachten ger anseende", () => {
    const fattig = reducer(makeState({ ownerWealth: 1_000_000 }), { type: "BUY_LUXURY", luxuryId: "yacht" });
    expect(fattig.ownerLuxuries ?? []).toHaveLength(0);

    const rik = reducer(makeState({ ownerWealth: 30_000_000, reputation: 50 }), { type: "BUY_LUXURY", luxuryId: "yacht" });
    expect(rik.ownerLuxuries).toEqual(["yacht"]);
    expect(rik.reputation).toBe(52);
  });
});

describe("dynastipoäng", () => {
  it("summerar utdelningar, lyx och megaprojekt till ett betyg", () => {
    const yacht = LUXURIES.find((l) => l.id === "yacht")!;
    const dyn = dynastyScore(
      makeState({
        dividendsPaid: 200_000_000, // 100 p
        ownerLuxuries: ["yacht", "stiftelse"], // 100 + 400 p
        megaCompleted: ["arena"], // 400 p
      }),
    );
    expect(dyn.utdelningar).toBe(100);
    expect(dyn.lyxOchDonationer).toBe(yacht.dynasty + 400);
    expect(dyn.megaprojekt).toBe(400);
    expect(dyn.total).toBe(1000);
    expect(dyn.grade).toBe("S");
  });

  it("utan arv blir betyget E — pengarna dog med bolaget", () => {
    const dyn = dynastyScore(makeState({}));
    expect(dyn.total).toBe(0);
    expect(dyn.grade).toBe("E");
  });
});
