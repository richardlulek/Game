import { describe, expect, it } from "vitest";
import {
  DISTRICT_ZONES,
  occupiedParcelIds,
  frontierScore,
  hasAmbientBuilding,
  locationFactor,
  PARCELS,
  parcelById,
  parcelsIn,
  pickFrontierParcel,
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

  it("annonser tar över stående dekorhus – inga nybyggen ur tomma intet", () => {
    // En annons utan ruta ska hamna på en tomt där ett privathus redan står
    // (så länge distriktet har några), inte på obebyggd mark.
    const s = makeState({
      listings: [makeProperty({ id: 2, district: "centrum", owned: false })],
    });
    const placed = placeCity(s);
    const parcel = parcelById(placed.listings[0].parcelId!)!;
    expect(hasAmbientBuilding(parcel)).toBe(true);
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

  it("tillväxtfronten: byggda grannar höjer en rutas tillväxttryck", () => {
    // Hitta en ruta med minst en granne som INTE bär dekorbebyggelse, så att
    // grannbebyggelse (ambientGrown) bevisligen kan höja poängen.
    const ps = parcelsIn("hamnen");
    let tested = false;
    for (const p of ps) {
      const nonDecorNear = ps.filter(
        (q) => q.id !== p.id && Math.hypot(q.x - p.x, q.z - p.z) <= 62 && !hasAmbientBuilding(q),
      );
      if (nonDecorNear.length === 0) continue;
      const withNeighbors = frontierScore(makeState({ ambientGrown: nonDecorNear.map((q) => q.id) }), p);
      const bare = frontierScore(makeState(), p);
      expect(withNeighbors).toBeGreaterThan(bare);
      tested = true;
      break;
    }
    expect(tested).toBe(true);
  });

  it("tillväxtfronten: heta distrikt (högre districtDev) drar tillväxten", () => {
    const p = parcelsIn("centrum")[0];
    const hot = frontierScore(makeState({ districtDev: { centrum: 1.4 } }), p);
    const cold = frontierScore(makeState({ districtDev: { centrum: 0.9 } }), p);
    expect(hot).toBeGreaterThan(cold);
  });

  it("pickFrontierParcel returnerar en ledig ruta, null när staden är full", () => {
    const chosen = pickFrontierParcel(makeState(), () => 0.5);
    expect(chosen).not.toBeNull();
    // Fyll varenda ruta – då finns ingen ledig mark kvar.
    const full = makeState({ ambientGrown: PARCELS.map((p) => p.id) });
    expect(pickFrontierParcel(full)).toBeNull();
  });

  it("en ny tomt får ALDRIG knuffa undan ett befintligt hus (tvåpass-reservation)", () => {
    // Ett rivalhus ligger redan på industri-0; en ny tomt utan ruta läggs i
    // samma distrikt. Tomterna placeras före konkurrenterna i iterationen,
    // men reservationen ska ändå skydda huset.
    const s = makeState({
      lots: [{ id: 9, district: "industri", districtName: "Industriområdet", area: 3000, price: 4e6 }],
      competitors: [
        {
          name: "Rival AB", cash: 5e6, units: 1, equity: 20e6,
          portfolio: [makeProperty({ id: 4, district: "industri", owned: false, parcelId: "industri-0" })],
        },
      ],
    });
    const placed = placeCity(s);
    expect(placed.competitors[0].portfolio[0].parcelId).toBe("industri-0");
    expect(placed.lots[0].parcelId).not.toBe("industri-0");
  });
});

describe("industriernas placering", () => {
  const mkInd = (over: Record<string, unknown>) => ({
    id: 900, sector: "hotell", name: "Test", district: "centrum", districtName: "Centrum",
    purchasePrice: 10e6, condition: 80, upgrades: [], managed: false, insurance: false,
    status: "klar", buildLeft: 0, monthlyRevenue: 0, monthlyOpex: 0, totalRevenue: 0,
    txHistory: [], hotelMeta: null, energyMeta: null, logisticsMeta: null, ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  it("hotell/logistik får tomtrutor, energiparker fasta lägen utanför rutnätet", () => {
    const s = makeState({
      industryListings: [
        mkInd({ id: 901, sector: "hotell", district: "centrum" }),
        mkInd({ id: 902, sector: "energi", district: "förort", energyMeta: { subType: "sol", installedMW: 5, capacityFactor: 0.12, ppaContracts: [], degradationPct: 0, subsidyActive: true, commissionedAbs: 0 } }),
      ],
    });
    const placed = placeCity(s);
    const hotel = placed.industryListings![0];
    const sol = placed.industryListings![1];
    expect(hotel.parcelId).toBeDefined();
    expect(parcelById(hotel.parcelId!)?.district).toBe("centrum");
    // Energiparken står på sitt distrikts energiläge – ingen tomtruta.
    expect(sol.siteId).toBe("energi-vast");
    expect(sol.parcelId).toBeUndefined();
    // Rutan hotellet står på är upptagen; energiläget tar ingen ruta.
    expect(occupiedParcelIds(placed).has(hotel.parcelId!)).toBe(true);
  });

  it("äldre energiplacering på tomtruta släpps och flyttas till energiläge", () => {
    const s = makeState({
      industryPortfolio: [
        mkInd({ id: 903, sector: "energi", district: "hamnen", parcelId: "hamnen-3", energyMeta: { subType: "vind", installedMW: 15, capacityFactor: 0.32, ppaContracts: [], degradationPct: 0, subsidyActive: true, commissionedAbs: 0 } }),
      ],
    });
    const placed = placeCity(s);
    const vind = placed.industryPortfolio![0];
    expect(vind.siteId).toBe("energi-kust");
    expect(vind.parcelId).toBeUndefined();
    expect(occupiedParcelIds(placed).has("hamnen-3")).toBe(false);
  });
});
