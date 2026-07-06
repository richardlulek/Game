import { describe, expect, it } from "vitest";
import {
  claimFirstFreeParcel,
  locationFactor,
  claimRandomParcel,
  districtsWithFreeParcels,
  DISTRICT_ZONES,
  PARCELS,
  parcelById,
  parcelsIn,
  usedParcelIds,
} from "../engine/city";
import { DISTRICTS } from "../engine/data";
import { initState } from "../engine/initState";
import { makeCompetitor, makeProperty, makeState } from "./factories";

describe("stadskartan", () => {
  it("har unika parcel-id:n och positioner", () => {
    const ids = new Set(PARCELS.map((p) => p.id));
    expect(ids.size).toBe(PARCELS.length);
    const positions = new Set(PARCELS.map((p) => `${p.x},${p.z}`));
    expect(positions.size).toBe(PARCELS.length);
  });

  it("har en zon och tomtrutor för varje distrikt", () => {
    for (const d of DISTRICTS) {
      expect(DISTRICT_ZONES.some((z) => z.district === d.id)).toBe(true);
      expect(parcelsIn(d.id).length).toBeGreaterThan(5);
    }
  });

  it("placerar varje tomtruta inom sitt distrikts zon", () => {
    for (const p of PARCELS) {
      const z = DISTRICT_ZONES.find((x) => x.district === p.district)!;
      expect(Math.abs(p.x - z.x)).toBeLessThanOrEqual(z.w / 2);
      expect(Math.abs(p.z - z.z)).toBeLessThanOrEqual(z.d / 2);
    }
  });

  it("claimRandomParcel tar bara lediga rutor och markerar dem upptagna", () => {
    const occupied = new Set<string>();
    const seen = new Set<string>();
    const total = parcelsIn("centrum").length;
    for (let i = 0; i < total; i++) {
      const p = claimRandomParcel("centrum", occupied);
      expect(p.district).toBe("centrum");
      expect(seen.has(p.id)).toBe(false);
      seen.add(p.id);
    }
    expect(occupied.size).toBe(total);
    expect(districtsWithFreeParcels(occupied)).not.toContain("centrum");
  });

  it("claimFirstFreeParcel är deterministisk", () => {
    const a = claimFirstFreeParcel("hamnen", new Set());
    const b = claimFirstFreeParcel("hamnen", new Set());
    expect(a.id).toBe(b.id);
  });

  it("locationFactor är högre i centrum än i utkanten och håller sig inom spannet", () => {
    const central = locationFactor("centrum-12"); // mitt i Centrum (0,0)
    const perifer = locationFactor("storängen-0");
    expect(central).toBeGreaterThan(perifer);
    for (const pc of PARCELS) {
      const f = locationFactor(pc.id);
      expect(f).toBeGreaterThanOrEqual(0.94);
      expect(f).toBeLessThanOrEqual(1.12);
    }
    expect(locationFactor("okänd-ruta")).toBe(1);
  });

  it("usedParcelIds räknar även konkurrenternas innehav", () => {
    const s = makeState({
      competitors: [
        makeCompetitor({
          holdings: [
            {
              id: 900,
              parcelId: "industri-3",
              district: "industri",
              districtName: "Industriområdet",
              type: "industri",
              typeLabel: "Industri/Lager",
              area: 1000,
            },
          ],
          units: 1,
        }),
      ],
    });
    expect(usedParcelIds(s).has("industri-3")).toBe(true);
  });

  it("usedParcelIds samlar rutor från portfölj, marknad och tomter", () => {
    const s = makeState({
      portfolio: [makeProperty({ parcelId: "centrum-1" })],
      listings: [makeProperty({ id: 2, parcelId: "hamnen-0", owned: false })],
      lots: [
        {
          id: 3,
          district: "kulle",
          districtName: "Villakullen",
          parcelId: "kulle-2",
          area: 1000,
          price: 1e6,
        },
      ],
    });
    expect(usedParcelIds(s)).toEqual(new Set(["centrum-1", "hamnen-0", "kulle-2"]));
  });

  it("initState placerar alla startobjekt på unika, giltiga tomtrutor", () => {
    const s = initState();
    const ids = [...s.listings, ...s.lots].map((o) => o.parcelId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const o of [...s.listings, ...s.lots]) {
      const parcel = parcelById(o.parcelId);
      expect(parcel).toBeDefined();
      expect(parcel!.district).toBe(o.district);
    }
  });
});
