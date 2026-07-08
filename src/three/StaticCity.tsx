/* ============================================================
   Statisk stad – allt som INTE är interaktivt ritas här med
   instansiering och sammanslagen geometri, i stället för som
   tusentals enskilda meshar:

   · Trottoarer          → 1 InstancedMesh
   · Markplattor          → 1 InstancedMesh (per-instans-färg)
   · Parkträd             → 2 InstancedMesh (stam + krona)
   · Dekorbebyggelse      → 2 sammanslagna meshar (fasader med
                            UV-bakade fönster + tak/detaljer)

   Interaktiva tomter (spelobjekt) behåller sina egna meshar i
   ParcelNode – de behöver raycast, markeringar och skickfärg.
   ============================================================ */

import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PARCELS, hasAmbientBuilding, parcelHash, type Parcel } from "../engine/city";
import { useUiStore } from "../store/uiStore";
import { FLOOR_HEIGHT } from "./BuildingShapes";
import {
  PARK_GREEN,
  PLOT_COLORS,
  PLOT_FALLBACK,
  SIDEWALK,
  TREE_GREENS,
  TREE_TRUNK,
} from "./colors";
import { ambientColorFor, districtFloors } from "./districtBuildings";
import { facadeTexture, glassTexture, type FacadeKind } from "./textures";

interface CityProps {
  /** Tomter med spelinnehåll (ägt/till salu/tomt/rival) – ritas i ParcelNode. */
  occupied: Set<string>;
  /** Låsta expansionskvarter (ritas som inhägnad mark i ParcelNode). */
  lockedBlocks: Set<string>;
}

const isLocked = (p: Parcel, locked: Set<string>) => !!p.expansion && locked.has(p.blockId);

/* ── Instansieringshjälpare ────────────────────────────────────────── */

interface Inst {
  x: number; y: number; z: number;
  sx?: number; sy?: number; sz?: number;
  rotY?: number;
  color?: Color;
}

/** Bygger en InstancedMesh ur en geometri + lista av transformer. */
function buildInstances(
  geo: BufferGeometry,
  mat: MeshStandardMaterial,
  items: Inst[],
  shadows: { cast?: boolean; receive?: boolean } = {},
): InstancedMesh {
  const mesh = new InstancedMesh(geo, mat, items.length);
  const o = new Object3D();
  items.forEach((it, i) => {
    o.position.set(it.x, it.y, it.z);
    o.rotation.set(0, it.rotY ?? 0, 0);
    o.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    if (it.color) mesh.setColorAt(i, it.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = shadows.cast ?? false;
  mesh.receiveShadow = shadows.receive ?? false;
  return mesh;
}

/** Monterar och städar en engångsbyggd mesh/geometri. */
function useDisposable<T extends { dispose?: () => void } | InstancedMesh>(obj: T | null) {
  useEffect(() => {
    return () => {
      if (obj instanceof InstancedMesh) {
        obj.geometry.dispose();
        obj.dispose();
      } else if (obj && "dispose" in obj && obj.dispose) obj.dispose();
    };
  }, [obj]);
}

/* ── Trottoarer: en instans per gatusida ───────────────────────────── */

function Sidewalks({ lockedBlocks }: { lockedBlocks: Set<string> }) {
  const mesh = useMemo(() => {
    const items: Inst[] = [];
    for (const p of PARCELS) {
      if (isLocked(p, lockedBlocks)) continue;
      const e = p.edges;
      if (e.n) items.push({ x: p.x, y: 0.1, z: p.z - p.d / 2 - 1.5, sx: p.w + 3, sy: 0.2, sz: 3 });
      if (e.s) items.push({ x: p.x, y: 0.1, z: p.z + p.d / 2 + 1.5, sx: p.w + 3, sy: 0.2, sz: 3 });
      if (e.w) items.push({ x: p.x - p.w / 2 - 1.5, y: 0.1, z: p.z, sx: 3, sy: 0.2, sz: p.d + 3 });
      if (e.e) items.push({ x: p.x + p.w / 2 + 1.5, y: 0.1, z: p.z, sx: 3, sy: 0.2, sz: p.d + 3 });
    }
    return buildInstances(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: SIDEWALK }),
      items,
      { receive: true },
    );
  }, [lockedBlocks]);
  useDisposable(mesh);
  return <primitive object={mesh} />;
}

/* ── Markplattor för icke-interaktiva tomter ───────────────────────── */

function PlotPlates({ occupied, lockedBlocks }: CityProps) {
  const mesh = useMemo(() => {
    const items: Inst[] = [];
    for (const p of PARCELS) {
      if (occupied.has(p.id) || isLocked(p, lockedBlocks)) continue;
      const park = !hasAmbientBuilding(p);
      items.push({
        x: p.x, y: 0.07, z: p.z, sx: p.w, sy: 0.14, sz: p.d,
        color: new Color(park ? PARK_GREEN : (PLOT_COLORS[p.district] ?? PLOT_FALLBACK)),
      });
    }
    return buildInstances(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: "#ffffff" }),
      items,
      { receive: true },
    );
  }, [occupied, lockedBlocks]);
  useDisposable(mesh);
  return <primitive object={mesh} />;
}

/* ── Parkträd på obebyggda tomter ──────────────────────────────────── */

function ParkTrees({ occupied, lockedBlocks }: CityProps) {
  const meshes = useMemo(() => {
    const trunks: Inst[] = [];
    const crowns: Inst[] = [];
    for (const p of PARCELS) {
      if (occupied.has(p.id) || isLocked(p, lockedBlocks) || hasAmbientBuilding(p)) continue;
      const hash = parcelHash(p.id);
      const n = 1 + (hash % 3);
      for (let i = 0; i < n; i++) {
        const h = (hash >> (i * 5 + 3)) & 0xff;
        const x = p.x + (((h % 13) - 6) / 13) * p.w * 0.7;
        const z = p.z + ((((h >> 3) % 13) - 6) / 13) * p.d * 0.7;
        const s = 0.85 + ((h >> 5) % 4) * 0.12;
        trunks.push({ x, y: 1.1 * s, z, sx: s, sy: s, sz: s });
        crowns.push({
          x, y: 3.5 * s, z, sx: s, sy: s, sz: s,
          color: new Color(TREE_GREENS[(h >> 2) % TREE_GREENS.length]),
        });
      }
    }
    return [
      buildInstances(new CylinderGeometry(0.35, 0.5, 2.2, 6), new MeshStandardMaterial({ color: TREE_TRUNK }), trunks, { cast: true }),
      buildInstances(new ConeGeometry(2.5, 4.6, 7), new MeshStandardMaterial({ color: "#ffffff" }), crowns, { cast: true }),
    ];
  }, [occupied, lockedBlocks]);
  useDisposable(meshes[0]);
  useDisposable(meshes[1]);
  return (
    <>
      <primitive object={meshes[0]} />
      <primitive object={meshes[1]} />
    </>
  );
}

/* ── Dekorbebyggelse: sammanslagen geometri per hel stad ───────────── */

/** Fyller geometrin med en enhetlig vertexfärg. */
function withColor(g: BufferGeometry, c: Color): BufferGeometry {
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new Float32BufferAttribute(arr, 3));
  return g;
}

/**
 * Fasadbox med fönster-UV bakade i geometrin: fönsterkaklet (4×4)
 * upprepas enligt boxens mått så att en enda delad textur räcker
 * för hela staden. Topp/botten pekar på kaklets vita kant → väggfärg.
 */
function facadeBox(w: number, h: number, d: number, x: number, y: number, z: number, color: Color): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const floors = Math.max(1, Math.round(h / FLOOR_HEIGHT));
  const scaleFace = (face: number, cols: number, rows: number) => {
    for (let i = face * 4; i < face * 4 + 4; i++)
      uv.setXY(i, (uv.getX(i) * cols) / 4, (uv.getY(i) * rows) / 4);
  };
  const colsX = Math.max(2, Math.round(d / 5));
  const colsZ = Math.max(2, Math.round(w / 5));
  scaleFace(0, colsX, floors); // +x
  scaleFace(1, colsX, floors); // -x
  scaleFace(4, colsZ, floors); // +z
  scaleFace(5, colsZ, floors); // -z
  for (let i = 8; i < 16; i++) uv.setXY(i, 0.03, 0.97); // topp/botten
  g.translate(x, y + h / 2, z);
  return withColor(g, color);
}

function plainBox(w: number, h: number, d: number, x: number, y: number, z: number, color: Color): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return withColor(g, color);
}

/** Valmat tak (samma skal-efter-rotation-knep som HipRoof-komponenten). */
function hipRoofGeo(w: number, d: number, x: number, y: number, z: number, rise: number, color: Color): BufferGeometry {
  const base = Math.max(w, d);
  const g = new ConeGeometry(base * 0.72, rise, 4);
  g.rotateY(Math.PI / 4);
  g.scale((w * 1.06) / base, 1, (d * 1.06) / base);
  g.translate(x, y, z);
  return withColor(g, color);
}

const ROOF_RED = new Color("#8a4a3a");
const ROOF_DARK = new Color("#4a4540");

/** Fasadfamilj för dekorbebyggelsen per distrikt (typmix i bakgrundsstaden). */
type AmbientBucket = FacadeKind | "glas";
function ambientKindFor(district: string, seed: number): AmbientBucket {
  switch (district) {
    case "finans": return "glas";
    case "industri": return "industri";
    case "hamnen": return "industri";
    case "centrum": return seed % 4 === 0 ? "kontor" : "bostad";
    case "innerstad": return seed % 3 === 0 ? "butik" : "bostad";
    default: return "bostad";
  }
}

/** Bygger dekorbebyggelsens silhuett för en tomt (fasader + extras). */
function ambientBuildingGeo(p: Parcel, facades: BufferGeometry[], extras: BufferGeometry[]) {
  const hash = parcelHash(p.id);
  const seed = hash >> 3;
  const floors = districtFloors(p, hash);
  const color = new Color(ambientColorFor(p.district, hash >> 2));
  const dim = new Color().copy(color);
  const h = floors * FLOOR_HEIGHT;

  switch (p.district) {
    case "centrum": {
      facades.push(facadeBox(p.w, h, p.d, p.x, 0, p.z, color));
      extras.push(plainBox(p.w * 0.99, 0.7, p.d * 0.99, p.x, h, p.z, dim.multiplyScalar(0.6)));
      break;
    }
    case "finans": {
      facades.push(facadeBox(p.w * 0.72, h, p.d * 0.72, p.x, 0, p.z, color));
      extras.push(plainBox(p.w * 0.5, 1.2, p.d * 0.5, p.x, h, p.z, dim.multiplyScalar(0.55)));
      break;
    }
    case "innerstad": {
      const w = p.w * 0.96;
      const d = p.d * 0.96;
      facades.push(facadeBox(w, h, d, p.x, 0, p.z, color));
      if (seed % 5 < 2) extras.push(hipRoofGeo(w, d, p.x, h + 1.1, p.z, 2.4, ROOF_RED));
      else extras.push(plainBox(w * 0.55, 1.8, d * 0.55, p.x, h, p.z, dim.multiplyScalar(0.85)));
      break;
    }
    case "förort": {
      const houses = 4 + (seed % 3);
      const perRow = Math.ceil(houses / 2);
      const hw = p.w / perRow - 4.5;
      const hd = 9;
      for (let i = 0; i < houses; i++) {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const hFloors = Math.max(2, Math.min(4, floors + ((seed >> (i * 2)) % 2) - ((seed >> (i * 2 + 1)) % 2)));
        const hh = hFloors * FLOOR_HEIGHT;
        const x = p.x - p.w / 2 + (col + 0.5) * (p.w / perRow);
        const z = row === 0 ? p.z - p.d / 2 + hd / 2 + 2.5 : p.z + p.d / 2 - hd / 2 - 2.5;
        facades.push(facadeBox(hw, hh, hd, x, 0, z, color));
        extras.push(hipRoofGeo(hw, hd, x, hh + 0.8, z, 1.8, (seed >> 3) % 2 ? ROOF_RED : ROOF_DARK));
      }
      break;
    }
    case "industri": {
      const hallH = 7 + (seed % 3) * 1.5;
      const w = p.w * 0.92;
      const d = p.d * 0.8;
      extras.push(plainBox(w + 1, 1, d + 1, p.x, 0, p.z, new Color("#9a988e")));
      facades.push(facadeBox(w, hallH, d, p.x, 1, p.z, color));
      extras.push(hipRoofGeo(w * 0.9, d * 0.86, p.x, hallH + 2.1, p.z, 2.4, dim.multiplyScalar(0.7)));
      break;
    }
    case "hamnen": {
      const w = p.w * 0.9;
      const d = p.d * 0.78;
      const hh = Math.max(2, floors) * FLOOR_HEIGHT * 0.9;
      facades.push(facadeBox(w, hh, d, p.x, 0, p.z, color));
      extras.push(hipRoofGeo(w, d, p.x, hh + 1.3, p.z, 2.8, seed % 2 ? ROOF_DARK : new Color("#5d4a3a")));
      break;
    }
    default: {
      // Villakullen
      const vh = Math.min(2, floors) * FLOOR_HEIGHT;
      const vw = p.w * 0.55;
      const vd = p.d * 0.55;
      facades.push(facadeBox(vw, vh, vd, p.x, 0, p.z, color));
      const roof = new ConeGeometry(vw * 0.8, 2.4, 4);
      roof.rotateY(Math.PI / 4);
      roof.translate(p.x, vh + 1.2, p.z);
      extras.push(withColor(roof, seed % 3 ? ROOF_RED : ROOF_DARK));
      if (seed % 2 === 0)
        extras.push(plainBox(4, 2.4, 3.4, p.x + vw * 0.85, 0, p.z - vd * 0.5, dim.multiplyScalar(0.85)));
    }
  }
}

const AMBIENT_BUCKETS: AmbientBucket[] = ["bostad", "kontor", "butik", "industri", "glas"];

function AmbientBuildings({ occupied, lockedBlocks }: CityProps) {
  const overlayActive = useUiStore((s) => s.overlay !== "ingen");

  const geos = useMemo(() => {
    const facades = new Map<AmbientBucket, BufferGeometry[]>();
    const extras: BufferGeometry[] = [];
    const all: BufferGeometry[] = [];
    for (const p of PARCELS) {
      if (occupied.has(p.id) || isLocked(p, lockedBlocks) || !hasAmbientBuilding(p)) continue;
      const kind = ambientKindFor(p.district, parcelHash(p.id) >> 3);
      const bucket = facades.get(kind) ?? [];
      ambientBuildingGeo(p, bucket, extras);
      facades.set(kind, bucket);
    }
    const merged = new Map<AmbientBucket, BufferGeometry>();
    for (const [kind, list] of facades) {
      if (list.length) merged.set(kind, mergeGeometries(list, false));
      all.push(...list);
    }
    const ext = extras.length ? mergeGeometries(extras, false) : null;
    for (const g of [...all, ...extras]) g.dispose();
    return { merged, ext };
  }, [occupied, lockedBlocks]);

  const mats = useMemo(() => {
    const facade = new Map<AmbientBucket, MeshStandardMaterial>();
    for (const kind of AMBIENT_BUCKETS) {
      facade.set(
        kind,
        kind === "glas"
          ? new MeshStandardMaterial({ vertexColors: true, map: glassTexture(4, 4), roughness: 0.35, metalness: 0.25 })
          : new MeshStandardMaterial({ vertexColors: true, map: facadeTexture(kind), roughness: 0.82, metalness: 0.02 }),
      );
    }
    return {
      facade,
      extra: new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
      // Kartlager: dekor gråtonas så spelarens metrikfärger dominerar.
      overlay: new MeshStandardMaterial({ color: "#b0b4b0", roughness: 0.9 }),
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const g of geos.merged.values()) g.dispose();
      geos.ext?.dispose();
    };
  }, [geos]);
  useEffect(() => {
    return () => {
      for (const m of mats.facade.values()) m.dispose();
      mats.extra.dispose();
      mats.overlay.dispose();
    };
  }, [mats]);

  return (
    <>
      {[...geos.merged.entries()].map(([kind, geo]) => (
        <mesh
          key={kind}
          geometry={geo}
          material={overlayActive ? mats.overlay : mats.facade.get(kind)}
          castShadow
          receiveShadow
        />
      ))}
      {geos.ext && (
        <mesh geometry={geos.ext} material={overlayActive ? mats.overlay : mats.extra} castShadow receiveShadow />
      )}
    </>
  );
}

/** Hela den statiska staden – fyra billiga komponenter. */
export function StaticCity({ occupied, lockedBlocks }: CityProps) {
  return (
    <>
      <Sidewalks lockedBlocks={lockedBlocks} />
      <PlotPlates occupied={occupied} lockedBlocks={lockedBlocks} />
      <ParkTrees occupied={occupied} lockedBlocks={lockedBlocks} />
      <AmbientBuildings occupied={occupied} lockedBlocks={lockedBlocks} />
    </>
  );
}
