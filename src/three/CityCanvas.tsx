import { Html, MapControls, Sky } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, type PlaneGeometry } from "three";
import { DISTRICT_ZONES, PARCELS } from "../engine/city";
import { DISTRICTS } from "../engine/data";
import { propMarketValue, propNOI } from "../engine/property";
import type { GameState, Property } from "../engine/types";
import { useGameStore } from "../store/gameStore";
import type { OverlayMode } from "../store/uiStore";
import { useUiStore } from "../store/uiStore";
import { CameraRig } from "./CameraRig";
import { Birds, Clouds, Harbor, Landmarks } from "./CityExtras";
import { Headquarters } from "./Headquarters";
import { DISTRICT_TINTS, GROUND, SKY, WATER } from "./colors";
import { groundTexture } from "./textures";
import type { ParcelContent } from "./ParcelNode";
import { ParcelNode } from "./ParcelNode";
import { LocalTraffic, Roads, ZoneStreetGrid } from "./Roads";

const LABEL_STYLE: React.CSSProperties = {
  pointerEvents: "none",
  fontFamily: "'Inter', system-ui, sans-serif",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 3,
  textTransform: "uppercase",
  color: "#4c5551",
  whiteSpace: "nowrap",
  textShadow: "0 1px 3px rgba(255,255,255,0.7)",
};

function DistrictPlates() {
  return (
    <>
      {DISTRICT_ZONES.map((z) => (
        <group key={z.district} position={[z.x, 0, z.z]}>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} receiveShadow>
            <planeGeometry args={[z.w + 16, z.d + 16]} />
            <meshStandardMaterial color={DISTRICT_TINTS[z.district] ?? "#bcbcb0"} />
          </mesh>
          <Html position={[0, 1, -(z.d / 2 + 16)]} center zIndexRange={[20, 0]}>
            <div style={LABEL_STYLE}>
              {DISTRICTS.find((d) => d.id === z.district)?.name ?? z.district}
            </div>
          </Html>
        </group>
      ))}
    </>
  );
}

/** Grön→röd tint efter vald metrik (1 = grönt, 0 = rött). */
function overlayTint(p: Property, state: GameState, mode: OverlayMode): string {
  let score = 1;
  if (mode === "vakans") score = p.capacity ? p.tenants.length / p.capacity : 1;
  else if (mode === "skick") score = p.condition / 100;
  else if (mode === "avkastning")
    score = (propNOI(p, state) / Math.max(1, propMarketValue(p, state))) / 0.07;
  score = Math.max(0, Math.min(1, score));
  return `#${new Color().setHSL(0.33 * score, 0.62, 0.42).getHexString()}`;
}

function CityParcels() {
  const state = useGameStore((s) => s.state);
  const overlay = useUiStore((s) => s.overlay);
  const { portfolio, listings, lots, competitors } = state;

  const byParcel = useMemo(() => {
    const m = new Map<string, ParcelContent>();
    for (const p of portfolio)
      if (p.parcelId)
        m.set(p.parcelId, {
          kind: "owned",
          prop: p,
          tint: overlay !== "ingen" ? overlayTint(p, state, overlay) : undefined,
        });
    for (const p of listings) if (p.parcelId) m.set(p.parcelId, { kind: "listing", prop: p });
    for (const l of lots)
      if (l.parcelId) m.set(l.parcelId, { kind: l.owned ? "lotOwned" : "lotForSale", lot: l });
    competitors.forEach((c, i) => {
      for (const p of c.portfolio)
        if (p.parcelId) m.set(p.parcelId, { kind: "rival", prop: p, owner: c.name, ownerIndex: i });
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio, listings, lots, competitors, overlay, state.marketMod, state.demandMod]);

  return (
    <>
      {PARCELS.map((pc) => (
        <ParcelNode key={pc.id} parcel={pc} content={byParcel.get(pc.id)} />
      ))}
    </>
  );
}

/** Havsyta med mjuk dyning – vertexvågor + låg roughness ger solglitter. */
function Water() {
  const geo = useRef<PlaneGeometry>(null);
  useFrame(({ clock }) => {
    const g = geo.current;
    if (!g) return;
    const pos = g.attributes.position;
    const t = clock.elapsedTime;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(
        i,
        Math.sin(x * 0.045 + t * 0.8) * 0.32 +
          Math.cos((y + x * 0.35) * 0.07 + t * 0.55) * 0.22,
      );
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position={[20, -0.3, 430]}>
      <planeGeometry ref={geo} args={[900, 220, 64, 16]} />
      <meshStandardMaterial color={WATER} roughness={0.32} metalness={0.08} />
    </mesh>
  );
}

/** Solens riktning – delas av himmel och nyckelljus så de aldrig divergerar. */
const SUN = [260, 230, 120] as const;

/** Hela 3D-stadsvyn. Ren renderare av GameState – ingen spellogik här. */
export function CityCanvas() {
  const select = useUiStore((s) => s.select);
  const ground = useMemo(() => groundTexture(26), []);
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      camera={{ position: [230, 300, 430], fov: 38, near: 1, far: 3000 }}
      onPointerMissed={() => select(null)}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.22;
      }}
    >
      <fog attach="fog" args={[SKY, 800, 1900]} />
      {/* Procedurell atmosfär – ger horisontdis och naturlig himmelsgradient. */}
      <Sky
        distance={4000}
        sunPosition={[SUN[0], SUN[1], SUN[2]]}
        turbidity={5.5}
        rayleigh={1.6}
        mieCoefficient={0.004}
        mieDirectionalG={0.75}
      />
      <ambientLight intensity={0.48} />
      <hemisphereLight args={["#bfd6ea", "#939781", 0.6]} />
      {/* Varmt nyckelljus (sen eftermiddag) + kallt fyllnadsljus från motsatt håll. */}
      <directionalLight
        position={[SUN[0], SUN[1], SUN[2]]}
        color="#ffe7c4"
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-540}
        shadow-camera-right={540}
        shadow-camera-top={540}
        shadow-camera-bottom={-540}
        shadow-camera-far={1400}
      />
      <directionalLight position={[-200, 140, -180]} color="#b9cce0" intensity={0.5} />
      <MapControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2.25}
        minDistance={60}
        maxDistance={1000}
      />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[2600, 2600]} />
        <meshStandardMaterial color={GROUND} map={ground} roughness={1} />
      </mesh>
      {/* Vatten söder om Hamnen. */}
      <Water />
      <Roads />
      <DistrictPlates />
      <ZoneStreetGrid />
      <CityParcels />
      <Harbor />
      <Landmarks />
      <Headquarters />
      <Clouds />
      <Birds />
      <LocalTraffic />
      <CameraRig />
    </Canvas>
  );
}
