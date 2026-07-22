/* Åtagandepanelen: instrumentbrädan för pågående affärsprocesser.
   Tidigare levde förhandlingar, integrationer, earn-outs och
   avyttringskrav bara i loggen. */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommitmentsPanel } from "../components/CommitmentsPanel";
import { makeProperty, makeState } from "./factories";

const noop = () => undefined;

describe("ÅTAGANDEPANELEN: allt pågående syns", () => {
  it("renderar ingenting när inget pågår", () => {
    const html = renderToStaticMarkup(<CommitmentsPanel state={makeState({})} dispatch={noop} />);
    expect(html).toBe("");
  });

  it("visar förhandling, integration, earn-out, avyttringskrav och stängda dörrar", () => {
    const s = makeState({
      portfolio: [makeProperty({ id: 5001, district: "hamnen" })],
      pendingDeal: { target: "Wellspring Invest", offer: 90_000_000, round: 2, status: "countered", counter: 110_000_000, startedAbs: 13 },
      integrations: [{ target: "Old Town Trust", startAbs: 10, months: 9, synergyGoal: 12_000_000, hostile: true, propertyIds: [5001] }],
      earnOuts: [{ target: "Grovewood Properties", amount: 25_000_000, dueAbs: 30, noiTarget: 400_000, propertyIds: [5001] }],
      divestOrders: [{ district: "hamnen", maxAllowed: 0, dueAbs: 15 }],
      ddInProgress: [{ target: "Coastline Ltd", doneAbs: 15 }],
      dealCooldowns: { "City Core Group": 20 },
    });
    const html = renderToStaticMarkup(<CommitmentsPanel state={s} dispatch={noop} />);
    expect(html).toContain("Negotiating Wellspring Invest");
    expect(html).toContain("countered at");
    expect(html).toContain("Integrating Old Town Trust");
    expect(html).toContain("hostile");
    expect(html).toContain("Earn-out: Grovewood Properties");
    expect(html).toContain("Divestment order: hamnen");
    expect(html).toContain("Due diligence: Coastline Ltd");
    expect(html).toContain("Closed doors");
  });

  it("earn-outen bedömer leveransen mot målet", () => {
    const s = makeState({
      portfolio: [makeProperty({ id: 5002, baseRent: 10_000_000 })],
      earnOuts: [{ target: "X", amount: 5_000_000, dueAbs: 40, noiTarget: 1, propertyIds: [5002] }],
    });
    const html = renderToStaticMarkup(<CommitmentsPanel state={s} dispatch={noop} />);
    expect(html).toContain("you will pay");
  });
});
