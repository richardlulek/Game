import { describe, expect, it } from "vitest";
import { facadeStructure, type StructureKind } from "../three/facadeStructure";

describe("purposeful building facades", () => {
  it("retains plinths, roof edges and major divisions on Low/far detail", () => {
    const volume = { w: 18, d: 14, h: 90 };
    const full = facadeStructure(volume, "office", false), coarse = facadeStructure(volume, "office", true);
    expect(coarse.length).toBeLessThan(full.length);
    expect(coarse.some(p => p.surface === "base" && p.y < 1)).toBe(true);
    expect(coarse.some(p => p.y > 89)).toBe(true);
    expect(coarse.some(p => p.sy > 80)).toBe(true);
  });
  it("uses high daylight windows for production/storage instead of residential floor bands", () => {
    for (const kind of ["industrial", "warehouse"] as StructureKind[]) {
      const parts = facadeStructure({ w: 24, d: 16, h: 9 }, kind, false);
      const windows = parts.filter(p => p.surface === "glass");
      expect(windows).toHaveLength(2);
      expect(windows.every(p => p.y > 6)).toBe(true);
    }
  });
  it("fits each setback or rotated tower volume without extending ribs to another storey", () => {
    for (const rotation of [0, Math.PI / 4, Math.PI / 2]) {
      const v = { w: 9, d: 8, h: 18, x: 4, z: -3, y: 90, rotation };
      for (const part of facadeStructure(v, "office", false)) {
        const dx = part.x - v.x, dz = part.z - v.z;
        const x = dx * Math.cos(rotation) - dz * Math.sin(rotation), z = dx * Math.sin(rotation) + dz * Math.cos(rotation);
        expect(Math.abs(x) + part.sx / 2).toBeLessThanOrEqual(v.w / 2 + 0.17);
        expect(Math.abs(z) + part.sz / 2).toBeLessThanOrEqual(v.d / 2 + 0.17);
        expect(part.y - part.sy / 2).toBeGreaterThanOrEqual(v.y - 0.001);
        expect(part.y + part.sy / 2).toBeLessThanOrEqual(v.y + v.h + 0.001);
      }
    }
  });
  it("places background entrances on the requested street-facing side", () => {
    for (const [sx, sz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const parts = facadeStructure({ w: 18, d: 12, h: 15 }, "office", true, [sx, sz]);
      const entrance = parts.find(p => p.surface === "glass")!;
      expect(Math.sign(entrance.x)).toBe(sx); expect(Math.sign(entrance.z)).toBe(sz);
    }
  });
  it("bounds ornament count even on tall or wide buildings", () => {
    for (const kind of ["office", "masonry", "industrial", "warehouse"] as StructureKind[]) {
      for (const h of [6, 30, 150, 600]) for (const coarse of [true, false]) {
        const parts = facadeStructure({ w: 100, d: 80, h }, kind, coarse);
        expect(parts.length).toBeLessThan(100);
        expect(parts.every(p => Object.values(p).filter(v => typeof v === "number").every(Number.isFinite))).toBe(true);
      }
    }
  });
  it("is deterministic and skips invalid geometry", () => {
    const v = { w: 18, d: 12, h: 15 };
    expect(facadeStructure(v, "office", false)).toEqual(facadeStructure(v, "office", false));
    expect(facadeStructure({ ...v, w: 0 }, "office", false)).toEqual([]);
    expect(v).toEqual({ w: 18, d: 12, h: 15 });
  });
});
