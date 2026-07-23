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
  MeshStandardMaterial,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ThreeEvent } from "@react-three/fiber";
import { PARCELS, ZONE_DEFS, hasAmbientBuilding, parcelAt, parcelHash, type Parcel } from "../engine/city";
import { type Inst, buildInstances, useDisposable, withColor } from "./meshHelpers";
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
import { drivewayInstances, plotKerbInstances } from "./streetFurniture";
import { ambientProfile } from "../engine/landDeals";
import {
  facadeEmissiveTexture,
  facadeTexture,
  glassEmissiveTexture,
  glassTexture,
  type FacadeKind,
  type FacadeVariant,
} from "./textures";

interface CityProps {
  /** Tomter med spelinnehåll (ägt/till salu/tomt/rival) – ritas i ParcelNode. */
  occupied: Set<string>;
  /** Låsta expansionskvarter (ritas som inhägnad mark i ParcelNode). */
  lockedBlocks: Set<string>;
  /** Dekorhus som vuxit fram organiskt under spelets gång. */
  grown: Set<string>;
}

const isLocked = (p: Parcel, locked: Set<string>) => !!p.expansion && locked.has(p.blockId);

/* ── Trottoarer: en instans per gatusida ───────────────────────────── */

function Sidewalks({ lockedBlocks }: { lockedBlocks: Set<string> }) {
  const mesh = useMemo(() => {
    const items: Inst[] = [];
    // Trottoarbredd per distrikt: max 19 % av gatubredden per sida, så att
    // körbanan (62 % av gatan) alltid syns. Med fast bredd 3 svalde
    // trottoarerna hela gatunätet i Villakullen (gator på bara 6 enheter).
    const sw = (district: string) => {
      const street = ZONE_DEFS.find((z) => z.district === district)?.street ?? 10;
      return Math.min(3, Math.max(1, street * 0.19));
    };
    for (const p of PARCELS) {
      if (isLocked(p, lockedBlocks)) continue;
      const e = p.edges;
      const w = sw(p.district);
      if (e.n) items.push({ x: p.x, y: 0.1, z: p.z - p.d / 2 - w / 2, sx: p.w + w, sy: 0.2, sz: w });
      if (e.s) items.push({ x: p.x, y: 0.1, z: p.z + p.d / 2 + w / 2, sx: p.w + w, sy: 0.2, sz: w });
      if (e.w) items.push({ x: p.x - p.w / 2 - w / 2, y: 0.1, z: p.z, sx: w, sy: 0.2, sz: p.d + w });
      if (e.e) items.push({ x: p.x + p.w / 2 + w / 2, y: 0.1, z: p.z, sx: w, sy: 0.2, sz: p.d + w });
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

/* ── Tomtkant + infart: rena gränser och tydliga in-/utfarter ──────── */

function StreetFurniture({ occupied, lockedBlocks, grown }: CityProps) {
  const hasBuilding = (p: Parcel) =>
    !isLocked(p, lockedBlocks) && (occupied.has(p.id) || hasAmbientBuilding(p, grown));

  // Infartsplattorna (asfalt) – ligger under kantstenen, ovanpå trottoaren.
  const drives = useMemo(
    () =>
      buildInstances(
        new BoxGeometry(1, 1, 1),
        new MeshStandardMaterial({ color: "#8f9196", roughness: 0.92 }),
        drivewayInstances(hasBuilding),
        { receive: true },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [occupied, lockedBlocks, grown],
  );
  // Tomtkanten (ljus kantsten) – en jämn lip runt hela den bebyggda tomten.
  const kerbs = useMemo(
    () =>
      buildInstances(
        new BoxGeometry(1, 1, 1),
        new MeshStandardMaterial({ color: "#d2cfc4", roughness: 0.85 }),
        plotKerbInstances(hasBuilding),
        { receive: true },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [occupied, lockedBlocks, grown],
  );
  useDisposable(drives);
  useDisposable(kerbs);
  return (
    <>
      <primitive object={drives} />
      <primitive object={kerbs} />
    </>
  );
}

/* ── Markplattor för icke-interaktiva tomter ───────────────────────── */

function PlotPlates({ occupied, lockedBlocks, grown, onAmbientClick }: CityProps & { onAmbientClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const mesh = useMemo(() => {
    const items: Inst[] = [];
    for (const p of PARCELS) {
      if (occupied.has(p.id) || isLocked(p, lockedBlocks)) continue;
      const park = !hasAmbientBuilding(p, grown);
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
  }, [occupied, lockedBlocks, grown]);
  useDisposable(mesh);
  return <primitive object={mesh} onClick={onAmbientClick} />;
}

/* ── Parkträd på obebyggda tomter ──────────────────────────────────── */

function ParkTrees({ occupied, lockedBlocks, grown }: CityProps) {
  const meshes = useMemo(() => {
    const trunks: Inst[] = [];
    const crowns: Inst[] = [];
    for (const p of PARCELS) {
      if (occupied.has(p.id) || isLocked(p, lockedBlocks) || hasAmbientBuilding(p, grown)) continue;
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
  }, [occupied, lockedBlocks, grown]);
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

const PLYWOOD = new Color("#8a7a5c");

/** Bygger dekorbebyggelsens silhuett för en tomt (fasader + extras). */
function ambientBuildingGeo(p: Parcel, facades: BufferGeometry[], extras: BufferGeometry[]) {
  const hash = parcelHash(p.id);
  const seed = hash >> 3;
  const floors = districtFloors(p, hash);
  const color = new Color(ambientColorFor(p.district, hash >> 2));
  // Väder fasaden efter tomtens dekorskick (samma skala som spelhusens
  // facadeColor). Skicket är detsamma som BUY_AMBIENT använder (ambientProfile),
  // så nedgångna hus syns gråare på kartan och man kan spana efter förvärvs-
  // och renoveringslägen – kartan och affären är överens.
  const condition = ambientProfile(p).condition;
  const worn = condition < 40;
  color.lerp(new Color("#6f6a61"), ((100 - condition) / 100) * 0.55);
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
      // Slitna villor: plywood för fönstren, så förfallet syns även på
      // dekorhusen (samma signal som spelhusens "sliten"-variant).
      if (worn) {
        extras.push(plainBox(1.7, 2.0, 0.2, p.x - vw * 0.18, 0.9, p.z + vd / 2, PLYWOOD));
        extras.push(plainBox(0.2, 2.0, 1.5, p.x + vw / 2, 0.9, p.z + vd * 0.15, new Color(PLYWOOD).multiplyScalar(0.85)));
      }
    }
  }
}

const AMBIENT_BUCKETS: AmbientBucket[] = ["bostad", "kontor", "butik", "industri", "glas"];
/** Fasadhink + tillstånd: slitna dekorhus (skick < 40) får sliten-kaklet
 *  med smuts och släckta fönster, precis som spelhusen. Glas saknar
 *  slitenvariant. */
type BucketKey = `${AmbientBucket}:${Extract<FacadeVariant, "normal" | "sliten">}`;

function AmbientBuildings({ occupied, lockedBlocks, grown, onAmbientClick }: CityProps & { onAmbientClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const overlayActive = useUiStore((s) => s.overlay !== "ingen");

  const geos = useMemo(() => {
    const facades = new Map<BucketKey, BufferGeometry[]>();
    const extras: BufferGeometry[] = [];
    const all: BufferGeometry[] = [];
    for (const p of PARCELS) {
      if (occupied.has(p.id) || isLocked(p, lockedBlocks) || !hasAmbientBuilding(p, grown)) continue;
      const kind = ambientKindFor(p.district, parcelHash(p.id) >> 3);
      const worn = kind !== "glas" && ambientProfile(p).condition < 40;
      const key: BucketKey = `${kind}:${worn ? "sliten" : "normal"}`;
      const bucket = facades.get(key) ?? [];
      ambientBuildingGeo(p, bucket, extras);
      facades.set(key, bucket);
    }
    const merged = new Map<BucketKey, BufferGeometry>();
    for (const [key, list] of facades) {
      if (list.length) merged.set(key, mergeGeometries(list, false));
      all.push(...list);
    }
    const ext = extras.length ? mergeGeometries(extras, false) : null;
    for (const g of [...all, ...extras]) g.dispose();
    return { merged, ext };
  }, [occupied, lockedBlocks, grown]);

  const mats = useMemo(() => {
    const facade = new Map<BucketKey, MeshStandardMaterial>();
    for (const kind of AMBIENT_BUCKETS) {
      for (const variant of ["normal", "sliten"] as const) {
        if (kind === "glas" && variant === "sliten") continue;
        // Emissivkaklet får även dekorstadens tända fönster att glöda;
        // vertexfärgerna tintar bara diffusen, inte glöden.
        facade.set(
          `${kind}:${variant}`,
          kind === "glas"
            ? new MeshStandardMaterial({
                vertexColors: true, map: glassTexture(4, 4), roughness: 0.3, metalness: 0.32,
                emissiveMap: glassEmissiveTexture(4, 4), emissive: "#ffffff", emissiveIntensity: 0.5,
              })
            : new MeshStandardMaterial({
                vertexColors: true, map: facadeTexture(kind, variant), roughness: 0.82, metalness: 0.02,
                emissiveMap: facadeEmissiveTexture(kind, variant), emissive: "#ffffff", emissiveIntensity: 0.5,
              }),
        );
      }
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
          onClick={onAmbientClick}
        />
      ))}
      {geos.ext && (
        <mesh geometry={geos.ext} material={overlayActive ? mats.overlay : mats.extra} castShadow receiveShadow onClick={onAmbientClick} />
      )}
    </>
  );
}

/** Hela den statiska staden – fyra billiga komponenter. */
export function StaticCity({ occupied, lockedBlocks, grown }: CityProps) {
  const select = useUiStore((s) => s.select);

  // Dekorhusen ritas sammanslaget men är ändå klickbara: träffpunkten
  // slås upp mot tomtkartan och det privatägda huset kan väljas (och
  // köpas loss i kartkortet).
  const onAmbientClick = (e: ThreeEvent<MouseEvent>) => {
    const pc = parcelAt(e.point.x, e.point.z);
    if (pc && !occupied.has(pc.id) && hasAmbientBuilding(pc, grown)) {
      e.stopPropagation();
      select(pc.id);
    }
  };

  return (
    <>
      <Sidewalks lockedBlocks={lockedBlocks} />
      <StreetFurniture occupied={occupied} lockedBlocks={lockedBlocks} grown={grown} />
      <PlotPlates occupied={occupied} lockedBlocks={lockedBlocks} grown={grown} onAmbientClick={onAmbientClick} />
      <ParkTrees occupied={occupied} lockedBlocks={lockedBlocks} grown={grown} />
      <AmbientBuildings occupied={occupied} lockedBlocks={lockedBlocks} grown={grown} onAmbientClick={onAmbientClick} />
    </>
  );
}
