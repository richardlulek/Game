/* Tester för mekanikpaketet: helkvartersbonus, utvecklingsprojekt,
   detaljplaneauktioner, distriktsöden, ESG-lån och rivalagendor. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasBlockBonus, fullyOwnedBlocks } from "../engine/blocks";
import { EXPANSION_BLOCKS, PARCELS, parcelsIn, placeCity } from "../engine/city";
import { DISTRICT_TIERS, tierOfDev } from "../engine/districtTiers";
import { esgRatingOf } from "../engine/esg";
import { loanTerms } from "../engine/finance";
import { agendaFor } from "../engine/initState";
import { propAnnualOpex, propPotentialRent } from "../engine/property";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Bygger en portfölj som äger hela första centrumkvarteret. */
function ownWholeBlock() {
  const block = parcelsIn("centrum").filter((p) => p.blockId === "centrum-kv0");
  return block.map((pc, i) =>
    makeProperty({ id: 100 + i, district: "centrum", parcelId: pc.id, tenants: [makeTenantFixture({ id: 500 + i })] }),
  );
}

describe("A1: helkvartersbonus", () => {
  it("helägt kvarter ger +10 % hyra och −15 % opex", () => {
    const props = ownWholeBlock();
    const full = makeState({ portfolio: props });
    const partial = makeState({ portfolio: props.slice(0, props.length - 1) });
    const p = props[0];
    expect(hasBlockBonus(p, full)).toBe(true);
    expect(hasBlockBonus(p, partial)).toBe(false);
    expect(propPotentialRent(p, full)).toBeCloseTo(propPotentialRent(p, partial) * 1.10, 0);
    expect(propAnnualOpex(p, full)).toBeCloseTo(propAnnualOpex(p, partial) * 0.85, 0);
    expect(fullyOwnedBlocks(full)).toContain("centrum-kv0");
  });

  it("simulationen firar nya helkvarter en gång", () => {
    const s0 = makeState({ portfolio: ownWholeBlock(), ownedBlocks: [] });
    const s1 = advanceMonth(s0);
    expect(s1.ownedBlocks).toContain("centrum-kv0");
    expect(s1.log.some((l) => l.t.includes("HELKVARTER"))).toBe(true);
    const s2 = advanceMonth({ ...s1, log: [] });
    expect(s2.log.some((l) => l.t.includes("HELKVARTER"))).toBe(false);
  });
});

describe("A2: utvecklingsprojekt", () => {
  it("totalrenovering kräver vakans, tar 6 mån och ger skick/energi/hyra", () => {
    const p = makeProperty({ id: 1, condition: 55, energyClass: "D", tenants: [] });
    const s0 = makeState({ cash: 50_000_000, portfolio: [p] });
    const s1 = reducer(s0, { type: "START_RENOVATION", id: 1, kind: "totalrenovering" });
    expect(s1.portfolio[0].status).toBe("bygger");
    expect(s1.portfolio[0].renovation?.kind).toBe("totalrenovering");
    expect(s1.cash).toBeLessThan(50_000_000);
    // Med hyresgäst vägras projektet
    const busy = makeState({ cash: 50_000_000, portfolio: [makeProperty({ id: 2, tenants: [makeTenantFixture()] })] });
    expect(reducer(busy, { type: "START_RENOVATION", id: 2, kind: "totalrenovering" }).portfolio[0].status).toBe("klar");
    // Färdigställande
    let s = { ...s1, portfolio: s1.portfolio.map((x) => ({ ...x, buildLeft: 1 })) };
    s = advanceMonth(s);
    expect(s.portfolio[0].status).toBe("klar");
    expect(s.portfolio[0].condition).toBe(100);
    expect(s.portfolio[0].energyClass).toBe("A");
    expect(s.portfolio[0].renovation).toBeUndefined();
    expect(s.log.some((l) => l.t.includes("Totalrenovering klar"))).toBe(true);
  });

  it("påbyggnad ökar yta, kapacitet och värde", () => {
    const p = makeProperty({ id: 1, area: 2000, capacity: 2, tenants: [] });
    const s0 = makeState({ cash: 80_000_000, portfolio: [p] });
    let s = reducer(s0, { type: "START_RENOVATION", id: 1, kind: "påbyggnad" });
    s = { ...s, portfolio: s.portfolio.map((x) => ({ ...x, buildLeft: 1 })) };
    s = advanceMonth(s);
    expect(s.portfolio[0].area).toBe(2500);
    expect(s.portfolio[0].capacity).toBe(3);
    expect(s.portfolio[0].valueMult).toBeGreaterThan(1);
  });
});

describe("B4: detaljplaneauktioner", () => {
  const startAuction = () => {
    // absM % 30 === 0: år 2, månad 6 ⇒ 30
    const s0 = makeState({ year: 2, month: 6, cash: 60_000_000 });
    return advanceMonth(s0);
  };

  it("kommunen startar auktion var 30:e månad och blockerar månadstick", () => {
    const s1 = startAuction();
    expect(s1.auction).toBeTruthy();
    expect(s1.auction!.blockId).toBe(EXPANSION_BLOCKS[0].blockId);
    // Månadstick blockeras under auktion
    const s2 = advanceMonth(s1);
    expect(s2).toBe(s1);
  });

  it("spelaren kan vinna: betalar, kvarteret öppnas och tomter tillfaller", () => {
    let s = startAuction();
    // Ingen rival bjuder (Math.random 0.5 > aggression 0.3) → spelaren leder direkt
    s = reducer(s, { type: "AUCTION_BID" });
    expect(s.auction!.leader).toBe("player");
    const bid = s.auction!.currentBid;
    const cashBefore = s.cash;
    s = reducer(s, { type: "AUCTION_PASS" }); // klubbslag
    expect(s.auction).toBeNull();
    expect(s.cash).toBe(cashBefore - bid);
    expect(s.unlockedBlocks).toContain(EXPANSION_BLOCKS[0].blockId);
    const lots = s.lots.filter((l) => l.owned && l.parcelId?.startsWith(EXPANSION_BLOCKS[0].blockId));
    expect(lots.length).toBe(EXPANSION_BLOCKS[0].parcels);
  });

  it("placeCity använder inte låsta expansionskvarter", () => {
    const exp = PARCELS.filter((p) => p.expansion).map((p) => p.id);
    const many = Array.from({ length: 40 }, (_, i) =>
      makeProperty({ id: 300 + i, district: "innerstad", parcelId: undefined }),
    );
    const placed = placeCity(makeState({ portfolio: many }));
    for (const p of placed.portfolio) expect(exp).not.toContain(p.parcelId);
  });
});

describe("B5: distriktsöden", () => {
  it("tierOfDev följer trösklarna och statusbyte loggas", () => {
    expect(tierOfDev(0.9).id).toBe("eftersatt");
    expect(tierOfDev(1.0).id).toBe("stabilt");
    expect(tierOfDev(1.15).id).toBe("uppatgaende");
    expect(tierOfDev(1.4).id).toBe("exklusivt");
    expect(DISTRICT_TIERS).toHaveLength(4);

    const s0 = makeState({
      districtDev: { centrum: 1.29, finans: 1, innerstad: 1, hamnen: 1, industri: 1, förort: 1, kulle: 1 },
      districtTiers: { centrum: "uppatgaende", finans: "stabilt", innerstad: "stabilt", hamnen: "stabilt", industri: "stabilt", förort: "stabilt", kulle: "stabilt" },
      // Höga skick driver upp centrum över exklusivt-tröskeln
      portfolio: parcelsIn("centrum").slice(0, 6).map((pc, i) =>
        makeProperty({ id: 700 + i, district: "centrum", parcelId: pc.id, condition: 100 }),
      ),
    });
    const s1 = advanceMonth(s0);
    if ((s1.districtDev?.centrum ?? 0) >= 1.3) {
      expect(s1.log.some((l) => l.t.includes("STADSOMVANDLING"))).toBe(true);
    }
    expect(s1.districtTiers?.centrum).toBe(tierOfDev(s1.districtDev!.centrum).id);
  });
});

describe("C8: ESG och gröna lån", () => {
  it("betyget följer portföljens energiklasser och påverkar räntepåslaget", () => {
    const green = makeState({
      portfolio: [makeProperty({ id: 1, energyClass: "A" }), makeProperty({ id: 2, energyClass: "A" })],
    });
    const dirty = makeState({
      portfolio: [makeProperty({ id: 1, energyClass: "F" }), makeProperty({ id: 2, energyClass: "F" })],
    });
    expect(esgRatingOf(green).letter).toBe("A");
    expect(esgRatingOf(dirty).letter).toBe("F");
    expect(loanTerms(green).spread).toBeLessThan(loanTerms(dirty).spread);
  });

  it("betygsbyte loggas i simulationen", () => {
    const s0 = makeState({
      esgRating: "C",
      portfolio: [makeProperty({ id: 1, energyClass: "A" })],
    });
    const s1 = advanceMonth(s0);
    expect(s1.esgRating).toBe("A");
    expect(s1.log.some((l) => l.t.includes("grönt lån") || l.t.includes("ESG"))).toBe(true);
  });
});

describe("C9: rivalagendor", () => {
  it("agendor tilldelas per strategi", () => {
    expect(agendaFor("distrikt", "hamnen").kind).toBe("district");
    expect(agendaFor("tillväxt").target).toBe(25);
    expect(agendaFor("värde").kind).toBe("equity");
  });

  it("måluppfyllelse annonseras en gång", () => {
    const rival = {
      name: "Rival AB",
      cash: 1_000_000,
      units: 25,
      equity: 5_000_000,
      portfolio: Array.from({ length: 25 }, (_, i) => makeProperty({ id: 900 + i, owned: false })),
      agenda: agendaFor("tillväxt"),
    };
    const s1 = advanceMonth(makeState({ competitors: [rival] }));
    expect(s1.competitors[0].agenda?.announced).toBe(true);
    expect(s1.log.some((l) => l.t.includes("nått sitt mål"))).toBe(true);
    const s2 = advanceMonth({ ...s1, log: [] });
    expect(s2.log.some((l) => l.t.includes("nått sitt mål"))).toBe(false);
  });
});
