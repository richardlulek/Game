import { Html, MapControls, Sky } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import { Color, MeshStandardMaterial } from "three";

/** Minimal typ för onBeforeCompile-shadern (three exporterar ingen). */
interface WaveShader {
  uniforms: Record<string, { value: number }>;
  vertexShader: string;
}
import { DISTRICT_ZONES, PARCELS, parcelById } from "../engine/city";
import { DISTRICTS } from "../engine/data";
import { propMarketValue, propNOI } from "../engine/property";
import type { GameState, Property } from "../engine/types";
import { useGameStore } from "../store/gameStore";
import type { OverlayMode } from "../store/uiStore";
import { useUiStore } from "../store/uiStore";
import { Backdrop } from "./Backdrop";
import { CameraRig } from "./CameraRig";
import { Birds, Clouds, Harbor, Landmarks } from "./CityExtras";
import { Headquarters } from "./Headquarters";
import { OwnerLuxuries } from "./OwnerLuxuries";
import { DISTRICT_TINTS, GROUND, SKY, WATER } from "./colors";
import { groundTexture } from "./textures";
import type { ParcelContent } from "./ParcelNode";
import { ParcelNode } from "./ParcelNode";
import { Roads, Traffic } from "./Roads";
import { StaticCity } from "./StaticCity";

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
    const goldBlocks = new Set(state.ownedBlocks ?? []);
    // Fastigheter med inkommet bud (enskilt eller via paket) får 📨-ikon.
    const offerIds = new Set<number>();
    for (const o of state.offers ?? []) {
      offerIds.add(o.propId);
      for (const id of o.propertyIds ?? []) offerIds.add(id);
    }
    for (const p of portfolio)
      if (p.parcelId)
        m.set(p.parcelId, {
          kind: "owned",
          prop: p,
          tint: overlay !== "ingen" ? overlayTint(p, state, overlay) : undefined,
          blockOwned: goldBlocks.has(parcelById(p.parcelId)?.blockId ?? ""),
          hasOffer: offerIds.has(p.id),
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
  }, [portfolio, listings, lots, competitors, overlay, state.marketMod, state.demandMod, state.offers]);

  // Statisk stad: allt icke-interaktivt instansieras/sammanslås.
  // Identiteten måste vara innehållsstabil: byParcel byggs om varje
  // månad (marknadsläget ändras), men de sammanslagna geometrierna
  // ska bara byggas om när tomtupptagningen faktiskt ändras.
  const occupiedKey = useMemo(() => [...byParcel.keys()].sort().join(","), [byParcel]);
  const occupied = useMemo(
    () => new Set(occupiedKey ? occupiedKey.split(",") : []),
    [occupiedKey],
  );
  const lockedBlocks = useMemo(() => {
    const unlocked = new Set(state.unlockedBlocks ?? []);
    const locked = new Set<string>();
    for (const p of PARCELS) if (p.expansion && !unlocked.has(p.blockId)) locked.add(p.blockId);
    return locked;
  }, [state.unlockedBlocks]);
  // Organiskt framvuxna dekorhus – identiteten följer arrayen i state.
  const grown = useMemo(() => new Set(state.ambientGrown ?? []), [state.ambientGrown]);

  return (
    <>
      <StaticCity occupied={occupied} lockedBlocks={lockedBlocks} grown={grown} />
      {PARCELS.map((pc) => (
        <ParcelNode key={pc.id} parcel={pc} content={byParcel.get(pc.id)} />
      ))}
    </>
  );
}

/** Havsyta med mjuk dyning – vågorna räknas i vertex-shadern (GPU)
 *  med analytiska normaler, i stället för en CPU-loop per bildruta. */
function Water() {
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ color: WATER, roughness: 0.32, metalness: 0.08 });
    m.onBeforeCompile = (shader: WaveShader) => {
      shader.uniforms.uTime = { value: 0 };
      m.userData.shader = shader;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           uniform float uTime;
           // h(x,y) = A·sin(ax + bt) + B·cos(c(y + 0.35x) + dt)
           float waveH(vec2 p) {
             return sin(p.x * 0.045 + uTime * 0.8) * 0.22 +
                    cos((p.y + p.x * 0.35) * 0.07 + uTime * 0.55) * 0.15;
           }`,
        )
        .replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>
           {
             float ph2 = (position.y + position.x * 0.35) * 0.07 + uTime * 0.55;
             float dhdx = 0.22 * 0.045 * cos(position.x * 0.045 + uTime * 0.8)
                        - 0.15 * 0.07 * 0.35 * sin(ph2);
             float dhdy = -0.15 * 0.07 * sin(ph2);
             objectNormal = normalize(vec3(-dhdx, -dhdy, 1.0));
           }`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           transformed.z += waveH(position.xy);`,
        );
    };
    return m;
  }, []);
  useFrame(({ clock }) => {
    const shader = material.userData.shader as WaveShader | undefined;
    if (shader) shader.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    // Ytan ligger ÖVER markplanet (−0.05): med basen på 0.5 och vågor
    // om ±0.37 håller sig hela havet synligt (0.13–0.87) och under
    // kajkantens topp (1.0) – tidigare låg basen på −0.3 så att bara
    // vågtopparna stack upp genom marken som blå fläckar.
    <mesh rotation-x={-Math.PI / 2} position={[20, 0.5, 485]} material={material}>
      <planeGeometry args={[1800, 330, 96, 20]} />
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
      camera={{ position: [230, 300, 430], fov: 38, near: 5, far: 3000 }}
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
      {/* Landskapet utanför staden: åkrar, skog, kullar, berg, skärgård. */}
      <Backdrop />
      <Roads />
      <DistrictPlates />
      <CityParcels />
      <Harbor />
      <Landmarks />
      <Headquarters />
      <OwnerLuxuries />
      <Clouds />
      <Birds />
      <Traffic />
      <CameraRig />
    </Canvas>
  );
}
