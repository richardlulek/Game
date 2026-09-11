import { COAST_Z } from "../engine/cityLayout";
import type { PropTypeKey } from "../engine/types";
import { useEffect, useMemo } from "react";
import { BoxGeometry, Color, CylinderGeometry, MeshStandardMaterial, SphereGeometry } from "three";
import { PARCELS, ZONE_STREETS } from "../engine/city";
import { activeCitySeed } from "../engine/activeLayout";
import { generateCityLayout } from "../engine/cityLayout";
import { ACTIVE_LANDMARKS } from "../engine/landmarkGen";
import { ACTIVE_ROADS } from "../engine/roadGen";
import { useGameStore } from "../store/gameStore";
import { useUiStore } from "../store/uiStore";
import { buildInstances, type Inst } from "./meshHelpers";
import { clearStrip, publicRealmPlan, unionRects, type RealmStyle } from "./publicRealm";
import { overlaps } from "./groundsLayout";
import { realmMaterial } from "./realmMaterials";
import { infraSpotsFor } from "./infraSpots";
const GREEN: Record<RealmStyle, string> = {
  urban: "#9da48b",
  boulevard: "#95a088",
  park: "#92a280",
  nature: "#8f9e7c",
  service: "#949782",
  quay: "#9da18c",
};
const STONE: Record<RealmStyle, string> = {
  urban: "#beb7a7",
  boulevard: "#b7b7ad",
  park: "#b3a68d",
  nature: "#afa18b",
  service: "#93938b",
  quay: "#a5a399",
};
/** Public surfaces and furniture are derived from the active map, never hand-placed. */
export function CityPublicRealm() {
  const low = useUiStore((s) => s.graphics === "low"),
    evening = useUiStore((s) => s.lightMode === "evening");
  const reserveKey = useGameStore((s) =>
    JSON.stringify({
      unlocked: s.state.unlockedBlocks ?? [],
      infra: infraSpotsFor(s.state).map(({ x, z }) => ({ x, z })),
      properties: [
        ...s.state.portfolio,
        ...s.state.listings,
        ...s.state.competitors.flatMap((c) => c.portfolio),
      ]
        .filter(
          (p) =>
            p.parcelId &&
            !p.storyTag &&
            !p.signature &&
            !(p.status === "bygger" && (!p.renovation || p.renovation.kind === "nybyggnation")),
        )
        .map((p) => [p.parcelId, p.type]),
    }),
  );
  const plan = useMemo(() => {
    const state = JSON.parse(reserveKey) as {
      unlocked: string[];
      infra: { x: number; z: number }[];
      properties: [string, PropTypeKey][];
    };
    return publicRealmPlan(
      generateCityLayout(activeCitySeed()),
      PARCELS,
      [...ACTIVE_ROADS, ...ZONE_STREETS],
      ACTIVE_LANDMARKS,
      // Reserve fixed late-game sites, including their surrounding service areas.
      [
        { x: -180, z: 315, w: 110, d: 100 },
        { x: -180, z: -330, w: 90, d: 80 },
        { x: 560, z: 90, w: 90, d: 80 },
        ...state.infra.map((p) => ({ ...p, w: 10, d: 8 })),
      ],
      new Set(state.unlocked),
      new Map(state.properties),
    );
  }, [reserveKey]);
  const meshes = useMemo(() => {
    const pavement: Inst[] = [],
      kerb: Inst[] = [],
      paint: Inst[] = [],
      gravel: Inst[] = [],
      wood: Inst[] = [],
      metal: Inst[] = [],
      lamps: Inst[] = [],
      trunks: Inst[] = [],
      crowns: Inst[] = [],
      shrubs: Inst[] = [],
      grass: Inst[] = [];
    const add = (
      items: Inst[],
      r: { x: number; z: number; w: number; d: number },
      y: number,
      h: number,
      color?: string,
    ) =>
      items.push({
        x: r.x,
        y,
        z: r.z,
        sx: r.w,
        sy: h,
        sz: r.d,
        ...(color ? { color: new Color(color) } : {}),
      });
    for (const r of plan.sidewalks) {
      // Driveways are cut into the sidewalk, rather than stacked over its raised surface.
      for (const piece of clearStrip(r, plan.drives)) add(pavement, piece, 0.09, 0.18);
      const edges = [
        { x: r.x, z: r.z - r.d / 2, w: r.w, d: 0.16 },
        { x: r.x, z: r.z + r.d / 2, w: r.w, d: 0.16 },
        { x: r.x - r.w / 2, z: r.z, w: 0.16, d: r.d },
        { x: r.x + r.w / 2, z: r.z, w: 0.16, d: r.d },
      ];
      for (const e of edges)
        if (
          [...ACTIVE_ROADS, ...ZONE_STREETS].some((road) =>
            overlaps({ ...e, w: e.w + 0.24, d: e.d + 0.24 }, road),
          )
        )
          for (const piece of clearStrip(e, [
            ...plan.drives,
            ...plan.crossings.map((c) => ({ ...c, w: c.w + 1, d: c.d + 1 })),
          ]))
            add(kerb, piece, 0.14, 0.28);
    }
    for (const r of plan.sidewalks.filter((r) => Math.abs(r.z - (COAST_Z - 5)) < 0.1 && r.w > 3)) {
      const z = r.z + r.d / 2 - 0.15;
      add(metal, { x: r.x, z, w: r.w, d: 0.08 }, 1.05, 0.08);
      for (let x = r.x - r.w / 2 + 0.3; x < r.x + r.w / 2; x += 2.5)
        add(metal, { x, z, w: 0.08, d: 0.08 }, 0.62, 1.1);
    }
    for (const r of plan.drives) add(gravel, r, 0.045, 0.09);
    for (const r of plan.crossings) {
      const horizontal = r.w < r.d,
        count = Math.floor((horizontal ? r.d : r.w) / 0.85);
      for (let i = 0; i < count; i++)
        add(
          paint,
          {
            x: r.x + (horizontal ? 0 : (i - (count - 1) / 2) * 0.85),
            z: r.z + (horizontal ? (i - (count - 1) / 2) * 0.85 : 0),
            w: horizontal ? r.w : 0.45,
            d: horizontal ? 0.45 : r.d,
          },
          0.13,
          0.014,
        );
    }
    for (const r of [
      ...plan.plazas,
      ...plan.paths.flatMap((path) =>
        clearStrip(path, [...plan.plazas, ...plan.sidewalks]).map((r) => ({
          ...r,
          style: path.style,
        })),
      ),
    ])
      add(
        r.style === "urban" || r.style === "boulevard" || r.style === "quay" ? pavement : gravel,
        r,
        0.08,
        0.12,
        STONE[r.style],
      );
    for (const style of Object.keys(GREEN) as RealmStyle[])
      for (const r of unionRects(plan.meadows.filter((m) => m.style === style)))
        add(grass, r, 0.007, 0.014, GREEN[style]);
    plan.features.forEach((f, i) => {
      if (f.kind === "tree") {
        if (low && i % 2) return;
        const height = f.style === "nature" ? 5.2 : 4.4;
        add(trunks, { ...f, w: 0.25, d: 0.25 }, height * 0.32, height * 0.64);
        crowns.push({
          x: f.x,
          y: height * 0.7,
          z: f.z,
          sx: 1.7,
          sy: f.style === "boulevard" ? 2.3 : 1.8,
          sz: 1.7,
          color: new Color(i % 3 === 0 ? "#657d56" : i % 3 === 1 ? "#74885f" : "#84936a"),
        });
      } else if (f.kind === "shrub") {
        if (!low) shrubs.push({ x: f.x, y: 0.55, z: f.z, sx: 1.1, sy: 0.65, sz: 0.8 });
      } else if (f.kind === "bench") {
        add(wood, { ...f, w: 2.3, d: 0.65 }, 0.65, 0.12);
        add(wood, { ...f, z: f.z - 0.25, w: 2.3, d: 0.1 }, 1.03, 0.65);
        for (const side of [-1, 1])
          add(metal, { ...f, x: f.x + side * 0.8, w: 0.1, d: 0.5 }, 0.34, 0.6);
      } else if (f.kind === "lamp") {
        add(metal, { ...f, w: 0.12, d: 0.12 }, 1.8, 3.6);
        add(lamps, { ...f, w: 0.4, d: 0.4 }, 3.65, 0.3);
      } else if (f.kind === "play") {
        // Low timber balance course rather than an unconnected decorative playground.
        for (const side of [-1, 1])
          add(wood, { ...f, x: f.x + side * 0.65, w: 0.22, d: 2.4 }, 0.55 + side * 0.15, 0.25);
        for (const x of [-0.9, 0, 0.9])
          add(wood, { ...f, x: f.x + x, z: f.z + 1, w: 0.35, d: 0.35 }, 0.3, 0.6);
      } else if (f.kind === "utility") {
        add(metal, f, 0.8, 1.6);
        add(kerb, { ...f, w: f.w + 0.25, d: f.d + 0.25 }, 0.1, 0.2);
        if (!low)
          for (let y = 0.5; y < 1.5; y += 0.18)
            add(wood, { ...f, z: f.z + f.d / 2 + 0.015, w: 1.2, d: 0.02 }, y, 0.05);
      }
    });
    const groups = [
      { items: pavement, material: realmMaterial("paving", "#b9b9ad") },
      { items: gravel, material: realmMaterial("gravel", "#9c998d") },
      { items: grass, material: realmMaterial("grass", "#ffffff") },
      { items: kerb, material: new MeshStandardMaterial({ color: "#c3bfae", roughness: 0.9 }) },
      { items: paint, material: new MeshStandardMaterial({ color: "#e0dccb", roughness: 0.9 }) },
      { items: wood, material: new MeshStandardMaterial({ color: "#85735b", roughness: 0.9 }) },
      {
        items: metal,
        material: new MeshStandardMaterial({ color: "#626c65", roughness: 0.65, metalness: 0.2 }),
      },
      {
        items: lamps,
        material: new MeshStandardMaterial({
          color: "#e4d4ac",
          emissive: "#e0ba79",
          emissiveIntensity: evening ? 0.8 : 0,
        }),
      },
      {
        items: trunks,
        material: new MeshStandardMaterial({ color: "#73614d", roughness: 1 }),
        cylinder: true,
      },
      {
        items: crowns,
        material: new MeshStandardMaterial({ color: "white", roughness: 1 }),
        round: true,
      },
      {
        items: shrubs,
        material: new MeshStandardMaterial({ color: "#78845f", roughness: 1 }),
        round: true,
      },
    ];
    return groups.flatMap((g) => {
      if (!g.items.length) {
        g.material.dispose();
        return [];
      }
      return [
        buildInstances(
          g.round
            ? new SphereGeometry(1, 7, 5)
            : g.cylinder
              ? new CylinderGeometry(0.5, 0.65, 1, 6)
              : new BoxGeometry(),
          g.material,
          g.items,
          { receive: true, cast: !low && !!(g.round || g.cylinder) },
        ),
      ];
    });
  }, [plan, low, evening]);
  useEffect(
    () => () =>
      meshes.forEach((m) => {
        m.geometry.dispose();
        (m.material as MeshStandardMaterial).dispose();
        m.dispose();
      }),
    [meshes],
  );
  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} raycast={() => null} />
      ))}
    </group>
  );
}
