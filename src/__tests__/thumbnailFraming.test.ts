/* Fastighetsbildernas inramning. Det som gick fel en gång: bilden ritades i
   fel storlek mot rendermålet, så husen hamnade i ett hörn och klipptes. Den
   delen sitter i WebGL och går inte att enhetstesta – men inramningen som
   avgör hur mycket av huset som ryms är ren matematik, och den låses här. */
import { describe, expect, it } from "vitest";
import { Box3, OrthographicCamera, Vector3 } from "three";
import { frameBox, THUMB_H, THUMB_W } from "../three/thumbnailFraming";

const ASPECT = THUMB_W / THUMB_H;

/** Samma anrop som renderaren gör, för en byggnad som står på marken. */
function frame(w: number, h: number, d: number, at = new Vector3(0, 0, 0)) {
  const box = new Box3(
    new Vector3(at.x - w / 2, at.y, at.z - d / 2),
    new Vector3(at.x + w / 2, at.y + h, at.z + d / 2),
  );
  const camera = new OrthographicCamera();
  const fit = frameBox(camera, box, box.getCenter(new Vector3()), box.getSize(new Vector3()));
  return { camera, fit };
}

/** Var hamnar en punkt i bilden? 0..1 från vänster respektive nedifrån. */
function project(camera: OrthographicCamera, p: Vector3) {
  const v = p.clone().project(camera);
  return { x: (v.x + 1) / 2, y: (v.y + 1) / 2, z: v.z };
}

const SHAPES: [string, number, number, number][] = [
  ["villa", 10, 9, 11],
  ["stadshus", 18, 20, 16],
  ["lamellhus", 26, 14, 12],
  ["industrihall", 28, 8, 30],
  ["kontorstorn", 18, 104, 18],
  ["smal souterräng", 9, 34, 22],
];

describe("fastighetsbildens inramning", () => {
  for (const [name, w, h, d] of SHAPES) {
    it(`rymmer hela ${name} innanför bildkanten`, () => {
      const { camera, fit } = frame(w, h, d);
      const box = new Box3(new Vector3(-w / 2, 0, -d / 2), new Vector3(w / 2, h, d / 2));
      for (let i = 0; i < 8; i++) {
        const corner = new Vector3(
          i & 1 ? box.max.x : box.min.x,
          i & 2 ? box.max.y : box.min.y,
          i & 4 ? box.max.z : box.min.z,
        );
        const p = project(camera, corner);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
        // Innanför djupet också – inget får klippas av när- eller bortreplanet.
        expect(p.z).toBeGreaterThan(-1);
        expect(p.z).toBeLessThan(1);
      }
      expect(fit.halfW / fit.halfH).toBeCloseTo(ASPECT, 3);
    });

    it(`fyller bilden i minst en led för ${name}`, () => {
      const { fit } = frame(w, h, d);
      const fillX = (fit.maxX - fit.minX) / (2 * fit.halfW);
      const fillY = (fit.maxY - fit.minY) / (2 * fit.halfH);
      // Marginalen är 7 %, så den trängsta leden ska ligga nära kanten.
      expect(Math.max(fillX, fillY)).toBeGreaterThan(0.8);
    });
  }

  it("centrerar huset – kameran siktar på mitten, så ramen blir symmetrisk", () => {
    const { fit } = frame(18, 20, 16);
    expect(Math.abs(fit.midX)).toBeLessThan(1e-6);
    expect(Math.abs(fit.midY)).toBeLessThan(1e-6);
  });

  it("ramar likadant var i staden huset än ligger", () => {
    const origin = frame(18, 20, 16);
    const distant = frame(18, 20, 16, new Vector3(-460, 0, 315));
    expect(distant.fit.halfW).toBeCloseTo(origin.fit.halfW, 6);
    expect(distant.fit.halfH).toBeCloseTo(origin.fit.halfH, 6);
  });

  it("lämnar plats för kontaktskuggan, som är bredare än väggarna", () => {
    // En låg, bred hall: skuggan och inte fasaden avgör bredden.
    const { fit } = frame(28, 8, 30);
    expect(fit.halfW).toBeGreaterThanOrEqual(fit.footprint);
  });

  it("skalar med huset i stället för att zooma likadant på allt", () => {
    const small = frame(10, 9, 11).fit;
    const large = frame(28, 60, 30).fit;
    expect(large.halfH).toBeGreaterThan(small.halfH * 2);
  });
});
