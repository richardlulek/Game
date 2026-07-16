/* Tester för notabla hyresgäster: roster, matchning och signering. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOTABLE_TENANTS,
  findNotableMoveIn,
  housedNotables,
  notableById,
  signNotable,
} from "../engine/notableTenants";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("NOTABLE_TENANTS roster", () => {
  it("har unika id:n och giltiga fält", () => {
    const ids = new Set(NOTABLE_TENANTS.map((n) => n.id));
    expect(ids.size).toBe(NOTABLE_TENANTS.length);
    for (const n of NOTABLE_TENANTS) {
      expect(n.quality).toBeGreaterThan(0.9);
      expect(["bostad", "kontor", "butik", "industri"]).toContain(n.kind);
      expect(["prestige", "growth", "loyal", "fickle"]).toContain(n.trait);
    }
  });
});

describe("signNotable", () => {
  it("skapar en hyresgäst med notableId och premiumhyra", () => {
    const n = notableById("meridian")!;
    const t = signNotable(n, 10_000);
    expect(t.notableId).toBe("meridian");
    expect(t.rent).toBe(Math.round(10_000 * n.quality));
    expect(t.isAnchor).toBe(true); // meridian = loyal
    expect(t.satisfaction).toBe(72);
  });

  it("nyckfulla karaktärer blir inte ankare", () => {
    const t = signNotable(notableById("kestrel")!, 5_000);
    expect(t.isAnchor).toBe(false);
  });
});

describe("findNotableMoveIn", () => {
  it("parar en ledig karaktär med en passande, ledig lokal", () => {
    // NovaPod söker kontor; ge en ledig kontorslokal med gott skick.
    const office = makeProperty({ type: "kontor", condition: 80, capacity: 2, tenants: [] });
    const match = findNotableMoveIn(makeState({ portfolio: [office] }));
    expect(match).not.toBeNull();
    expect(match!.notable.kind).toBe("kontor");
    expect(match!.propertyId).toBe(office.id);
  });

  it("returnerar null när ingen passande ledig lokal finns", () => {
    const fullOffice = makeProperty({ type: "kontor", condition: 80, capacity: 1, tenants: [makeTenantFixture()] });
    expect(findNotableMoveIn(makeState({ portfolio: [fullOffice] }))).toBeNull();
  });

  it("hoppar över redan inflyttade karaktärer", () => {
    const housed = makeProperty({ type: "kontor", condition: 80, capacity: 2, tenants: [signNotable(notableById("meridian")!, 5000)] });
    const s = makeState({ portfolio: [housed] });
    expect(housedNotables(s).has("meridian")).toBe(true);
  });
});
