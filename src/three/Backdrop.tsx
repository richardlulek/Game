/* ============================================================
   Bakgrundsvärlden – landskapet UTANFÖR staden så kartan inte
   slutar i tomt gräs:

   · Åkerlappar i lapptäcke närmast stadsranden
   · Skogsbälten (instansierade träd) runt hela staden
   · Mjuka kullar och en blånande bergskedja vid horisonten
   · Skärgårdsöar med fyr söderut i vattnet + bortre strandlinje
   · Vindkraftverk som snurrar på slätten öster om Industriområdet

   Allt är statisk dekor: sammanslagen geometri + instansiering
   (~15 draw calls totalt), inga skuggor och ingen interaktion.
   ============================================================ */

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  type Group,
  MeshStandardMaterial,
  SphereGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TREE_GREENS, TREE_TRUNK } from "./colors";
import { type Inst, buildInstances, useDisposable, withColor } from "./meshHelpers";

/* ── Deterministisk slump (mulberry32) – samma landskap varje gång ─── */

function makeRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Frizoner: staden och vattnet får inte växa igen ───────────────── */

interface Rect { x0: number; x1: number; z0: number; z1: number }
const CITY: Rect = { x0: -470, x1: 520, z0: -390, z1: 350 };
const WATER: Rect = { x0: -900, x1: 940, z0: 300, z1: 670 };

const inRect = (x: number, z: number, r: Rect, m = 0) =>
  x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
const onLand = (x: number, z: number, m = 0) =>
  !inRect(x, z, CITY, m) && !inRect(x, z, WATER, m);

/** Slumpad punkt i ringen runt staden (radie r0–r1, lätt utdragen i x). */
function ringPoint(rand: () => number, r0: number, r1: number): [number, number] {
  const a = rand() * Math.PI * 2;
  const r = r0 + Math.sqrt(rand()) * (r1 - r0);
  return [Math.cos(a) * r * 1.15, Math.sin(a) * r];
}

/* ── Sammanslagen engångsgeometri med städning ─────────────────────── */

function useMerged(build: () => BufferGeometry[]): BufferGeometry | null {
  const geo = useMemo(() => {
    const parts = build();
    if (!parts.length) return null;
    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => geo?.dispose(), [geo]);
  return geo;
}

const LAND_MAT = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });

/* ── Åkerlappar: lapptäcke av odlad mark närmast staden ────────────── */

const FIELD_COLORS = ["#a8b06a", "#c2b06b", "#8ca35f", "#b5a874", "#95a86b", "#c9bd7e"];

function Fields() {
  const geo = useMerged(() => {
    const rand = makeRand(4711);
    const parts: BufferGeometry[] = [];
    let guard = 0;
    while (parts.length < 34 && guard++ < 400) {
      const [x, z] = ringPoint(rand, 460, 800);
      const w = 55 + rand() * 85;
      const d = 45 + rand() * 75;
      if (!onLand(x, z, Math.max(w, d) / 2)) continue;
      const g = new BoxGeometry(w, 0.6, d);
      g.translate(x, 0.2, z);
      parts.push(withColor(g, new Color(FIELD_COLORS[Math.floor(rand() * FIELD_COLORS.length)])));
    }
    return parts;
  });
  return geo ? <mesh geometry={geo} material={LAND_MAT} /> : null;
}

/* ── Kullar nära + bergskedja vid horisonten ───────────────────────── */

const HILL_GREENS = ["#7d9468", "#87a070", "#6f8a5e", "#93a878"];

function Hills() {
  const geo = useMerged(() => {
    const rand = makeRand(1337);
    const parts: BufferGeometry[] = [];
    let guard = 0;
    while (parts.length < 18 && guard++ < 400) {
      const [x, z] = ringPoint(rand, 540, 980);
      const r = 38 + rand() * 55;
      if (!onLand(x, z, r)) continue;
      const g = new SphereGeometry(r, 14, 10);
      g.scale(1 + rand() * 0.5, 0.22 + rand() * 0.16, 1);
      g.translate(x, 0, z);
      parts.push(withColor(g, new Color(HILL_GREENS[Math.floor(rand() * HILL_GREENS.length)])));
    }
    return parts;
  });
  return geo ? <mesh geometry={geo} material={LAND_MAT} /> : null;
}

function Mountains() {
  const geo = useMerged(() => {
    const rand = makeRand(90210);
    const parts: BufferGeometry[] = [];
    for (let i = 0; i < 16; i++) {
      // Båge över väst–norr–öst; södern lämnas öppen mot havshorisonten.
      const a = Math.PI + (i / 15) * Math.PI * 1.55 - Math.PI * 0.275;
      const r = 1020 + rand() * 160;
      const x = Math.cos(a) * r * 1.1;
      const z = Math.sin(a) * r;
      if (z > 520) continue;
      const base = 120 + rand() * 110;
      const h = 75 + rand() * 110;
      // Blånande med avstånd (atmosfäriskt perspektiv förstärker foggen).
      const tone = new Color("#8ba1b4").lerp(new Color("#a9bccb"), rand() * 0.7);
      const peak = new ConeGeometry(base, h, 6);
      peak.translate(x, h / 2 - 4, z);
      parts.push(withColor(peak, tone));
      if (h > 130) {
        const snow = new ConeGeometry(base * 0.28, h * 0.28, 6);
        snow.translate(x, h - (h * 0.28) / 2 - 3, z);
        parts.push(withColor(snow, new Color("#eef3f7")));
      }
    }
    return parts;
  });
  return geo ? <mesh geometry={geo} material={LAND_MAT} /> : null;
}

/* ── Skogsbälten: instansierade träd runt staden och bortre stranden ─ */

function ForestBelt() {
  const meshes = useMemo(() => {
    const rand = makeRand(2024);
    const trunks: Inst[] = [];
    const crowns: Inst[] = [];
    let guard = 0;
    // Skog växer i dungar: slumpa dungcentra, fyll varje med träd.
    while (crowns.length < 950 && guard++ < 600) {
      const [cx, cz] = ringPoint(rand, 460, 880);
      if (!onLand(cx, cz, 16)) continue;
      const n = 7 + Math.floor(rand() * 14);
      for (let i = 0; i < n; i++) {
        const x = cx + (rand() + rand() - 1) * 42;
        const z = cz + (rand() + rand() - 1) * 42;
        if (!onLand(x, z, 4)) continue;
        const s = 1.3 + rand() * 1.5;
        trunks.push({ x, y: 1.1 * s, z, sx: s, sy: s, sz: s });
        crowns.push({
          x, y: 3.5 * s, z, sx: s, sy: s, sz: s,
          color: new Color(TREE_GREENS[Math.floor(rand() * TREE_GREENS.length)]),
        });
      }
    }
    return [
      buildInstances(new CylinderGeometry(0.35, 0.5, 2.2, 5), new MeshStandardMaterial({ color: TREE_TRUNK }), trunks),
      buildInstances(new ConeGeometry(2.5, 4.6, 6), new MeshStandardMaterial({ color: "#ffffff" }), crowns),
    ];
  }, []);
  useDisposable(meshes[0]);
  useDisposable(meshes[1]);
  return (
    <>
      <primitive object={meshes[0]} />
      <primitive object={meshes[1]} />
    </>
  );
}

/* ── Skärgård: öar i vattnet, en av dem med fyr ────────────────────── */

const ISLETS = [
  { x: -370, z: 490, r: 30, fy: 0.3 },
  { x: 150, z: 505, r: 22, fy: 0.26 },
  { x: 405, z: 475, r: 26, fy: 0.34 },
];

function Islets() {
  const geo = useMerged(() => {
    const rand = makeRand(777);
    const parts: BufferGeometry[] = [];
    for (const isl of ISLETS) {
      const rock = new SphereGeometry(isl.r, 12, 9);
      rock.scale(1.25, isl.fy, 1);
      rock.translate(isl.x, 0.4, isl.z);
      parts.push(withColor(rock, new Color("#8fa075")));
      // Ett par träd per ö, placerade på öns höjdprofil.
      for (let i = 0; i < 3; i++) {
        const dx = (rand() - 0.5) * isl.r * 0.9;
        const dz = (rand() - 0.5) * isl.r * 0.7;
        const dist = Math.sqrt((dx / 1.25) ** 2 + dz ** 2);
        const y = isl.fy * Math.sqrt(Math.max(0, isl.r ** 2 - dist ** 2)) + 0.4;
        const s = 0.9 + rand() * 0.6;
        const trunk = new CylinderGeometry(0.35 * s, 0.5 * s, 2.2 * s, 5);
        trunk.translate(isl.x + dx, y + 1.1 * s, isl.z + dz);
        parts.push(withColor(trunk, new Color(TREE_TRUNK)));
        const crown = new ConeGeometry(2.5 * s, 4.6 * s, 6);
        crown.translate(isl.x + dx, y + 3.5 * s, isl.z + dz);
        parts.push(withColor(crown, new Color(TREE_GREENS[i % TREE_GREENS.length])));
      }
    }
    return parts;
  });
  const fyr = ISLETS[2];
  const fyrY = fyr.fy * fyr.r + 0.4;
  return (
    <>
      {geo && <mesh geometry={geo} material={LAND_MAT} />}
      {/* Fyren – vit med röd topp och lanternin. */}
      <group position={[fyr.x, fyrY, fyr.z - 4]}>
        <mesh position={[0, 5, 0]}>
          <cylinderGeometry args={[1.6, 2.2, 10, 10]} />
          <meshStandardMaterial color="#f2efe6" />
        </mesh>
        <mesh position={[0, 10.6, 0]}>
          <cylinderGeometry args={[1.2, 1.2, 1.4, 10]} />
          <meshStandardMaterial color="#ffe9a8" emissive="#ffd45e" emissiveIntensity={0.7} />
        </mesh>
        <mesh position={[0, 11.9, 0]}>
          <coneGeometry args={[1.5, 1.6, 10]} />
          <meshStandardMaterial color="#b6413a" />
        </mesh>
      </group>
    </>
  );
}

/* ── Vindkraftverk på slätten öster om Industriområdet ─────────────── */

function Turbine({ x, z, phase }: { x: number; z: number; phase: number }) {
  const rotor = useRef<Group>(null);
  useFrame((state) => {
    if (rotor.current) rotor.current.rotation.z = state.clock.elapsedTime * 0.9 + phase;
  });
  return (
    // Vänd mot staden i sydväst.
    <group position={[x, 0, z]} rotation-y={Math.PI * 0.75}>
      <mesh position={[0, 14, 0]}>
        <cylinderGeometry args={[0.5, 1.1, 28, 8]} />
        <meshStandardMaterial color="#e8ebee" />
      </mesh>
      <mesh position={[0, 28, 1]}>
        <boxGeometry args={[1.6, 1.6, 3]} />
        <meshStandardMaterial color="#dfe3e7" />
      </mesh>
      <group ref={rotor} position={[0, 28, 2.6]}>
        {[0, 1, 2].map((i) => (
          <group key={i} rotation-z={(i * Math.PI * 2) / 3}>
            <mesh position={[0, 6.8, 0]}>
              <boxGeometry args={[1.1, 13, 0.25]} />
              <meshStandardMaterial color="#f4f6f8" />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function WindTurbines() {
  return (
    <>
      <Turbine x={600} z={-330} phase={0} />
      <Turbine x={668} z={-238} phase={2.1} />
      <Turbine x={615} z={-140} phase={4.4} />
    </>
  );
}

/** Hela landskapet runt staden. */
export function Backdrop() {
  return (
    <>
      <Fields />
      <Hills />
      <Mountains />
      <ForestBelt />
      <Islets />
      <WindTurbines />
    </>
  );
}
