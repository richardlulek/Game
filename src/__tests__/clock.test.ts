/* Spelklockans spar-kadens – ren beslutsfunktion (utan rAF-loopen). */

import { describe, expect, it } from "vitest";
import { SAVE_THROTTLE_MS, shouldAutosave } from "../hooks/useGameClock";

describe("shouldAutosave", () => {
  it("sparar vid månadsskifte när strypgränsen passerats", () => {
    expect(shouldAutosave(true, SAVE_THROTTLE_MS + 100, 0)).toBe(true);
    expect(shouldAutosave(true, SAVE_THROTTLE_MS, 0)).toBe(true); // exakt gräns
  });

  it("sparar inte inom strypgränsen även vid månadsskifte", () => {
    expect(shouldAutosave(true, SAVE_THROTTLE_MS - 1, 0)).toBe(false);
    expect(shouldAutosave(true, 1500, 500)).toBe(false); // 1000 ms < 2500
  });

  it("sparar aldrig utan månadsskifte", () => {
    expect(shouldAutosave(false, 10 * SAVE_THROTTLE_MS, 0)).toBe(false);
  });
});
