/* Tester för redaktionens rena hjälpfunktioner: redaktionella råd,
   marknadsprognos och artikelnavigering. */

import { describe, expect, it } from "vitest";
import { articleTarget, editorNotes, marketForecast } from "../engine/newsroom";
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
