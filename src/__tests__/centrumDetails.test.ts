import { describe, expect, it } from "vitest";
import { turretDetails } from "../three/centrumDetails";

describe("centrum turret windows", () => {
  it("places panes outside the ten cylinder face planes", () => {
    const { panes } = turretDetails(8);
    expect(panes).toHaveLength(80);
    for (const pane of panes) {
      const angle = pane.rotY!;
      const distance = pane.x * Math.sin(angle) + pane.z * Math.cos(angle);
      expect(distance - pane.sz! / 2).toBeGreaterThan(2 * Math.cos(Math.PI / 10));
      expect(pane.sx!).toBeLessThan(4 * Math.sin(Math.PI / 10));
      expect(pane.y - pane.sy! / 2).toBeGreaterThan(0);
      expect(pane.y + pane.sy! / 2).toBeLessThan(24);
    }
  });
  it("aligns each window row with the main building's three-unit floors", () => {
    const { panes, bands } = turretDetails(5);
    expect([...new Set(panes.map(p => p.y))]).toEqual([1.65, 4.65, 7.65, 10.65, 13.65]);
    expect(bands).toHaveLength(7);
    expect(bands[bands.length - 1].y + bands[bands.length - 1].sy! / 2).toBeCloseTo(16.6);
  });
});
