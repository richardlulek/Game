import { describe, expect, it } from "vitest";
import {
  DISTRICT_ZONES,
  locationFactor,
  PARCELS,
  parcelById,
  parcelsIn,
  placeCity,
} from "../engine/city";
import { DISTRICTS } from "../engine/data";
import { makeProperty, makeState } from "./factories";

describe("stadskartan", () => {
  it("har unika parcel-id:n och positioner samt zon för varje distrikt", () => {
    const ids = new Set(PARCELS.map((p) => p.id));
    expect(ids.size).toBe(PARCELS.length);
    const positions = new Set(PARCELS.map((p) => `${p.x},${p.z}`));
    expect(positions.size).toBe(PARCELS.length);
    for (const d of DISTRICTS) {
      expect(DISTRICT_ZONES.some((z) => z.district === d.id)).toBe(true);
      expect(parcelsIn(d.id).length).toBeGreaterThan(10);
    }
  });

  it("locationFactor är högre i centrum än i utkanten och tål okända id:n", () => {
    const central = Math.max(...parcelsIn("centrum").map((p) => locationFactor(p.id)));
    const perifer = Math.min(...parcelsIn("hamnen").map((p) => locationFactor(p.id)));
    expect(central).toBeGreaterThan(perifer);
    expect(locationFactor(undefined)).toBe(1);
    expect(locationFactor("okänd-ruta")).toBe(1);
  });
});

describe("placeCity", () => {
  it("ger alla synliga objekt unika tomtrutor i rätt distrikt; poolen rörs ej", () => {
    const s = makeState({
      portfolio: [makeProperty({ id: 1, district: "centrum" })],
      listings: [makeProperty({ id: 2, district: "hamnen", owned: false })],
      lots: [
        { id: 3, district: "kulle", districtName: "Villakullen", area: 900, price: 2e6 },
      ],
      competitors: [
        {
          name: "Rival AB",
          cash: 5e6,
          units: 2,
          equity: 20e6,
          portfolio: [
            makeProperty({ id: 4, district: "industri", owned: false }),
            makeProperty({ id: 5, district: "industri", owned: false }),
          ],
        },
      ],
      worldPool: [makeProperty({ id: 6, district: "förort", owned: false })],
    });

    const placed = placeCity(s);
    const visible = [
      ...placed.portfolio,
      ...placed.listings,
      ...placed.lots,
      ...placed.competitors.flatMap((c) => c.portfolio),
    ];
    const ids = visible.map((o) => o.parcelId);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const o of visible) expect(parcelById(o.parcelId!)?.district).toBe(o.district);
    // Världspoolen är abstrakt – ingen placering.
    expect(placed.worldPool![0].parcelId).toBeUndefined();
  });

  it("är idempotent och behåller befintliga placeringar", () => {
    const s = placeCity(
      makeState({ portfolio: [makeProperty({ id: 1, district: "centrum" })] }),
    );
    const first = s.portfolio[0].parcelId;
    const again = placeCity(s);
    expect(again).toBe(s); // samma referens – inget ändrades
    expect(again.portfolio[0].parcelId).toBe(first);
  });

  it("löser krockar: två objekt med samma ruta separeras", () => {
    const s = makeState({
      portfolio: [
        makeProperty({ id: 1, district: "centrum", parcelId: "centrum-0" }),
        makeProperty({ id: 2, district: "centrum", parcelId: "centrum-0" }),
      ],
    });
    const placed = placeCity(s);
    expect(placed.portfolio[0].parcelId).toBe("centrum-0");
    expect(placed.portfolio[1].parcelId).not.toBe("centrum-0");
  });
});
