/* Gatumöblering: rena tomtkanter och in-/utfarter. Placeringslogiken är
   ren och deterministisk – bara bebyggda tomter får kant och infart, och
   kanten öppnar sig (sänkt kantsten) där infarten korsar. */

import { describe, expect, it } from "vitest";
import { PARCELS, type Parcel } from "../engine/city";
import {
  KERB_W,
  drivewayFootprint,
  drivewayInstances,
  plotKerbInstances,
  primaryStreetEdge,
  sidewalkWidth,
} from "../three/streetFurniture";

const streetParcel = PARCELS.find((p) => p.edges.n || p.edges.s || p.edges.e || p.edges.w)!;
const all = () => true;
const none = () => false;

describe("GATUMÖBLERING: bara bebyggda tomter", () => {
  it("inga instanser när inget är bebyggt", () => {
    expect(plotKerbInstances(none)).toHaveLength(0);
    expect(drivewayInstances(none)).toHaveLength(0);
  });

  it("bebyggda tomter får kant och (om gatuläge) infart", () => {
    const kerbs = plotKerbInstances(all);
    const drives = drivewayInstances(all);
    expect(kerbs.length).toBeGreaterThan(0);
    expect(drives.length).toBeGreaterThan(0);
    // Varje infart hör till en tomt med en primär gatusida.
    expect(drives.length).toBeLessThanOrEqual(
      PARCELS.filter((p) => primaryStreetEdge(p) !== null).length,
    );
  });
});

describe("PRIMÄR GATUSIDA: söder föredras, saknas helt om ingen gata", () => {
  it("prioriterar s > n > e > w", () => {
    const mk = (edges: Parcel["edges"]): Parcel => ({ ...streetParcel, edges });
    expect(primaryStreetEdge(mk({ n: true, s: true, e: true, w: true }))).toBe("s");
    expect(primaryStreetEdge(mk({ n: true, s: false, e: true, w: false }))).toBe("n");
    expect(primaryStreetEdge(mk({ n: false, s: false, e: true, w: true }))).toBe("e");
    expect(primaryStreetEdge(mk({ n: false, s: false, e: false, w: false }))).toBeNull();
  });
});

describe("SÄNKT KANTSTEN: kanten öppnar sig vid infarten", () => {
  it("en tomt med infart får färre/kortare kantstumpar på den sidan", () => {
    // En tomt med bara EN gatusida (söder) → en kantsida, delad av infarten.
    const p = PARCELS.find((x) => x.edges.s && !x.edges.n && !x.edges.e && !x.edges.w);
    if (!p) return; // kartan garanterar inte exakt detta – hoppa i så fall
    const only = (q: Parcel) => q.id === p.id;
    const kerbs = plotKerbInstances(only);
    const drive = drivewayFootprint(p)!;
    // Kanten på söder är delad i två stumpar (öppning för infarten).
    const southKerbs = kerbs.filter((k) => k.z > p.z);
    expect(southKerbs.length).toBe(2);
    // Gapet mellan stumparna rymmer infartsbredden.
    const gap = drive.width + 1;
    const totalKerb = southKerbs.reduce((a, k) => a + k.sx, 0);
    expect(totalKerb).toBeLessThan(p.w + KERB_W * 2 - gap + 0.5);
  });
});

describe("MÅTT: trottoarbredd hålls i spannet 1–3", () => {
  it("skalar med gatubredd men klamras", () => {
    const w = sidewalkWidth(streetParcel.district);
    expect(w).toBeGreaterThanOrEqual(1);
    expect(w).toBeLessThanOrEqual(3);
  });
});
