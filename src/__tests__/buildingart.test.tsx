import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BuildingArt } from "../components/BuildingArt";
import { makeProperty, makeTenantFixture } from "./factories";

const types = ["bostad", "kontor", "butik", "industri"] as const;

describe("BuildingArt", () => {
  it("renders valid svg for every type/state without NaN", () => {
    for (const type of types) {
      for (const cond of [100, 50, 12]) {
        for (const occ of [0, 1, 2]) {
          const p = makeProperty({
            type, condition: cond, capacity: 2,
            tenants: Array.from({ length: occ }, (_, i) => makeTenantFixture({ id: i + 1 })),
          });
          const html = renderToStaticMarkup(<BuildingArt p={p} />);
          expect(html).toContain("<svg");
          expect(html).toContain("<rect");
          expect(html).not.toContain("NaN");
        }
      }
    }
  });

  it("renders construction scene for bygger", () => {
    const p = makeProperty({ status: "bygger", buildLeft: 5 });
    const html = renderToStaticMarkup(<BuildingArt p={p} />);
    expect(html).toContain("<svg");
    expect(html).not.toContain("NaN");
  });
});
