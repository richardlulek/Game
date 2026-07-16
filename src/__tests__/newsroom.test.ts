/* Tester för redaktionens rena hjälpfunktioner: redaktionella råd,
   marknadsprognos och artikelnavigering. */

import { describe, expect, it } from "vitest";
import { articleTarget, editorNotes, makeScandal, marketForecast, scandalRisk, upcomingHeadlines } from "../engine/newsroom";
import { reducer } from "../engine/reducer";
import type { LogEntry } from "../engine/types";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

describe("editorNotes", () => {
  it("ger inga råd för ett tomt, sunt bolag", () => {
    const s = makeState({ cash: 1_000_000 });
    expect(editorNotes(s)).toHaveLength(0);
  });

  it("varnar för hög hävstång och pekar mot Finans", () => {
    // Liten portfölj med stor skuld → LTV nära taket.
    const p = makeProperty({ askPrice: 1_000_000, purchasePrice: 1_000_000 });
    const s = makeState({ portfolio: [p], debt: 26_000_000, reputation: 50 });
    const note = editorNotes(s).find((n) => n.id === "leverage");
    expect(note).toBeDefined();
    expect(note!.target).toBe("finance");
  });

  it("uppmärksammar tomma lägenheter och pekar mot Tenants", () => {
    const empty = makeProperty({ capacity: 4, tenants: [] });
    const s = makeState({ portfolio: [empty] });
    const note = editorNotes(s).find((n) => n.id === "vacancy");
    expect(note).toBeDefined();
    expect(note!.target).toBe("tenants");
  });

  it("flaggar väntande kontraktsförnyelser", () => {
    const s = makeState({
      portfolio: [makeProperty({ tenants: [makeTenantFixture()] })],
      pendingRenewals: [
        { propertyId: 1, tenantId: 9, tenantName: "X", districtName: "Downtown", currentRent: 1000, termTotal: 12 },
      ],
    });
    const note = editorNotes(s).find((n) => n.id === "renewals");
    expect(note).toBeDefined();
  });

  it("sorterar efter akutgrad (mest akut först)", () => {
    const p = makeProperty({ capacity: 4, tenants: [], askPrice: 1_000_000, purchasePrice: 1_000_000 });
    const s = makeState({ portfolio: [p], debt: 26_000_000 });
    const notes = editorNotes(s);
    expect(notes.length).toBeGreaterThan(1);
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i - 1].priority).toBeGreaterThanOrEqual(notes[i].priority);
    }
  });
});

describe("marketForecast", () => {
  it("förutspår att en boom svalnar när tiden är kort", () => {
    const s = makeState({ marketCycle: { phase: "boom", monthsRemaining: 3 } });
    expect(marketForecast(s)).toMatch(/boom to cool within 3/i);
  });

  it("förutspår återhämtning i en kort nedgång", () => {
    const s = makeState({ marketCycle: { phase: "bust", monthsRemaining: 2 } });
    expect(marketForecast(s)).toMatch(/recovery/i);
  });

  it("läser en stigande stämningstrend i en stabil marknad", () => {
    const s = makeState({ sentimentHistory: [1.0, 1.02, 1.05] });
    expect(marketForecast(s)).toMatch(/firming/i);
  });
});

describe("upcomingHeadlines", () => {
  it("är tom utan kända framtida händelser", () => {
    expect(upcomingHeadlines(makeState())).toHaveLength(0);
  });

  it("listar en detaljplan med ETA och distrikt", () => {
    const s = makeState({
      planProcesses: [
        {
          blockId: "b1", district: "hamnen", districtName: "The Harbor",
          stage: "granskning", monthsLeft: 5, totalMonths: 12, spent: 0, challenges: [],
        },
      ],
    });
    const item = upcomingHeadlines(s).find((u) => u.id === "plan-b1");
    expect(item).toBeDefined();
    expect(item!.district).toBe("hamnen");
    expect(item!.eta).toBe(5);
  });

  it("sätter en öppen auktion överst (ETA 0)", () => {
    const s = makeState({
      auction: { blockId: "b2", district: "centrum", districtName: "Downtown", parcels: 3, minBid: 1, currentBid: 1, leader: null, round: 1 },
      planProcesses: [
        { blockId: "b1", district: "hamnen", districtName: "The Harbor", stage: "granskning", monthsLeft: 5, totalMonths: 12, spent: 0, challenges: [] },
      ],
    });
    const items = upcomingHeadlines(s);
    expect(items[0].id).toBe("auction-b2");
    expect(items[0].eta).toBe(0);
  });

  it("varnar för ett distrikt nära ett statusbyte", () => {
    // Downtown "Rising" ligger på 1.1; dev 1.07 → gap 0.03 < 0.04.
    const s = makeState({ districtDev: { centrum: 1.07 } });
    const item = upcomingHeadlines(s).find((u) => u.id === "trend-centrum");
    expect(item).toBeDefined();
  });
});

describe("scandalRisk & makeScandal", () => {
  it("ger noll risk för ett sunt, tomt bolag", () => {
    expect(scandalRisk(makeState())).toBe(0);
  });

  it("hög presstemperatur ger en hyresgästskandal", () => {
    const s = makeState({ pressHeat: 20 });
    expect(scandalRisk(s)).toBeGreaterThan(0.5);
    expect(makeScandal(s).title).toMatch(/tenants/i);
  });

  it("hög vakans ger en vanvårdsskandal", () => {
    const p = makeProperty({ capacity: 10, tenants: [] });
    const s = makeState({ portfolio: [p] });
    expect(scandalRisk(s)).toBeGreaterThan(0);
    expect(makeScandal(s).title.toLowerCase()).toContain("rot");
  });

  it("skalar skandalkostnaderna med bolagsnivå", () => {
    const s = makeState({ pressHeat: 20, companyLevel: 3 });
    const d = makeScandal(s);
    // Alternativ 0 = dementi, 1 = PR-byrå: större bolag → dyrare.
    expect(d.options[0].effect.cash).toBe(-360_000); // 120k * 3
    expect(d.options[1].effect.cash).toBe(-1_200_000); // 400k * 3
    expect(d.options[2].effect.reputation).toBe(-8); // ignorera
  });
});

describe("BUY_PR", () => {
  it("höjer ryktet mot kassan och sätter cooldown", () => {
    const s = makeState({ cash: 5_000_000, reputation: 50, companyLevel: 1 });
    const s1 = reducer(s, { type: "BUY_PR" });
    expect(s1.cash).toBe(4_750_000); // −250k
    expect(s1.reputation).toBe(54); // +4
    expect(s1.lastPrMonth).toBe(s.year * 12 + s.month);
  });

  it("nekar en ny kampanj inom cooldown", () => {
    const s = makeState({ cash: 5_000_000 });
    const s1 = reducer(s, { type: "BUY_PR" });
    const s2 = reducer(s1, { type: "BUY_PR" });
    expect(s2.cash).toBe(s1.cash); // ingen debitering
    expect(s2.reputation).toBe(s1.reputation);
  });

  it("nekar när kassan inte räcker", () => {
    const s = makeState({ cash: 100_000 });
    const s1 = reducer(s, { type: "BUY_PR" });
    expect(s1.cash).toBe(100_000);
    expect(s1.lastPrMonth).toBeUndefined();
  });
});

describe("articleTarget", () => {
  const entry = (over: Partial<LogEntry>): LogEntry => ({ t: "", kind: "info", ...over });

  it("pekar mot fastigheten när posten har parcelId", () => {
    expect(articleTarget(entry({ parcelId: "p42" }))).toEqual({ type: "parcel", parcelId: "p42" });
  });

  it("öppnar rivalfliken för en rivalpost", () => {
    expect(articleTarget(entry({ rival: "Northgate" }))).toEqual({ type: "open", window: "rivals" });
  });

  it("zoomar till distriktet som nämns i rubriken", () => {
    expect(articleTarget(entry({ t: "Prices climb across the Financial District" }))).toEqual({
      type: "district",
      district: "finans",
    });
  });

  it("faller till nyckelordskartan (ränta → finance)", () => {
    expect(articleTarget(entry({ t: "The central bank raised the policy rate again" }))).toEqual({
      type: "open",
      window: "finance",
    });
  });

  it("returnerar null när inget mål kan härledas", () => {
    expect(articleTarget(entry({ t: "A quiet month passed" }))).toBeNull();
  });
});
