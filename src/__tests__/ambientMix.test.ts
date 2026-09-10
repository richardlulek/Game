import { describe, expect, it, vi } from "vitest";
import { ambientMixAt, QUIET_CITY } from "../audio/ambientMix";
import { createCitySoundscape, setCityAmbienceVolume } from "../audio/cityAmbience";

const zones = [
  { district: "centrum", x: -50, z: 0, w: 100, d: 100 },
  { district: "hamnen", x: 50, z: 0, w: 100, d: 100 },
];

describe("camera-driven city ambience", () => {
  it("is silent at overview distance and away from the city", () => {
    expect(ambientMixAt(zones, 0, 0, 600, 1, true)).toEqual(QUIET_CITY);
    expect(ambientMixAt(zones, 10000, 10000, 100, 1, false)).toEqual(QUIET_CITY);
  });
  it("blends continuously at district borders", () => {
    const left = ambientMixAt(zones, -0.01, 0, 100, 1, false);
    const right = ambientMixAt(zones, 0.01, 0, 100, 1, false);
    for (const key of Object.keys(left) as (keyof typeof left)[]) expect(Math.abs(left[key] - right[key])).toBeLessThan(0.001);
    expect(left.crowd).toBeGreaterThan(0);
    expect(left.water).toBeGreaterThan(0);
  });
  it("reduces activity in vacant blocks and only adds works when present", () => {
    const vacant = ambientMixAt(zones, 0, 0, 100, 0, false);
    const occupied = ambientMixAt(zones, 0, 0, 100, 1, true);
    expect(vacant.crowd).toBe(0); expect(vacant.works).toBe(0);
    expect(occupied.crowd).toBeGreaterThan(0); expect(occupied.works).toBeGreaterThan(0);
  });
  it("keeps gains bounded and fades with camera distance", () => {
    const near = ambientMixAt(zones, 0, 0, -50, 5, true);
    const far = ambientMixAt(zones, 0, 0, 300, 5, true);
    for (const key of Object.keys(near) as (keyof typeof near)[]) {
      expect(near[key]).toBeGreaterThanOrEqual(0); expect(near[key]).toBeLessThanOrEqual(1);
      expect(far[key]).toBeCloseTo(near[key] / 2);
    }
  });
  it("mutes its output and releases every owned audio node on teardown", () => {
    function makeNode() {
      const param = () => ({ value: 0, setTargetAtTime: vi.fn() });
      return { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(),
        gain: param(), frequency: param(), Q: param(), type: "", buffer: null, loop: false };
    }
    const nodes: ReturnType<typeof makeNode>[] = [];
    function node() {
      const n = makeNode();
      nodes.push(n); return n;
    }
    const context = { currentTime: 2, sampleRate: 8000, createGain: node, createBufferSource: node,
      createBiquadFilter: node, createOscillator: node,
      createBuffer: (_channels: number, size: number) => ({ getChannelData: () => new Float32Array(size) }) };
    const output = {} as AudioNode;
    const sound = createCitySoundscape(context as unknown as AudioContext, output);
    const bus = nodes[0];
    expect(bus.connect).toHaveBeenCalledWith(output);
    sound.update(ambientMixAt(zones, 0, 0, 100, 1, true));
    expect(bus.gain.setTargetAtTime.mock.lastCall?.[0]).toBeGreaterThan(0);
    sound.silence(); expect(bus.gain.setTargetAtTime.mock.lastCall?.[0]).toBe(0);
    setCityAmbienceVolume(0);
    sound.update(ambientMixAt(zones, 0, 0, 100, 1, true));
    expect(bus.gain.setTargetAtTime.mock.lastCall?.[0]).toBe(0);
    setCityAmbienceVolume(0.45);
    sound.dispose(); sound.dispose();
    for (const n of nodes) {
      expect(n.disconnect).toHaveBeenCalledTimes(1);
      if (n.start.mock.calls.length) expect(n.stop).toHaveBeenCalledTimes(1);
    }
    const calls = bus.gain.setTargetAtTime.mock.calls.length;
    sound.update(QUIET_CITY); expect(bus.gain.setTargetAtTime).toHaveBeenCalledTimes(calls);
  });
});
