/* Tester för Uthyrning 2.0: ansökningsflöde, kontraktspaket, nöjdhet,
   kvartersmix, ankaravtal, bostadskö, besittningsskydd, mäklaruppdrag
   och lokalanpassning (single/multi-tenant). */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parcelsIn } from "../engine/city";
import {
  BROKER_FEE,
  CONTRACTS,
  applicationRate,
  bestApplication,
  blockMixFor,
  makeApplication,
  maxCapacityFor,
  signContract,
} from "../engine/leasing";
import { propAnnualOpex, propPotentialRent } from "../engine/property";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { Application } from "../engine/types";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

let appSeq = 9000;
function makeApp(over: Partial<Application["tenant"]> = {}, appOver: Partial<Application> = {}): Application {
  appSeq += 1;
  return {
    id: appSeq,
    tenant: makeTenantFixture({ id: 800, rent: 12_000, quality: 1.0, ...over }),
    expiresAbs: 99,
    ...appOver,
  };
}

describe("U1: ansökningsflödet", () => {
  it("lägre utgångshyra ger fler förväntade ansökningar", () => {
    const s = makeState({});
    const cheap = makeProperty({ id: 1, askRentPct: 0.85, tenants: [] });
    const fair = makeProperty({ id: 2, askRentPct: 1.0, tenants: [] });
    const pricey = makeProperty({ id: 3, askRentPct: 1.25, tenants: [] });
    expect(applicationRate(cheap, s, 1)).toBeGreaterThan(applicationRate(fair, s, 1));
    expect(applicationRate(fair, s, 1)).toBeGreaterThan(applicationRate(pricey, s, 1));
    // Rätt prissatt vakans: ungefär en ansökan per plats och månad
    expect(applicationRate(fair, s, 1)).toBeGreaterThan(0.8 * fair.capacity);
  });

  it("ansökningar strömmar in i simulationen och utgångna rensas", () => {
    const p = makeProperty({ id: 1, tenants: [], applications: [] });
    const s1 = advanceMonth(makeState({ portfolio: [p] }));
    expect((s1.portfolio[0].applications ?? []).length).toBeGreaterThan(0);
    // Utgången ansökan försvinner
    const stale = makeApp({}, { expiresAbs: 5 });
    const p2 = makeProperty({ id: 2, tenants: [], applications: [stale], capacity: 2 });
    const s2 = advanceMonth(makeState({ year: 1, month: 6, portfolio: [p2] })); // absM = 18 > 5
    expect((s2.portfolio[0].applications ?? []).some((a) => a.id === stale.id)).toBe(false);
  });

  it("LEASE accepterar bästa ansökan; utan ansökningar händer inget", () => {
    const good = makeApp({ id: 801, rent: 15_000, quality: 1.1 });
    const bad = makeApp({ id: 802, rent: 9_000, quality: 0.9 });
    const p = makeProperty({ id: 1, tenants: [], applications: [bad, good], capacity: 2 });
    const s1 = reducer(makeState({ portfolio: [p] }), { type: "LEASE", id: 1 });
    expect(s1.portfolio[0].tenants[0].id).toBe(801);
    expect(s1.portfolio[0].applications).toHaveLength(1);
    const empty = makeProperty({ id: 2, tenants: [], applications: [] });
    const s2 = reducer(makeState({ portfolio: [empty] }), { type: "LEASE", id: 2 });
    expect(s2.portfolio[0].tenants).toHaveLength(0);
  });

  it("MARKET_BOOST: annonserna verkar en månad – tre ansökningar vid ticken", () => {
    const p = makeProperty({ id: 1, tenants: [], applications: [] });
    const s1 = reducer(makeState({ cash: 1_000_000, portfolio: [p] }), { type: "MARKET_BOOST", id: 1 });
    expect(s1.cash).toBe(975_000);
    expect(s1.portfolio[0].applications ?? []).toHaveLength(0); // inget direkt
    const s2 = advanceMonth(s1);
    expect((s2.portfolio[0].applications ?? []).length).toBeGreaterThanOrEqual(3);
    // Dubbelkampanj blockeras medan den första pågår.
    const dbl = reducer(s1, { type: "MARKET_BOOST", id: 1 });
    expect(dbl.cash).toBe(s1.cash);
  });
});

describe("U2/U5: kontraktspaket och ankaravtal", () => {
  it("kort ger +8 % och 12 mån, långt −5 % och 60+, ankare −15 % och 120", () => {
    const t = makeTenantFixture({ rent: 10_000, termTotal: 36 });
    expect(signContract(t, "kort")).toMatchObject({ rent: 10_800, termTotal: 12 });
    expect(signContract(t, "standard")).toMatchObject({ rent: 10_000, termTotal: 36 });
    expect(signContract(t, "långt")).toMatchObject({ rent: 9_500, termTotal: 60 });
    const anchor = signContract(t, "ankare");
    expect(anchor).toMatchObject({ rent: 8_500, termTotal: 120, anchorDeal: true });
    expect(CONTRACTS["ankare"].rentMult).toBe(0.85);
  });

  it("ACCEPT_APPLICATION signerar valt paket; ankare kräver kedja/stat", () => {
    const app = makeApp({ id: 801, rent: 10_000, profile: "smb" });
    const p = makeProperty({ id: 1, tenants: [], applications: [app] });
    const s1 = reducer(makeState({ portfolio: [p] }), {
      type: "ACCEPT_APPLICATION", id: 1, applicationId: app.id, contract: "kort",
    });
    expect(s1.portfolio[0].tenants[0].rent).toBe(10_800);
    // Ankare för icke-berättigad avvisas
    const app2 = makeApp({ id: 802 });
    const p2 = makeProperty({ id: 2, tenants: [], applications: [app2] });
    const s2 = reducer(makeState({ portfolio: [p2] }), {
      type: "ACCEPT_APPLICATION", id: 2, applicationId: app2.id, contract: "ankare",
    });
    expect(s2.portfolio[0].tenants).toHaveLength(0);
  });
});

describe("U3: nöjdhet", () => {
  it("nöjdheten driftar och djupt missnöjda kan lämna i förtid", () => {
    // Uselt skick ⇒ lågt mål ⇒ nöjdheten sjunker från 60
    const t = makeTenantFixture({ satisfaction: 60, monthsLeft: 24 });
    const p = makeProperty({ id: 1, condition: 15, tenants: [t] });
    const s1 = advanceMonth(makeState({ portfolio: [p] }));
    const after = s1.portfolio[0].tenants[0];
    expect(after.satisfaction!).toBeLessThan(60);
    // Missnöjd (<30) med random 0.02 < 0.06 ⇒ lämnar
    vi.spyOn(Math, "random").mockReturnValue(0.02);
    const t2 = makeTenantFixture({ id: 101, satisfaction: 20, monthsLeft: 24, defaultRisk: 0 });
    const p2 = makeProperty({ id: 2, condition: 15, tenants: [t2] });
    const s2 = advanceMonth(makeState({ portfolio: [p2] }));
    expect(s2.portfolio[0].tenants).toHaveLength(0);
    expect(s2.log.some((l) => l.t.includes("missnöjd"))).toBe(true);
  });
});

describe("U4: kvartersmix", () => {
  it("butik i kvarteret lyfter bostadens hyra och trivsel", () => {
    const block = parcelsIn("centrum").filter((x) => x.blockId === "centrum-kv0");
    const bostad = makeProperty({ id: 1, type: "bostad", parcelId: block[0].id });
    const butik = makeProperty({ id: 2, type: "butik", parcelId: block[1].id });
    const s = makeState({ portfolio: [bostad, butik] });
    const mix = blockMixFor(bostad, s);
    expect(mix.rentMult).toBeGreaterThan(1);
    expect(mix.satBonus).toBeGreaterThan(0);
    expect(mix.label).toContain("butik");
  });
});

describe("U6: bostadskön", () => {
  it("reglerad bostad hyr ut direkt till −20 % och bygger goodwill", () => {
    const p = makeProperty({ id: 1, type: "bostad", tenants: [], capacity: 2, regulated: true });
    const free = makeProperty({ id: 2, type: "bostad", tenants: [], capacity: 2 });
    const s0 = makeState({ portfolio: [p, free], reputation: 50 });
    // Skick 100 ⇒ fri bostad har noll vakansavdrag; reglerad = exakt 80 %.
    expect(propPotentialRent(p, s0)).toBeCloseTo(propPotentialRent(free, s0) * 0.8, 0);
    const s1 = advanceMonth(s0);
    expect(s1.portfolio[0].tenants).toHaveLength(2); // kön fyllde direkt
    expect(s1.reputation).toBeGreaterThan(50 - 1); // goodwill motverkar
    // TOGGLE bara för bostad
    const kontor = makeProperty({ id: 3, type: "kontor" });
    const s2 = reducer(makeState({ portfolio: [kontor] }), { type: "TOGGLE_REGULATED", id: 3 });
    expect(s2.portfolio[0].regulated).toBeUndefined();
  });
});

describe("U7: besittningsskydd", () => {
  it("bostad kostar 3 månadshyror att säga upp, kommersiellt 1", () => {
    const bostadT = makeTenantFixture({ id: 100, rent: 10_000 });
    const bostad = makeProperty({ id: 1, type: "bostad", tenants: [bostadT] });
    const s1 = reducer(makeState({ cash: 1_000_000, portfolio: [bostad] }), { type: "EVICT", id: 1, tenantId: 100 });
    expect(s1.cash).toBe(1_000_000 - 30_000);
    expect(s1.portfolio[0].tenants).toHaveLength(0);
    const butikT = makeTenantFixture({ id: 101, rent: 10_000 });
    const butik = makeProperty({ id: 2, type: "butik", tenants: [butikT] });
    const s2 = reducer(makeState({ cash: 1_000_000, portfolio: [butik] }), { type: "EVICT", id: 2, tenantId: 101 });
    expect(s2.cash).toBe(1_000_000 - 10_000);
  });
});

describe("U8: mäklaruppdrag", () => {
  it("mäklaren kostar vid vakans och garanterar flöde", () => {
    const p = makeProperty({ id: 1, tenants: [], applications: [], brokerMandate: true, capacity: 2 });
    const base = makeProperty({ id: 1, tenants: [], applications: [], capacity: 2 });
    const withBroker = advanceMonth(makeState({ cash: 10_000_000, portfolio: [p] }));
    const without = advanceMonth(makeState({ cash: 10_000_000, portfolio: [base] }));
    // Arvodet syns som kassaskillnad (enkelbokfört via NOI)
    expect(without.cash - withBroker.cash).toBe(BROKER_FEE);
    expect(applicationRate(p, makeState({}), 1)).toBeGreaterThan(
      applicationRate(base, makeState({}), 1),
    );
  });
});

describe("Lokalanpassning: single/multi-tenant", () => {
  it("bygger om till 1 stor lokal med premiumhyra och lägre drift", () => {
    const p = makeProperty({ id: 1, area: 2000, capacity: 3, tenants: [] });
    expect(maxCapacityFor(p)).toBe(4);
    let s = reducer(makeState({ cash: 10_000_000, portfolio: [p] }), {
      type: "START_RENOVATION", id: 1, kind: "lokalanpassning", targetCapacity: 1,
    });
    expect(s.portfolio[0].status).toBe("bygger");
    s = { ...s, portfolio: s.portfolio.map((x) => ({ ...x, buildLeft: 1 })) };
    s = advanceMonth(s);
    const done = s.portfolio[0];
    expect(done.capacity).toBe(1);
    // Premie: högre hyra per m² och lägre opex än multi-tenant
    const multi = { ...done, capacity: 3 };
    expect(propPotentialRent(done, s)).toBeGreaterThan(propPotentialRent(multi, s));
    expect(propAnnualOpex(done, s)).toBeLessThan(propAnnualOpex(multi, s));
  });

  it("vägrar om fler är uthyrda än mållokalerna", () => {
    const p = makeProperty({
      id: 1, capacity: 3,
      tenants: [makeTenantFixture({ id: 1 }), makeTenantFixture({ id: 2 })],
    });
    const s = reducer(makeState({ cash: 10_000_000, portfolio: [p] }), {
      type: "START_RENOVATION", id: 1, kind: "lokalanpassning", targetCapacity: 1,
    });
    expect(s.portfolio[0].status).toBe("klar");
    expect(s.log[0].t).toContain("uthyrda");
  });
});
