/* ============================================================
   Vägnätet – instansierat. Körbanor, mittlinjer, övergångs-
   ställen och gatlyktor är statiska och ritas som en handfull
   InstancedMesh:ar. Trafiken är två dynamiska InstancedMesh:ar
   (kaross + hytt) vars matriser uppdateras per bildruta.
   ============================================================ */

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
} from "three";
import { DISTRICT_ZONES, ZONE_STREETS } from "../engine/city";
import { ROADS, type RoadSeg } from "./roadNet";
import { CAR_COLORS, ROAD, ROAD_DASH } from "./colors";

interface Inst {
  x: number; y: number; z: number;
  sx?: number; sy?: number; sz?: number;
  rotY?: number;
  color?: Color;
}

/** Statisk InstancedMesh: plan (roterad platt mot marken) eller volym. */
function buildStatic(
  geo: PlaneGeometry | BoxGeometry | CylinderGeometry | SphereGeometry,
  mat: MeshBasicMaterial | MeshStandardMaterial,
  items: Inst[],
  opts: { flat?: boolean; cast?: boolean; receive?: boolean } = {},
): InstancedMesh {
  const mesh = new InstancedMesh(geo, mat, items.length);
  const o = new Object3D();
  items.forEach((it, i) => {
    o.position.set(it.x, it.y, it.z);
    o.rotation.set(opts.flat ? -Math.PI / 2 : 0, 0, 0);
    if (it.rotY) {
      if (opts.flat) o.rotation.z = it.rotY; // planet ligger i XY före rotationen
      else o.rotation.y = it.rotY;
    }
    o.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    if (it.color) mesh.setColorAt(i, it.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = opts.cast ?? false;
  mesh.receiveShadow = opts.receive ?? false;
  return mesh;
}

function useDispose(...meshes: InstancedMesh[]) {
  useEffect(() => {
    return () => {
      for (const m of meshes) {
        m.geometry.dispose();
        m.dispose();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, meshes);
}

/* ── Statisk väggeometri ───────────────────────────────────────────── */

/** Alla körbanor (huvudleder + kvartersgator) i EN instansierad mesh. */
function RoadSurfaces() {
  const mesh = useMemo(() => {
    // Rejäl höjdseparation mellan lagren – tätare avstånd z-fightar
    // (blinkar) på kameraavstånd eftersom djupbuffertens upplösning
    // är begränsad över en 3000-enheters vy.
    const items: Inst[] = [
      ...ROADS.map((s) => ({ x: s.x, y: 0.06, z: s.z, sx: s.w, sy: s.d })),
      ...ZONE_STREETS.map((s) => ({ x: s.x, y: 0.045, z: s.z, sx: s.w, sy: s.d })),
    ];
    return buildStatic(
      new PlaneGeometry(1, 1),
      new MeshStandardMaterial({ color: ROAD, roughness: 0.95 }),
      items,
      { flat: true, receive: true },
    );
  }, []);
  useDispose(mesh);
  return <primitive object={mesh} />;
}

/** Mittlinjer + övergångsställen – två instansierade planmeshar. */
function RoadMarkings() {
  const meshes = useMemo(() => {
    const dashes: Inst[] = [];
    const stripes: Inst[] = [];
    for (const seg of ROADS) {
      const horizontal = seg.w > seg.d;
      const len = horizontal ? seg.w : seg.d;
      // Mittlinjens streck
      const count = Math.max(2, Math.floor(len / 12));
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count - 0.5;
        dashes.push({
          x: seg.x + (horizontal ? t * len : 0),
          y: 0.11,
          z: seg.z + (horizontal ? 0 : t * len),
          sx: horizontal ? 5 : 0.9,
          sy: horizontal ? 0.9 : 5,
        });
      }
      // Zebrafält i båda ändar
      for (const end of [-1, 1] as const) {
        const across = (horizontal ? seg.d : seg.w) - 3;
        const n = Math.max(3, Math.floor(across / 2.4));
        const alongPos = end * (len / 2 - 3.4);
        for (let i = 0; i < n; i++) {
          const t = ((i + 0.5) / n - 0.5) * across;
          stripes.push({
            x: seg.x + (horizontal ? alongPos : t),
            y: 0.12,
            z: seg.z + (horizontal ? t : alongPos),
            sx: horizontal ? 2.2 : 1.3,
            sy: horizontal ? 1.3 : 2.2,
          });
        }
      }
    }
    return [
      buildStatic(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: ROAD_DASH }), dashes, { flat: true }),
      buildStatic(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: "#dfdcd2" }), stripes, { flat: true }),
    ];
  }, []);
  useDispose(...meshes);
  return (
    <>
      <primitive object={meshes[0]} />
      <primitive object={meshes[1]} />
    </>
  );
}

/** Gatlyktor längs huvudlederna – stolpe, arm och lysande klot. */
function StreetLamps() {
  const meshes = useMemo(() => {
    const poles: Inst[] = [];
    const arms: Inst[] = [];
    const bulbs: Inst[] = [];
    for (const seg of ROADS) {
      const horizontal = seg.w > seg.d;
      const len = horizontal ? seg.w : seg.d;
      const count = Math.max(2, Math.floor(len / 36));
      const edge = (horizontal ? seg.d : seg.w) / 2 + 1.6;
      for (let i = 0; i < count; i++) {
        const t = ((i + 0.5) / count - 0.5) * (len - 10);
        const side = i % 2 === 0 ? 1 : -1;
        const x = seg.x + (horizontal ? t : edge * side);
        const z = seg.z + (horizontal ? edge * side : t);
        // Armen pekar in mot vägbanan (jfr gamla StreetLamp-komponenten).
        const rotY = horizontal ? Math.PI / 2 : 0;
        const armSide = horizontal ? side : -side;
        const dirX = Math.cos(rotY) * armSide;
        const dirZ = -Math.sin(rotY) * armSide;
        poles.push({ x, y: 3.4, z });
        arms.push({ x: x + dirX * 1.1, y: 6.7, z: z + dirZ * 1.1, rotY });
        bulbs.push({ x: x + dirX * 2.1, y: 6.55, z: z + dirZ * 2.1 });
      }
    }
    const metal = new MeshStandardMaterial({ color: "#3d4348", roughness: 0.6, metalness: 0.4 });
    return [
      buildStatic(new CylinderGeometry(0.12, 0.18, 6.8, 6), metal, poles, { cast: true }),
      buildStatic(new BoxGeometry(2.2, 0.14, 0.14), metal, arms, {}),
      buildStatic(
        new SphereGeometry(0.34, 8, 6),
        new MeshStandardMaterial({ color: "#ffe9c0", emissive: "#ffca6e", emissiveIntensity: 0.9 }),
        bulbs,
        {},
      ),
    ];
  }, []);
  useDispose(...meshes);
  return (
    <>
      <primitive object={meshes[0]} />
      <primitive object={meshes[1]} />
      <primitive object={meshes[2]} />
    </>
  );
}

/** Infartsstumpar: låga betongkantstenar som ramar in den smala kvarters-
 *  gatans mynning där en bred huvudled möter en distriktskant. Förankras på
 *  den verkliga kvartersgatan (ZONE_STREETS), så övergången bred led →
 *  smal lokalgata blir tydlig. Härleds ur väg- och gatudatan. */
function JunctionKerbs() {
  const mesh = useMemo(() => {
    const box = (o: { x: number; z: number; w: number; d: number }) => ({
      x0: o.x - o.w / 2, x1: o.x + o.w / 2, z0: o.z - o.d / 2, z1: o.z + o.d / 2,
    });
    const inter = (a: ReturnType<typeof box>, b: ReturnType<typeof box>, m = 2) =>
      a.x0 < b.x1 - m && a.x1 > b.x0 + m && a.z0 < b.z1 - m && a.z1 > b.z0 + m;
    const L = 15, CW = 1.6, H = 0.5;
    const items: Inst[] = [];
    for (const r of ROADS) {
      const vert = r.d > r.w;
      const rb = box(r);
      for (const z of DISTRICT_ZONES) {
        const zb = box(z);
        if (!inter(rb, zb)) continue;
        // Distriktets kvartersgata med samma riktning som leden, närmast leden.
        const streets = ZONE_STREETS.filter(
          (s) => s.district === z.district && (s.d > s.w) === vert,
        );
        if (!streets.length) continue;
        const coord = vert ? r.x : r.z;
        const s = streets.reduce((a, b) =>
          Math.abs((vert ? b.x : b.z) - coord) < Math.abs((vert ? a.x : a.z) - coord) ? b : a,
        );
        if (vert) {
          const edgeZ = r.z < z.z ? zb.z0 : zb.z1;
          for (const side of [-1, 1] as const)
            items.push({ x: s.x + side * (s.w / 2 + CW / 2), y: H / 2, z: edgeZ, sx: CW, sy: H, sz: L });
        } else {
          const edgeX = r.x < z.x ? zb.x0 : zb.x1;
          for (const side of [-1, 1] as const)
            items.push({ x: edgeX, y: H / 2, z: s.z + side * (s.d / 2 + CW / 2), sx: L, sy: H, sz: CW });
        }
      }
    }
    return buildStatic(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: "#c9c4b6", roughness: 0.9 }),
      items,
      { cast: false, receive: true },
    );
  }, []);
  useDispose(mesh);
  return <primitive object={mesh} />;
}

/** Huvudlederna mellan distrikten + kvartersgator, allt statiskt. */
export function Roads() {
  return (
    <>
      <RoadSurfaces />
      <RoadMarkings />
      <JunctionKerbs />
      <StreetLamps />
    </>
  );
}

/* ── Trafik: dynamisk instansiering ────────────────────────────────── */

interface CarSpec {
  seg: RoadSeg;
  offset: number;
  speed: number;
  color: Color;
}

/** Alla bilar (huvudleder + lokalgator) i två InstancedMesh:ar. */
export function Traffic() {
  const specs = useMemo<CarSpec[]>(() => {
    const out: CarSpec[] = [];
    ROADS.forEach((seg, i) => {
      out.push({ seg, offset: i * 0.7, speed: 0.11 + (i % 3) * 0.03, color: new Color(CAR_COLORS[i % CAR_COLORS.length]) });
      if (Math.max(seg.w, seg.d) > 60)
        out.push({ seg, offset: i * 0.7 + 1.1, speed: 0.09 + ((i + 1) % 3) * 0.03, color: new Color(CAR_COLORS[(i + 3) % CAR_COLORS.length]) });
    });
    // Var femte kvartersgata får en bil – deterministiskt urval.
    ZONE_STREETS.filter((_, i) => i % 5 === 2).forEach((s, i) => {
      out.push({
        seg: { x: s.x, z: s.z, w: s.w, d: s.d },
        offset: i * 0.83 + 0.4,
        speed: 0.05 + (i % 3) * 0.015,
        color: new Color(CAR_COLORS[(i + 2) % CAR_COLORS.length]),
      });
    });
    return out;
  }, []);

  const meshes = useMemo(() => {
    const bodyMat = new MeshStandardMaterial({ color: "#ffffff" });
    const cabinMat = new MeshStandardMaterial({ color: "#dce4e8" });
    const bodies = new InstancedMesh(new BoxGeometry(3.4, 1.1, 1.7), bodyMat, specs.length);
    const cabins = new InstancedMesh(new BoxGeometry(1.7, 0.7, 1.5), cabinMat, specs.length);
    bodies.castShadow = true;
    specs.forEach((c, i) => bodies.setColorAt(i, c.color));
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    return [bodies, cabins];
  }, [specs]);
  useDispose(...meshes);

  const scratch = useMemo(() => new Object3D(), []);
  useFrame((state) => {
    const [bodies, cabins] = meshes;
    const o = scratch;
    specs.forEach((c, i) => {
      const horizontal = c.seg.w > c.seg.d;
      const len = (horizontal ? c.seg.w : c.seg.d) - 6;
      const t = state.clock.elapsedTime * c.speed + c.offset;
      const phase = t % 2;
      const k = phase < 1 ? phase : 2 - phase;
      const forward = phase < 1;
      const along = (k - 0.5) * len;
      const lane = forward ? 2.6 : -2.6;
      if (horizontal) {
        o.position.set(c.seg.x + along, 0, c.seg.z + lane);
        o.rotation.y = forward ? 0 : Math.PI;
      } else {
        o.position.set(c.seg.x + lane, 0, c.seg.z + along);
        o.rotation.y = forward ? -Math.PI / 2 : Math.PI / 2;
      }
      // Kaross
      o.position.y = 0.75;
      o.updateMatrix();
      bodies.setMatrixAt(i, o.matrix);
      // Hytt: lokal offset (−0.2 bakåt, upp till 1.5) i bilens riktning
      o.position.set(
        o.position.x + Math.cos(o.rotation.y) * -0.2,
        1.5,
        o.position.z - Math.sin(o.rotation.y) * -0.2,
      );
      o.updateMatrix();
      cabins.setMatrixAt(i, o.matrix);
    });
    bodies.instanceMatrix.needsUpdate = true;
    cabins.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <primitive object={meshes[0]} />
      <primitive object={meshes[1]} />
    </>
  );
}
