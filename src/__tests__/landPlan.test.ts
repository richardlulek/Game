/* Tester för markförvärv & egen detaljplan: köp av privatägda hus
   (med nejsägare och grannpremie), råmark + planprocess med
   utmaningar, parkeftergifter, organisk förtätning och att
   nyproduktion styrs till distrikt med ledig mark. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PARCELS,
  PLAN_AREAS,
  districtsWithSpace,
  emptyParcels,
  expansionByBlock,
  hasAmbientBuilding,
  parcelAt,
  parcelsIn,
} from "../engine/city";
import { newPlanProcess, planFee, planTick, rawLandPrice } from "../engine/cityPlan";
import { loanTerms } from "../engine/finance";
import { ambientAsk, ambientProfile } from "../engine/landDeals";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import { makeProperty, makeState } from "./factories";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Första dekorhus-tomten i ett distrikt (deterministisk). */
const ambientParcel = (district = "centrum") =>
  parcelsIn(district).find((p) => hasAmbientBuilding(p))!;

/* ── A: Köp av privatpersoner ──────────────────────────────────────── */

describe("köp av privatägda hus", () => {
  it("huset blir en riktig fastighet i portföljen – beståndet växer", () => {
    const pc = ambientParcel();
    const s0 = makeState({ cash: 100_000_000 });
    const deal = ambientAsk(pc, s0);
    const down = deal.ask * (1 - loanTerms(s0).maxLtv);
    const s1 = reducer(s0, { type: "BUY_AMBIENT", parcelId: pc.id });
    expect(s1.portfolio).toHaveLength(1);
    const prop = s1.portfolio[0];
    expect(prop.parcelId).toBe(pc.id); // står kvar på samma tomt
    expect(prop.owned).toBe(true);
    expect(prop.tenants.length).toBeGreaterThan(0); // bebott hus följer med
    expect(s1.cash).toBe(s0.cash - down);
    expect(s1.debt).toBe(deal.ask - down);
    expect(s1.log[0].t).toContain("OFF MARKET");
  });

  it("premien stiger när man redan äger grannar i kvarteret", () => {
    const pc = ambientParcel();
    const granne = parcelsIn("centrum").find(
      (p) => p.blockId === pc.blockId && p.id !== pc.id,
    )!;
    const utan = ambientAsk(pc, makeState({}));
    const med = ambientAsk(
      pc,
      makeState({ portfolio: [makeProperty({ id: 9, parcelId: granne.id })] }),
    );
    expect(med.ask).toBeGreaterThan(utan.ask);
  });

  it("nejsägare kräver ~50 % extra", () => {
    const holdout = PARCELS.find((p) => hasAmbientBuilding(p) && ambientProfile(p).holdout);
    expect(holdout).toBeDefined();
    const deal = ambientAsk(holdout!, makeState({}));
    expect(deal.premium).toBeGreaterThan(1.6); // 1.18 × 1.5
  });

  it("tomter med spelobjekt kan inte köpas som privathus", () => {
    const pc = ambientParcel();
    const s0 = makeState({
      cash: 100_000_000,
      portfolio: [makeProperty({ id: 5, parcelId: pc.id })],
    });
    const s1 = reducer(s0, { type: "BUY_AMBIENT", parcelId: pc.id });
    expect(s1.portfolio).toHaveLength(1); // inget nytt köp
    expect(s1.cash).toBe(100_000_000);
  });
});

/* ── B: Råmark och planprocess ─────────────────────────────────────── */

const PLAN_ID = "innerstad-plan0";

describe("råmark & detaljplan", () => {
  it("kartan har planområden som är låst expansionsmark", () => {
    expect(PLAN_AREAS.length).toBeGreaterThanOrEqual(6);
    const parcels = PARCELS.filter((p) => p.blockId === PLAN_ID);
    expect(parcels).toHaveLength(4);
    expect(parcels.every((p) => p.expansion)).toBe(true);
    expect(expansionByBlock(PLAN_ID)?.kind).toBe("plan");
    // Kommunala auktioner rör aldrig planområden.
    expect(PLAN_AREAS.every((a) => expansionByBlock(a.blockId)?.kind === "plan")).toBe(true);
  });

  it("BUY_RAW_LAND köper marken kontant, START_PLAN startar processen", () => {
    let s = makeState({ cash: 50_000_000 });
    const price = rawLandPrice(PLAN_ID, s);
    expect(price).toBeGreaterThan(0);
    s = reducer(s, { type: "BUY_RAW_LAND", blockId: PLAN_ID });
    expect(s.ownedPlanAreas).toEqual([PLAN_ID]);
    expect(s.cash).toBe(50_000_000 - price);

    const fee = planFee(PLAN_ID);
    s = reducer(s, { type: "START_PLAN", blockId: PLAN_ID });
    expect(s.planProcesses).toHaveLength(1);
    expect(s.planProcesses![0].stage).toBe("samråd");
    expect(s.cash).toBe(50_000_000 - price - fee);
  });

  it("planen kan inte startas utan råmark", () => {
    const s = reducer(makeState({ cash: 50_000_000 }), { type: "START_PLAN", blockId: PLAN_ID });
    expect(s.planProcesses ?? []).toHaveLength(0);
  });

  it("laga kraft ger spelaren byggklara tomter på kvarteret", () => {
    // Snabbspola: process med 1 månad kvar i granskning, överklagan avklarad.
    let s = makeState({
      cash: 20_000_000,
      ownedPlanAreas: [PLAN_ID],
      planProcesses: [
        { ...newPlanProcess(PLAN_ID, makeState({})), stage: "granskning", monthsLeft: 1, challenges: ["samråd", "överklagan", "arkeologi"] },
      ],
    });
    s = advanceMonth(s);
    expect(s.planProcesses).toHaveLength(0);
    expect(s.unlockedBlocks).toContain(PLAN_ID);
    expect(s.ownedPlanAreas).toHaveLength(0);
    const mina = s.lots.filter((l) => l.owned && l.parcelId?.startsWith(PLAN_ID));
    expect(mina).toHaveLength(4);
    expect(s.log.some((l) => l.t.includes("LAGA KRAFT"))).toBe(true);
  });
});

/* ── C: Utmaningar i processen ─────────────────────────────────────── */

describe("planprocessens utmaningar", () => {
  it("dåligt anseende ger protester i samrådet, gott anseende snabbar på", () => {
    const proc = { ...newPlanProcess(PLAN_ID, makeState({})), monthsLeft: newPlanProcess(PLAN_ID, makeState({})).totalMonths - 4 };
    vi.restoreAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0.99); // inga slumputmaningar
    const dålig = planTick({ ...proc }, makeState({ reputation: 30 }), Math.random);
    expect(dålig.events.some((e) => e.t.includes("Protester"))).toBe(true);
    const bra = planTick({ ...proc }, makeState({ reputation: 80 }), Math.random);
    expect(bra.events.some((e) => e.t.includes("gick din väg"))).toBe(true);
    expect(bra.proc.monthsLeft).toBeLessThan(dålig.proc.monthsLeft);
  });

  it("överklagande ger beslut med förlikning som kortar tiden", () => {
    const base = { ...newPlanProcess(PLAN_ID, makeState({})), stage: "granskning" as const, challenges: ["samråd"] };
    vi.restoreAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0.1); // < 0.30 → överklagan
    const res = planTick(base, makeState({ reputation: 50 }), Math.random);
    expect(res.proc.stage).toBe("överklagad");
    expect(res.decision).toBeDefined();

    // Förlikning via RESOLVE_DECISION: −5 mån och tillbaka till granskning.
    const s0 = makeState({ cash: 10_000_000, planProcesses: [res.proc], pendingDecision: res.decision! });
    const s1 = reducer(s0, { type: "RESOLVE_DECISION", optionIndex: 0 });
    expect(s1.cash).toBe(8_500_000);
    expect(s1.planProcesses![0].monthsLeft).toBe(res.proc.monthsLeft - 5);
    expect(s1.planProcesses![0].stage).toBe("granskning");
  });

  it("strandskydd i vattennära område avstår en tomt som park", () => {
    const kust = newPlanProcess("hamnen-plan0", makeState({}));
    const proc = { ...kust, monthsLeft: kust.totalMonths - 4 };
    vi.restoreAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const res = planTick(proc, makeState({ reputation: 50 }), Math.random);
    expect(res.proc.parkParcels).toHaveLength(1);
    expect(res.events.some((e) => e.t.includes("Strandskydd"))).toBe(true);
  });
});

/* ── Naturlig tillväxt & ekosystemet ───────────────────────────────── */

describe("naturlig tillväxt", () => {
  it("staden förtätas: dekorhus växer fram på tom mark i högkonjunktur", () => {
    vi.restoreAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0.05); // under tillväxtchansen
    const s0 = makeState({ marketCycle: { phase: "boom", monthsRemaining: 10 } });
    const s1 = advanceMonth(s0);
    expect((s1.ambientGrown ?? []).length).toBeGreaterThan(0);
    // Det framvuxna huset räknas som bebyggt av kartan och motorn.
    const grownId = s1.ambientGrown![0];
    const pc = PARCELS.find((p) => p.id === grownId)!;
    expect(hasAmbientBuilding(pc, new Set(s1.ambientGrown))).toBe(true);
  });

  it("markbrist tidigarelägger kommunens detaljplaneauktion", () => {
    // Ockupera nästan all tom mark → färre än 5 lediga tomter.
    const empties = emptyParcels(makeState({}));
    const props = empties.slice(0, empties.length - 2).map((p, i) =>
      makeProperty({ id: 1000 + i, district: p.district, parcelId: p.id }),
    );
    const s0 = makeState({ month: 2, year: 3, portfolio: props }); // absM % 30 ≠ 0
    const s1 = advanceMonth(s0);
    expect(s1.auction).toBeTruthy();
    expect(s1.log.some((l) => l.t.includes("tidigarelägga"))).toBe(true);
  });

  it("nyproduktion väljer bara distrikt med ledig mark", () => {
    const s = makeState({});
    const space = districtsWithSpace(s);
    expect(space.size).toBeGreaterThan(0);
    // Fyll centrum helt → centrum försvinner ur poolen.
    const centrumEmpties = emptyParcels(s).filter((p) => p.district === "centrum");
    const s2 = makeState({
      portfolio: centrumEmpties.map((p, i) => makeProperty({ id: 2000 + i, parcelId: p.id })),
    });
    expect(districtsWithSpace(s2).has("centrum")).toBe(false);
  });

  it("parktomter är aldrig byggbara", () => {
    const parcels = PARCELS.filter((p) => p.blockId === "hamnen-plan0");
    const s = makeState({
      unlockedBlocks: ["hamnen-plan0"],
      parkParcels: [parcels[0].id],
    });
    expect(emptyParcels(s).some((p) => p.id === parcels[0].id)).toBe(false);
  });

  it("parcelAt hittar tomten under en världspunkt", () => {
    const pc = PARCELS[0];
    expect(parcelAt(pc.x, pc.z)?.id).toBe(pc.id);
    expect(parcelAt(9999, 9999)).toBeUndefined();
  });
});
