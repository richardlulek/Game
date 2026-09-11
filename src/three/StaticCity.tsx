import {urbanFacadeParts} from "./urbanFacadeParts";
import {workplaceFacadeParts} from "./workplaceFacadeParts";
import { centrumMassing } from "./centrumMassing";
import { turretDetails } from "./centrumDetails";
import { propertyFacadeColor } from "./propertyAppearance";
import { financeMassing } from "./financeMassing";
import { villaAnnex } from "./villaAnnex";
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

import { memo, useEffect, useMemo } from "react";
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
import { PARCELS, hasAmbientBuilding, parcelAt, parcelHash, type Parcel } from "../engine/city";
import { type Inst, buildInstances, useDisposable, withColor } from "./meshHelpers";
import { useUiStore } from "../store/uiStore";
import { facadeStructure, type StructureKind } from "./facadeStructure";
import { suburbParts } from "./suburbParts";
import { architecturePalette } from "./architecturePalette";
import { suburbFloors, suburbLayout } from "./suburbLayout";
import { FLOOR_HEIGHT } from "./BuildingShapes";
import {
  PARK_GREEN,
  PLOT_COLORS,
  PLOT_FALLBACK,
  TREE_GREENS,
  TREE_TRUNK,
} from "./colors";
import { districtFloors } from "./districtBuildings";
import { ambientProfile } from "../engine/landDeals";
import { facadeSurfaceMaps } from "./surfaceMaps";
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

/* Tomtkant + infart togs bort: kantstenslippen runt hela tomten och
   asfaltinfarten staplades ovanpå trottoaren och gav ett rörigt
   dubbelt kantband vid infarten och runt området. Trottoaren (Sidewalks)
   läser nu ensam som en ren fastighetsgräns. streetFurniture.ts finns
   kvar om en diskret infart ska återinföras senare. */

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
  const kind = ambientKindFor(p.district, seed);
  const color = new Color(propertyFacadeColor(p.district, hash, kind === "glas" ? "kontor" : kind, ambientProfile(p).condition));
  // Väder fasaden efter tomtens dekorskick (samma skala som spelhusens
  // facadeColor). Skicket är detsamma som BUY_AMBIENT använder (ambientProfile),
  // så nedgångna hus syns gråare på kartan och man kan spana efter förvärvs-
  // och renoveringslägen – kartan och affären är överens.
  const condition = ambientProfile(p).condition;
  const worn = condition < 40;

  const h = floors * FLOOR_HEIGHT;

  const appendParts=(groups:ReturnType<typeof urbanFacadeParts>|ReturnType<typeof workplaceFacadeParts>,x:number,z:number,y=0)=>{
    for(const group of groups) for(const part of group.items) {
      const g=new BoxGeometry(part.sx,part.sy,part.sz);g.rotateY(part.rotY??0);g.translate(x+part.x,y+part.y,z+part.z);
      extras.push(withColor(g,new Color(group.color)));
    }
  };
  switch (p.district) {
    case "centrum": {
      const m=centrumMassing(p,seed);
      extras.push(plainBox(m.mainW,h,m.mainD,p.x+m.offX,0,p.z+m.offZ,color));
      appendParts(urbanFacadeParts({w:m.mainW,d:m.mainD,h,color:color.getStyle(),seed,classical:true,sx:m.sx,sz:m.sz,shop:kind==="butik"}),p.x+m.offX,p.z+m.offZ);
      extras.push(plainBox(m.mainW*1.05,.55,m.mainD*1.05,p.x+m.offX,h-.825,p.z+m.offZ,new Color(architecturePalette(color.getStyle()).frame)));
      extras.push(plainBox(m.mainW*.99,.7,m.mainD*.99,p.x+m.offX,h,p.z+m.offZ,color.clone().multiplyScalar(.6)));
      if(m.hasInside) {
        extras.push(plainBox(m.wingW,m.wingH,m.wingD,p.x-m.offX,0,p.z-m.offZ,color));
        appendParts(urbanFacadeParts({w:m.wingW,d:m.wingD,h:m.wingH,color:color.getStyle(),seed,classical:true,sx:-m.sx,sz:-m.sz,entrance:false}),p.x-m.offX,p.z-m.offZ);
        extras.push(plainBox(m.wingW+.2,.2,m.wingD+.2,p.x-m.offX,m.wingH,p.z-m.offZ,new Color(architecturePalette(color.getStyle()).frame)));
      }
      if(m.turret) {
        const tx=p.x+m.offX+m.ex*(m.mainW/2-.5),tz=p.z+m.offZ+m.ez*(m.mainD/2-.5);
        const body=new CylinderGeometry(2,2,h+1.6,10);body.translate(tx,(h+1.6)/2,tz);extras.push(withColor(body,color));
        const roof=new ConeGeometry(2.35,2.6,10);roof.translate(tx,h+2.9,tz);extras.push(withColor(roof,(seed>>1)%2?new Color('#4a6152'):ROOF_DARK));
        const details=turretDetails(floors),palette=architecturePalette(color.getStyle());
        for(const [kind,parts] of Object.entries(details)) for(const part of parts) {
          const g=kind==='bands'?new CylinderGeometry(1,1,1,10):new BoxGeometry();
          g.scale(part.sx??1,part.sy??1,part.sz??1);g.rotateY(part.rotY??0);g.translate(tx+part.x,part.y,tz+part.z);
          extras.push(withColor(g,new Color(kind==='panes'?palette.glass:palette.frame)));
        }
      }
      break;
    }
    case "finans": {
      for (const v of financeMassing(p,h,seed)) {
        const g=facadeBox(v.w,v.h,v.d,0,0,0,color);
        if(v.rotation) g.rotateY(v.rotation);
        g.translate(p.x,v.y??0,p.z);facades.push(g);
        const roof=plainBox(v.w,0.16,v.d,0,v.h,0,new Color("#656a66"));
        if(v.rotation) roof.rotateY(v.rotation);
        roof.translate(p.x,v.y??0,p.z);extras.push(roof);
      }
      break;
    }
    case "innerstad": {
      const w = p.w * 0.96;
      const d = p.d * 0.96;
      extras.push(plainBox(w,h,d,p.x,0,p.z,color));
      const {sx,sz}=centrumMassing(p,seed);
      appendParts(urbanFacadeParts({w,d,h,color:color.getStyle(),seed,classical:seed%5<2,sx,sz,shop:kind==="butik"}),p.x,p.z);
      if (seed % 5 < 2) extras.push(hipRoofGeo(w, d, p.x, h + 1.1, p.z, 2.4, ROOF_RED));
      else {
        extras.push(plainBox(w*.55,1.8,d*.55,p.x,h,p.z,color));
        appendParts(urbanFacadeParts({w:w*.55,d:d*.55,h:1.8,color:color.getStyle(),seed,classical:false,sx,sz,entrance:false}),p.x,p.z,h);
        extras.push(plainBox(w*.55+.25,.12,d*.55+.25,p.x,h+1.8,p.z,new Color('#6f736b')));

      }
      break;
    }
    case "förort": {
      const layout = suburbLayout(p, seed);
      layout.houses.forEach((house, i) => {
        const hh = suburbFloors(floors, seed, Math.floor(i / layout.columns)) * FLOOR_HEIGHT;
        const { w: hw, d: hd } = house, x = p.x + house.x, z = p.z + house.z;
        extras.push(plainBox(hw, hh, hd, x, 0, z, color));
        extras.push(plainBox(hw + 0.08, 0.65, hd + 0.08, x, 0, z, new Color("#aaa69b")));
        if (seed % 4 === 0) extras.push(plainBox(hw * 1.03, 0.6, hd * 1.03, x, hh, z, ROOF_DARK));
        else {
          const rise = Math.min(2.2, hd * 0.22);
          const roof = new BoxGeometry(hw + 0.45, rise, hd + 0.44);
          const positions = roof.attributes.position;
          for (let j = 0; j < positions.count; j++) if (positions.getY(j) > 0) positions.setZ(j, 0);
          roof.computeVertexNormals(); roof.translate(x, hh + rise / 2, z);
          withColor(roof, (seed >> 3) % 2 ? ROOF_RED : ROOF_DARK);
          const vertexColors=roof.attributes.color,normals=roof.attributes.normal;
          for(let j=0;j<normals.count;j++) if(Math.abs(normals.getX(j))>.9) vertexColors.setXYZ(j,color.r,color.g,color.b);
          extras.push(roof);
        }
      });
      for (const group of suburbParts(p, seed, floors, true, condition >= 70, false, false)) for (const part of group.items) {
        const g = new BoxGeometry(part.sx, part.sy, part.sz);
        g.translate(p.x + part.x, part.y, p.z + part.z);
        extras.push(withColor(g, part.color ?? new Color(group.color)));
      }
      break;
    }
    case "industri": {
      const hallH = 7 + (seed % 3) * 1.5;
      const w = p.w * 0.92;
      const d = p.d * 0.8;
      extras.push(plainBox(w + 1, 1, d + 1, p.x, 0, p.z, new Color("#9a988e")));
      extras.push(plainBox(w,hallH,d,p.x,1,p.z,color));
      const {sx,sz}=centrumMassing(p,seed);
      appendParts(workplaceFacadeParts({w,d,h:hallH,color:color.getStyle(),warehouse:false,sx,sz}),p.x,p.z,1);
      const monitors=2+seed%2;
      for(let i=0;i<monitors;i++) extras.push(hipRoofGeo(w/monitors*0.86,d*0.86,p.x-w/2+(i+0.5)*w/monitors,hallH+2.1,p.z,2.4,color.clone().multiplyScalar(0.7)));
      break;
    }
    case "hamnen": {
      const w = p.w * 0.9;
      const d = p.d * 0.78;
      const hh = Math.max(2, floors) * FLOOR_HEIGHT * 0.9;
      extras.push(plainBox(w,hh,d,p.x,0,p.z,color));
      appendParts(workplaceFacadeParts({w,d,h:hh,color:color.getStyle(),warehouse:true,sx:0,sz:1}),p.x,p.z);
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
      if (seed % 2 === 0) for (const part of villaAnnex(vw, vd, color.getStyle()))
        extras.push(plainBox(part.sx, part.sy, part.sz, p.x + part.x, part.y - part.sy / 2, p.z + part.z, new Color(part.color)));
      if (seed % 3 === 0) {
        facades.push(facadeBox(vw * 0.6, 3, vd * 0.75, p.x - vw * 0.68, 0, p.z + vd * 0.3, color));
        const wingRoof=new ConeGeometry(vw*.44,1.1,4);wingRoof.rotateY(Math.PI/4);wingRoof.translate(p.x-vw*.68,3.55,p.z+vd*.3);
        extras.push(withColor(wingRoof,seed%3?ROOF_RED:ROOF_DARK));
      }
      // A compact residential door replaces the former full-width blue panel.
      extras.push(plainBox(1.1, 2.15, 0.12, p.x, 0.1, p.z + vd / 2 + 0.04, new Color("#575e59")));
      extras.push(plainBox(1.5, 0.12, 0.7, p.x, 2.45, p.z + vd / 2 + 0.25, color));
      // Slitna villor: plywood för fönstren, så förfallet syns även på
      // dekorhusen (samma signal som spelhusens "sliten"-variant).
      if (worn) {
        extras.push(plainBox(1.7, 2.0, 0.2, p.x - vw * 0.18, 0.9, p.z + vd / 2, PLYWOOD));
        extras.push(plainBox(0.2, 2.0, 1.5, p.x + vw / 2, 0.9, p.z + vd * 0.15, new Color(PLYWOOD).multiplyScalar(0.85)));
      }
    }
  }
  if (p.district === "finans" || p.district === "kulle") {
    const kind: StructureKind = p.district === "finans" ? "office" : "masonry";
    const height=p.district === "kulle" ? Math.min(2,floors)*3 : h;
    const entry: [number,number]=p.edges.s?[0,1]:p.edges.n?[0,-1]:p.edges.e?[1,0]:[-1,0];
    const sharedPalette=architecturePalette(color.getStyle());
    const palette={frame:new Color(sharedPalette.frame),base:new Color(sharedPalette.base),glass:new Color(sharedPalette.glass)};
    const volumes=p.district === "finans" ? financeMassing(p,h,seed).map(v=>({...v,x:p.x,z:p.z})) : [{w:p.w*.55,d:p.d*.55,h:height,x:p.x,z:p.z,y:0}];
    for (const volume of volumes) for (const part of facadeStructure(volume, kind, true, p.district === "kulle" || (volume.y??0)>0 ? undefined : entry)) {
      const geometry = new BoxGeometry(part.sx, part.sy, part.sz);
      geometry.rotateY(part.rotY); geometry.translate(part.x, part.y, part.z);
      extras.push(withColor(geometry, palette[part.surface]));
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
                ...facadeSurfaceMaps("kontor", "normal", true), bumpScale: 0.035, envMapIntensity: 0.85,
                emissiveMap: glassEmissiveTexture(4, 4), emissive: "#ffffff", emissiveIntensity: 0.5,
              })
            : new MeshStandardMaterial({
                vertexColors: true, map: facadeTexture(kind, variant), roughness: 0.82, metalness: 0.02,
                ...facadeSurfaceMaps(kind, variant), bumpScale: 0.16, envMapIntensity: 0.3,
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
function StaticCityInner({ occupied, lockedBlocks, grown }: CityProps) {
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

      <PlotPlates occupied={occupied} lockedBlocks={lockedBlocks} grown={grown} onAmbientClick={onAmbientClick} />
      <ParkTrees occupied={occupied} lockedBlocks={lockedBlocks} grown={grown} />
      <AmbientBuildings occupied={occupied} lockedBlocks={lockedBlocks} grown={grown} onAmbientClick={onAmbientClick} />
    </>
  );
}

/* Memoiserad: occupied/lockedBlocks/grown är memoiserade i CityParcels och
   stabila mellan dagsticks, så den statiska staden (trottoarer, plattor, träd,
   dekorhus) rekoncilieras inte varje bildruta medan kalendern rullar. */
export const StaticCity = memo(StaticCityInner);
